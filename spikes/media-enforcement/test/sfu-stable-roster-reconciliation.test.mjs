import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackSource } from '../../../apps/api/node_modules/livekit-server-sdk/dist/index.js';
import { reconcileSfuStableRoster } from '../sfu-stable-roster-reconciliation.mjs';

const generation = 'stable-meeting-room';
const identity = 'participant-one';
const sources = ['microphone'];

function fixture(initialSources, initialTracks = []) {
  let now = 0;
  const participant = {
    identity,
    metadata: JSON.stringify({ gatherMediaVersion: 7 }),
    permission: {
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      hidden: false,
      recorder: false,
      canPublishSources: [...initialSources],
    },
    tracks: [...initialTracks],
  };
  const calls = [];
  const roomService = {
    async listRooms(names) {
      assert.deepEqual(names, [generation]);
      return [{ name: generation }];
    },
    async listParticipants(room) {
      assert.equal(room, generation);
      return [participant];
    },
    async updateParticipant(room, target, options) {
      calls.push({ room, target, options });
      participant.permission = options.permission;
      participant.tracks = participant.tracks.filter((track) =>
        participant.permission.canPublishSources.includes(track.source),
      );
      return participant;
    },
  };
  return {
    calls,
    participant,
    roomService,
    clock: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  };
}

test('reconciles presenter grant and revoke through stable participant permissions', async () => {
  const screenTrack = { sid: 'TR_screen', source: TrackSource.SCREEN_SHARE };
  const state = fixture([TrackSource.MICROPHONE], []);
  const grant = await reconcileSfuStableRoster({
    roomService: state.roomService,
    generation,
    permits: [{ identity, version: 7, sources: ['microphone', 'screen_share'] }],
    clock: state.clock,
    sleep: state.sleep,
  });
  assert.equal(grant.reconciled, true);
  assert.equal(grant.removed, 0);
  assert.equal(grant.permissionsUpdated, 1);
  assert.deepEqual(state.participant.permission.canPublishSources, [
    TrackSource.MICROPHONE,
    TrackSource.SCREEN_SHARE,
  ]);
  assert.equal(state.participant.permission.canSubscribe, true);
  assert.equal(state.participant.permission.canPublishData, false);

  state.participant.tracks.push(screenTrack);
  const revoke = await reconcileSfuStableRoster({
    roomService: state.roomService,
    generation,
    permits: [{ identity, version: 7, sources }],
    clock: state.clock,
    sleep: state.sleep,
  });
  assert.equal(revoke.reconciled, true);
  assert.equal(revoke.removed, 0);
  assert.equal(revoke.permissionsUpdated, 1);
  assert.deepEqual(state.participant.permission.canPublishSources, [TrackSource.MICROPHONE]);
  assert.equal(state.participant.permission.canSubscribe, true);
  assert.equal(state.participant.permission.canPublishData, false);
  assert.deepEqual(state.participant.tracks, []);
  assert.equal(state.calls.length, 2);
});

test('fails closed when LiveKit cannot apply a source permission change', async () => {
  let now = 0;
  const participant = {
    identity,
    metadata: JSON.stringify({ gatherMediaVersion: 7 }),
    permission: {
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE],
    },
    tracks: [],
  };
  const result = await reconcileSfuStableRoster({
    roomService: {
      async listRooms() {
        return [{ name: generation }];
      },
      async listParticipants() {
        return [participant];
      },
      async updateParticipant() {
        throw new Error('LiveKit control plane unavailable');
      },
    },
    generation,
    permits: [{ identity, version: 7, sources }],
    timeoutMs: 150,
    clock: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  assert.equal(result.reconciled, false);
  assert.equal(result.permissionsUpdated, 0);
});

test('fails closed rather than replacing participant permissions when they cannot be preserved', async () => {
  let now = 0;
  let permissionUpdates = 0;
  const result = await reconcileSfuStableRoster({
    roomService: {
      async listRooms() {
        return [{ name: generation }];
      },
      async listParticipants() {
        return [
          {
            identity,
            metadata: JSON.stringify({ gatherMediaVersion: 7 }),
            tracks: [],
          },
        ];
      },
      async updateParticipant() {
        permissionUpdates += 1;
      },
    },
    generation,
    permits: [{ identity, version: 7, sources: ['microphone', 'screen_share'] }],
    timeoutMs: 150,
    clock: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  assert.equal(result.reconciled, false);
  assert.equal(permissionUpdates, 0);
});

test('rejects malformed publication-source policy before touching LiveKit', async () => {
  let touched = false;
  const result = await reconcileSfuStableRoster({
    roomService: {
      async listRooms() {
        touched = true;
        return [];
      },
    },
    generation,
    permits: [{ identity, version: 7, sources: ['microphone', 'screen_share_audio'] }],
  });
  assert.equal(result.reconciled, false);
  assert.equal(touched, false);
});
