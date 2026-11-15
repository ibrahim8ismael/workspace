import { describe, expect, it } from 'vitest';
import { conversationUpdateSchema, OFFICE_LIMITS } from '@gather/contracts';
import {
  PROXIMITY_EXIT_DEBOUNCE_MS,
  PROXIMITY_MAX_PARTICIPANTS,
  ProximityPairing,
  type ProximityCandidate,
} from '../dist/modules/office/runtime/proximity-pairing.js';

const officeEpoch = '98ff100b-f4f2-4896-81ef-11106d315b9e';
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';
const d = '44444444-4444-4444-8444-444444444444';
const e = '55555555-5555-4555-8555-555555555555';
const f = '66666666-6666-4666-8666-666666666666';
const g = '77777777-7777-4777-8777-777777777777';

function candidate(
  participationId: string,
  socketId: string,
  x: number,
  availability: ProximityCandidate['availability'] = 'available',
): ProximityCandidate {
  return {
    participationId,
    socketId,
    displayName: `Person ${participationId[0]}`,
    availability,
    position: { x, y: 64 },
  };
}

function join(pairing: ProximityPairing, people: readonly ProximityCandidate[]) {
  const notices = people.map((person, index) =>
    pairing.setOptIn(person.participationId, true, people, index + 10),
  );
  return notices.flat();
}

describe('proximity voice groups', () => {
  it('pairs two available people who opted in and keeps the roster private', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const people = [candidate(a, 'socket-a', 64), candidate(b, 'socket-b', 96)];

    expect(pairing.setOptIn(a, true, people, 10)).toEqual([]);
    const notices = pairing.setOptIn(b, true, people, 11);

    expect(notices).toHaveLength(1);
    expect(notices[0]?.socketIds).toEqual(['socket-a', 'socket-b']);
    expect(notices[0]?.update).toMatchObject({
      officeEpoch,
      kind: 'proximity',
      state: 'joining',
      mediaReady: false,
      participants: [
        { participationId: a, displayName: `Person ${a[0]}` },
        { participationId: b, displayName: `Person ${b[0]}` },
      ],
    });
    expect(conversationUpdateSchema.safeParse(notices[0]?.update).success).toBe(true);
    expect(JSON.stringify(notices[0]?.update)).not.toContain('socket-');
  });

  it('keeps deterministic nearest matching when no existing group can accept the third person', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const people = [
      candidate(a, 'socket-a', 0),
      candidate(b, 'socket-b', 128),
      candidate(c, 'socket-c', 80),
    ];
    pairing.setOptIn(a, true, people, 10);
    pairing.setOptIn(b, true, people, 11);
    const notices = pairing.setOptIn(c, true, people, 12);

    expect(notices).toHaveLength(1);
    expect(notices[0]?.update.participants.map((person) => person.participationId)).toEqual([b, c]);
  });

  it('moves an eligible third person into the current group on a fresh authorized generation', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const people = [
      candidate(a, 'socket-a', 64),
      candidate(b, 'socket-b', 96),
      candidate(c, 'socket-c', 80),
    ];
    pairing.setOptIn(a, true, people, 10);
    const first = pairing.setOptIn(b, true, people, 11)[0]!.update;
    const firstActive = pairing.activateGeneration(first.generation)[0]!.update;
    expect(firstActive.state).toBe('active');

    const joined = pairing.setOptIn(c, true, people, 12);
    expect(joined).toHaveLength(1);
    expect(joined[0]?.socketIds).toEqual(['socket-a', 'socket-b', 'socket-c']);
    expect(joined[0]?.update).toMatchObject({
      conversationId: first.conversationId,
      state: 'joining',
      version: firstActive.version + 1,
      mediaReady: false,
      participants: [{ participationId: a }, { participationId: b }, { participationId: c }],
    });
    expect(joined[0]?.update.generation).not.toBe(first.generation);
    expect(pairing.mediaConversation(a, first.conversationId, firstActive.version)).toBeNull();
    expect(pairing.mediaPermits()).toHaveLength(3);
    expect(new Set(pairing.mediaPermits().map((permit) => permit.identity))).toEqual(
      new Set([a, b, c]),
    );
    expect(
      pairing.mediaPermits().every((permit) => permit.generation === joined[0]?.update.generation),
    ).toBe(true);

    const active = pairing.activateGeneration(joined[0]!.update.generation)[0]?.update;
    expect(active).toMatchObject({
      conversationId: first.conversationId,
      state: 'active',
      version: firstActive.version + 2,
      mediaReady: true,
    });
    expect(pairing.mediaConversation(c, first.conversationId, active!.version)).toMatchObject({
      generation: active?.generation,
      room: active?.generation,
    });
  });

  it('groups previously opted-in users in the same reconciliation when they move together', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const far = [
      candidate(a, 'socket-a', 0),
      candidate(b, 'socket-b', 320),
      candidate(c, 'socket-c', 640),
    ];
    for (const person of far) pairing.setOptIn(person.participationId, true, far, 10);

    const close = [
      candidate(a, 'socket-a', 64),
      candidate(b, 'socket-b', 96),
      candidate(c, 'socket-c', 80),
    ];
    const notices = pairing.reconcile(close, 20);
    const completeGroup = notices.at(-1)?.update;

    expect(notices.map((notice) => notice.update.state)).toEqual(['joining', 'joining']);
    expect(completeGroup?.participants.map((person) => person.participationId)).toEqual([a, b, c]);
    expect(notices[0]?.update.conversationId).toBe(completeGroup?.conversationId);
    expect(notices[0]?.update.generation).not.toBe(completeGroup?.generation);
    expect(pairing.mediaPermits()).toHaveLength(3);
    expect(
      pairing.mediaPermits().every((permit) => permit.generation === completeGroup?.generation),
    ).toBe(true);
  });

  it('enforces a distinct six-person proximity cap and leaves the seventh user unmatched', () => {
    expect(PROXIMITY_MAX_PARTICIPANTS).toBe(6);
    expect(OFFICE_LIMITS.maxProximityParticipants).toBe(6);
    const pairing = new ProximityPairing(officeEpoch, 32);
    const people = [a, b, c, d, e, f, g].map((id, index) => candidate(id, `socket-${index}`, 64));
    const notices = join(pairing, people);
    const rosters = notices.filter((notice) => notice.update.state === 'joining');
    const latestRoster = rosters.at(-1)?.update.participants;

    expect(latestRoster).toHaveLength(PROXIMITY_MAX_PARTICIPANTS);
    expect(latestRoster?.map((person) => person.participationId)).not.toContain(g);
    expect(pairing.mediaPermits()).toHaveLength(PROXIMITY_MAX_PARTICIPANTS);
    expect(pairing.mediaPermits().map((permit) => permit.identity)).not.toContain(g);
  });

  it('uses a stable participation-id tie-break for candidates arriving in one reconciliation', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const initial = [a, b, c, d, e].map((id, index) => candidate(id, `socket-${index}`, 64));
    join(pairing, initial);
    const fFar = candidate(f, 'socket-f', 640);
    const gFar = candidate(g, 'socket-g', 800);
    pairing.setOptIn(f, true, [...initial, fFar, gFar], 30);
    pairing.setOptIn(g, true, [...initial, fFar, gFar], 31);

    const close = [...initial, candidate(f, 'socket-f', 64), candidate(g, 'socket-g', 64)];
    const notices = pairing.reconcile(close, 32);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.update.participants.map((person) => person.participationId)).toEqual([
      a,
      b,
      c,
      d,
      e,
      f,
    ]);
  });

  it('migrates eligible survivors and privately ends the removed member on leave', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const people = [
      candidate(a, 'socket-a', 64),
      candidate(b, 'socket-b', 96),
      candidate(c, 'socket-c', 80),
    ];
    const initial = join(pairing, people).find(
      (notice) => notice.update.participants.length === 2,
    )?.update;
    expect(initial).toBeDefined();
    const active = pairing.activateGeneration(pairing.mediaPermits()[0]!.generation)[0]?.update;
    expect(active?.state).toBe('active');

    const result = pairing.leave(c, initial!.conversationId, active!.version);
    expect('notices' in result).toBe(true);
    if (!('notices' in result)) return;
    const survivorUpdate = result.notices.find((notice) => notice.update.state === 'joining');
    const departedUpdate = result.notices.find((notice) => notice.update.state === 'ended');
    expect(survivorUpdate?.socketIds).toEqual(['socket-a', 'socket-b']);
    expect(survivorUpdate?.update.participants.map((person) => person.participationId)).toEqual([
      a,
      b,
    ]);
    expect(departedUpdate?.socketIds).toEqual(['socket-c']);
    expect(departedUpdate?.update.participants).toEqual([]);
    expect(survivorUpdate?.update.generation).not.toBe(active?.generation);
    expect(
      pairing
        .mediaPermits()
        .map((permit) => permit.identity)
        .sort(),
    ).toEqual([a, b]);
    expect(pairing.mediaPermits().some((permit) => permit.generation === active?.generation)).toBe(
      false,
    );

    const rejoined = pairing.reconcile(people, 20);
    expect(rejoined).toEqual([]);
    const survivorActive = pairing.activateGeneration(survivorUpdate!.update.generation)[0]?.update;
    expect(survivorActive?.participants).toHaveLength(2);
  });

  it('immediately migrates a group when a member opts out or becomes unavailable', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const people = [
      candidate(a, 'socket-a', 64),
      candidate(b, 'socket-b', 96),
      candidate(c, 'socket-c', 80),
    ];
    join(pairing, people);
    pairing.activateGeneration(pairing.mediaPermits()[0]!.generation);

    const away = [people[0]!, people[1]!, candidate(c, 'socket-c', 80, 'away')];
    const notices = pairing.reconcile(away, 20);
    expect(notices.map((notice) => notice.update.state)).toEqual(['joining', 'ended']);
    expect(
      notices.find((notice) => notice.update.state === 'joining')?.update.participants,
    ).toHaveLength(2);
    expect(
      pairing
        .mediaPermits()
        .map((permit) => permit.identity)
        .sort(),
    ).toEqual([a, b]);
  });

  it('debounces boundary exit and preserves a close surviving group on a new generation', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const closePeople = [
      candidate(a, 'socket-a', 64),
      candidate(b, 'socket-b', 96),
      candidate(c, 'socket-c', 112),
    ];
    join(pairing, closePeople);
    const oldGeneration = pairing.mediaPermits()[0]!.generation;
    const outside = [closePeople[0]!, closePeople[1]!, candidate(c, 'socket-c', 64 + 6 * 32)];

    expect(pairing.reconcile(outside, 100)).toEqual([]);
    expect(pairing.reconcile(outside, 100 + PROXIMITY_EXIT_DEBOUNCE_MS - 1)).toEqual([]);
    const notices = pairing.reconcile(outside, 100 + PROXIMITY_EXIT_DEBOUNCE_MS);
    expect(notices.map((notice) => notice.update.state)).toEqual(['joining', 'ended']);
    const survivors = notices.find((notice) => notice.update.state === 'joining')!.update;
    expect(survivors.participants.map((person) => person.participationId)).toEqual([a, b]);
    expect(survivors.generation).not.toBe(oldGeneration);
    expect(
      pairing
        .mediaPermits()
        .map((permit) => permit.identity)
        .sort(),
    ).toEqual([a, b]);
  });

  it('keeps two existing groups separate even when they move close together', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const people = [
      candidate(a, 'socket-a', 0),
      candidate(b, 'socket-b', 32),
      candidate(c, 'socket-c', 320),
      candidate(d, 'socket-d', 352),
    ];
    join(pairing, people);
    const originalGenerations = new Set(pairing.mediaPermits().map((permit) => permit.generation));
    expect(originalGenerations.size).toBe(2);

    const closeGroups = [
      people[0]!,
      people[1]!,
      candidate(c, 'socket-c', 32),
      candidate(d, 'socket-d', 64),
    ];
    expect(pairing.reconcile(closeGroups, 20)).toEqual([]);
    expect(new Set(pairing.mediaPermits().map((permit) => permit.generation)).size).toBe(2);
  });
});
