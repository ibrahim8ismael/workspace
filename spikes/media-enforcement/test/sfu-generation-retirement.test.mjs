import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermitState } from '../permit-state.mjs';
import { retireSfuGeneration } from '../sfu-generation-retirement.mjs';

test('generation retirement disconnects members and confirms a second empty observation', async () => {
  const participants = [{ identity: 'a' }, { identity: 'b' }];
  let roomExists = true;
  let now = 0;
  let listCount = 0;
  const service = {
    async listRooms() {
      listCount += 1;
      return roomExists ? [{ name: 'old-generation', numParticipants: participants.length }] : [];
    },
    async listParticipants() {
      return [...participants];
    },
    async removeParticipant(_room, identity) {
      const index = participants.findIndex((participant) => participant.identity === identity);
      if (index >= 0) participants.splice(index, 1);
    },
    async deleteRoom() {
      roomExists = false;
    },
  };

  const result = await retireSfuGeneration({
    roomService: service,
    generation: 'old-generation',
    clock: () => now,
    sleep: async (duration) => {
      now += duration;
    },
  });

  assert.equal(result.retired, true);
  assert.equal(participants.length, 0);
  assert.ok(listCount >= 3);
});

test('participant-list failure cannot be mistaken for an empty generation or install replacement permits', async () => {
  let now = 0;
  const state = new PermitState('epoch', () => now);
  const current = {
    generation: 'old-generation',
    identity: 'user-a',
    room: 'old-generation',
    version: 1,
    sources: ['microphone'],
  };
  const replacement = { ...current, generation: 'new-generation', room: 'new-generation' };
  const initial = state.beginPull('initial');
  assert.equal(state.install({ ...initial, sequence: 1, permits: [current] }), true);

  const failure = await retireSfuGeneration({
    roomService: {
      async listRooms() {
        return [{ name: 'old-generation', numParticipants: 1 }];
      },
      async listParticipants() {
        throw new Error('temporary SFU API failure');
      },
    },
    generation: 'old-generation',
  });
  assert.equal(failure.retired, false);

  const next = state.beginPull('replacement');
  assert.equal(
    await state.installWithRetirement(
      { ...next, sequence: 2, permits: [replacement] },
      async () => failure.retired,
    ),
    false,
  );
  assert.equal(state.allows({ ...current, source: 'microphone' }), false);
  assert.equal(state.allows({ ...replacement, source: 'microphone' }), false);
});

test('inconsistent nonzero room count fails closed after the bounded deadline', async () => {
  let now = 0;
  const result = await retireSfuGeneration({
    roomService: {
      async listRooms() {
        return [{ name: 'old-generation', numParticipants: 1 }];
      },
      async listParticipants() {
        return [];
      },
      async deleteRoom() {},
    },
    generation: 'old-generation',
    timeoutMs: 200,
    clock: () => now,
    sleep: async (duration) => {
      now += duration;
    },
  });
  assert.equal(result.retired, false);
  assert.ok(result.durationMs >= 200);
});
