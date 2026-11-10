import { describe, expect, it } from 'vitest';
import { conversationUpdateSchema } from '@gather/contracts';
import {
  PROXIMITY_EXIT_DEBOUNCE_MS,
  ProximityPairing,
  type ProximityCandidate,
} from '../dist/modules/office/runtime/proximity-pairing.js';

const officeEpoch = '98ff100b-f4f2-4896-81ef-11106d315b9e';
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';

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

describe('proximity voice pairing', () => {
  it('pairs only two available people who explicitly opted in and keeps the update private', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const people = [candidate(a, 'socket-a', 64), candidate(b, 'socket-b', 128)];

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

  it('chooses nearest stable pairs and leaves each participation in at most one pair', () => {
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

  it('ends immediately on an eligibility loss and debounces only boundary exit', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const closePeople = [candidate(a, 'socket-a', 64), candidate(b, 'socket-b', 128)];
    pairing.setOptIn(a, true, closePeople, 10);
    const started = pairing.setOptIn(b, true, closePeople, 11)[0]?.update;
    expect(started).toBeDefined();

    const outside = [closePeople[0]!, candidate(b, 'socket-b', 64 + 4 * 32)];
    expect(pairing.reconcile(outside, 100)).toEqual([]);
    expect(pairing.reconcile(outside, 100 + PROXIMITY_EXIT_DEBOUNCE_MS - 1)).toEqual([]);
    const ended = pairing.reconcile(outside, 100 + PROXIMITY_EXIT_DEBOUNCE_MS);
    expect(ended[0]?.update).toMatchObject({ state: 'ended', mediaReady: false, participants: [] });

    const rejoined = pairing.reconcile(closePeople, 700);
    expect(rejoined[0]?.update.state).toBe('joining');
    const unavailable = [closePeople[0]!, candidate(b, 'socket-b', 128, 'away')];
    expect(pairing.reconcile(unavailable, 701)[0]?.update.state).toBe('ended');
  });

  it('honors explicit leave until eligibility resets', () => {
    const pairing = new ProximityPairing(officeEpoch, 32);
    const people = [candidate(a, 'socket-a', 64), candidate(b, 'socket-b', 128)];
    pairing.setOptIn(a, true, people, 10);
    const started = pairing.setOptIn(b, true, people, 11)[0]?.update;
    expect(started).toBeDefined();

    const left = pairing.leave(a, started!.conversationId, started!.version);
    expect('notices' in left && left.notices[0]?.update.state).toBe('ended');
    expect(pairing.reconcile(people, 12)).toEqual([]);

    const separated = [people[0]!, candidate(b, 'socket-b', 64 + 4 * 32)];
    expect(pairing.reconcile(separated, 13)).toEqual([]);
    expect(pairing.reconcile(people, 14)[0]?.update.state).toBe('joining');
  });
});
