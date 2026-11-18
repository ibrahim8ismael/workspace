import { describe, expect, it } from 'vitest';
import {
  ProximityPairing,
  type ProximityCandidate,
} from '../dist/modules/office/runtime/proximity-pairing.js';

const epoch = '98ff100b-f4f2-4896-81ef-11106d315b9e';
function person(index: number, roomId: string | null): ProximityCandidate {
  return {
    participationId: `${index}`.repeat(8) + '-1111-4111-8111-' + `${index}`.repeat(12),
    socketId: `socket-${index}`,
    displayName: `Person ${index}`,
    availability: 'available',
    position: { x: 64 + index * 8, y: 64 },
    roomId,
  };
}

describe('room boundary independent security review', () => {
  it('never forms a pair through a doorway or wall even within proximity radius', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const people = [person(1, 'room-a'), person(2, null)];
    for (const participant of people) pairing.setOptIn(participant.participationId, true, people);
    expect(pairing.mediaPermits()).toEqual([]);
  });

  it('does not admit a nearby outsider to an already established room group', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const members = [person(1, 'room-a'), person(2, 'room-a')];
    for (const participant of members) pairing.setOptIn(participant.participationId, true, members);
    const outsider = person(3, 'room-b');
    pairing.setOptIn(outsider.participationId, true, [...members, outsider]);
    expect(
      pairing
        .mediaPermits()
        .map((permit) => permit.identity)
        .sort(),
    ).toEqual(members.map((member) => member.participationId).sort());
  });

  it('retires the old generation when a member crosses into a different room', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const members = [person(1, 'room-a'), person(2, 'room-a'), person(3, 'room-a')];
    for (const participant of members) pairing.setOptIn(participant.participationId, true, members);
    const generation = pairing.mediaPermits()[0]!.generation;
    pairing.reconcile([members[0]!, members[1]!, { ...members[2]!, roomId: 'room-b' }]);
    const permits = pairing.mediaPermits();
    expect(permits.some((permit) => permit.generation === generation)).toBe(false);
    expect(permits.map((permit) => permit.identity).sort()).toEqual(
      members
        .slice(0, 2)
        .map((member) => member.participationId)
        .sort(),
    );
  });
});
