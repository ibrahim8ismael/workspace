import { describe, expect, it } from 'vitest';
import {
  conversationAreasSchema,
  conversationUpdateSchema,
  OFFICE_LIMITS,
} from '@gather/contracts';
import {
  PROXIMITY_INITIAL_RADIUS_TILES,
  PROXIMITY_JOIN_RADIUS_TILES,
  PROXIMITY_MAX_PARTICIPANTS,
  PROXIMITY_MAX_RADIUS_TILES,
  ProximityPairing,
  type ProximityCandidate,
} from '../dist/modules/office/runtime/proximity-pairing.js';

const epoch = '98ff100b-f4f2-4896-81ef-11106d315b9e';
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
] as const;

function candidate(
  index: number,
  x: number,
  y = 64,
  availability: ProximityCandidate['availability'] = 'available',
): ProximityCandidate {
  const participationId = ids[index]!;
  return {
    participationId,
    socketId: `socket-${index}`,
    displayName: `Person ${index}`,
    availability,
    position: { x, y },
  };
}

function optInAll(pairing: ProximityPairing, people: readonly ProximityCandidate[]) {
  for (const person of people) pairing.setOptIn(person.participationId, true, people);
}

function latestGroup(pairing: ProximityPairing) {
  const permit = pairing.mediaPermits()[0];
  if (!permit) throw new Error('expected_group');
  return permit.generation;
}

describe('server-authoritative growing proximity circles', () => {
  it('joins two opted-in users only within a true two-tile Euclidean distance', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const inside = [candidate(0, 64), candidate(1, 128)];
    pairing.setOptIn(ids[0], true, inside);
    const joined = pairing.setOptIn(ids[1], true, inside);
    expect(joined).toHaveLength(1);
    expect(joined[0]?.update.state).toBe('joining');

    const tooFar = new ProximityPairing(epoch, 32);
    optInAll(tooFar, [candidate(0, 0), candidate(1, 64.001)]);
    expect(tooFar.mediaPermits()).toEqual([]);

    const corner = new ProximityPairing(epoch, 32);
    const diagonal = [candidate(0, 64, 64), candidate(1, 128, 128)];
    optInAll(corner, diagonal);
    expect(corner.mediaPermits()).toEqual([]); // sqrt(2² + 2²) is outside the circle.
    expect(PROXIMITY_JOIN_RADIUS_TILES).toBe(2);
  });

  it('publishes a deterministic anchored midpoint and two-tile initial radius', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const people = [candidate(0, 64, 64), candidate(1, 96, 96)];
    optInAll(pairing, people);
    const areas = pairing.currentAreas();
    expect(conversationAreasSchema.safeParse(areas).success).toBe(true);
    expect(areas.areas).toHaveLength(1);
    expect(areas.areas[0]).toMatchObject({
      version: 1,
      shape: 'circle',
      center: { x: 80, y: 80 },
      radius: PROXIMITY_INITIAL_RADIUS_TILES * 32,
      state: 'active',
    });
  });

  it('reproduces distant audio authorization from the old moving centroid and grace boundary', () => {
    // For the same positions, the previous moving centroid was x=104 and the old three-tile
    // departure radius still admitted x=144.01. The fixed midpoint is x=80, so this movement
    // crosses the published two-tile circle and must remove the permit in this reconciliation.
    const pairing = new ProximityPairing(epoch, 32);
    const initial = [candidate(0, 64), candidate(1, 96)];
    optInAll(pairing, initial);
    expect(pairing.mediaPermits()).toHaveLength(2);

    const beyond = [candidate(0, 64), candidate(1, 144.01)];
    const historicalCentroid = (beyond[0]!.position.x + beyond[1]!.position.x) / 2;
    expect(Math.abs(beyond[1]!.position.x - historicalCentroid)).toBeLessThanOrEqual(3 * 32);
    const notices = pairing.reconcile(beyond);
    expect(notices.some((notice) => notice.update.state === 'ended')).toBe(true);
    expect(pairing.mediaPermits()).toEqual([]);
    expect(pairing.currentAreas().areas).toEqual([]);
  });

  it('keeps an exact circular boundary point and revokes immediately outside it', () => {
    const pairing = new ProximityPairing(epoch, 32);
    optInAll(pairing, [candidate(0, 64), candidate(1, 96)]);
    const atEdge = [candidate(0, 64), candidate(1, 144)];
    expect(pairing.reconcile(atEdge)).toEqual([]);
    expect(pairing.mediaPermits()).toHaveLength(2);
    const outside = [candidate(0, 64), candidate(1, 144.001)];
    expect(pairing.reconcile(outside).map((notice) => notice.update.state)).toContain('ended');
    expect(pairing.mediaPermits()).toEqual([]);
  });

  it('autojoins a third eligible user and expands by one whole tile per arrival', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const people = [candidate(0, 64), candidate(1, 96), candidate(2, 112), candidate(3, 120)];
    pairing.setOptIn(ids[0], true, people);
    pairing.setOptIn(ids[1], true, people);
    const initial = pairing.currentAreas().areas[0]!;
    pairing.setOptIn(ids[2], true, people);
    const afterThird = pairing.currentAreas().areas[0]!;
    expect(afterThird.areaId).toBe(initial.areaId);
    expect(afterThird.version).toBeGreaterThan(initial.version);
    expect(afterThird.radius - initial.radius).toBe(32);
    pairing.setOptIn(ids[3], true, people);
    expect(pairing.currentAreas().areas[0]?.radius).toBe(4 * 32);
    expect(pairing.mediaPermits()).toHaveLength(4);
  });

  it('caps group size at six and circle radius at six tiles', () => {
    expect(PROXIMITY_MAX_PARTICIPANTS).toBe(6);
    expect(OFFICE_LIMITS.maxProximityParticipants).toBe(6);
    const pairing = new ProximityPairing(epoch, 32);
    const people = ids.map((_, index) => candidate(index, 64));
    optInAll(pairing, people);
    expect(pairing.mediaPermits()).toHaveLength(6);
    expect(pairing.mediaPermits().some((permit) => permit.identity === ids[6])).toBe(false);
    expect(pairing.currentAreas().areas[0]?.radius).toBe(PROXIMITY_MAX_RADIUS_TILES * 32);
  });

  it('shrinks only when all retained users fit and keeps the anchor fixed', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const people = [candidate(0, 80), candidate(1, 80), candidate(2, 80), candidate(3, 80)];
    optInAll(pairing, people);
    const before = pairing.currentAreas().areas[0]!;
    expect(before.radius).toBe(4 * 32);
    const update = pairing.reconcile([
      people[0]!,
      people[1]!,
      people[2]!,
      candidate(3, 80 + 4 * 32 + 1),
    ]);
    const after = pairing.currentAreas().areas[0]!;
    expect(update.some((notice) => notice.update.state === 'joining')).toBe(true);
    expect(after.center).toEqual(before.center);
    expect(after.radius).toBe(3 * 32);
  });

  it('does not merge overlapping circles and assigns one candidate to one nearest group', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const founders = [candidate(0, 0), candidate(1, 32), candidate(2, 128), candidate(3, 160)];
    optInAll(pairing, founders);
    expect(pairing.currentAreas().areas).toHaveLength(2);
    const prior = pairing.currentAreas().areas;
    const newcomer = candidate(4, 80);
    pairing.setOptIn(newcomer.participationId, true, [...founders, newcomer]);
    expect(pairing.currentAreas().areas).toHaveLength(2);
    const rosters = pairing.mediaPermits().reduce((counts, permit) => {
      counts.set(permit.generation, (counts.get(permit.generation) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    expect([...rosters.values()].reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(pairing.currentAreas().areas.map((area) => area.areaId)).toEqual(
      prior.map((area) => area.areaId),
    );
  });

  it('rotates generation and removes an out-of-area member while survivors retain media', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const people = [candidate(0, 64), candidate(1, 96), candidate(2, 100)];
    optInAll(pairing, people);
    const firstGeneration = latestGroup(pairing);
    const outside = [people[0]!, people[1]!, candidate(2, 80 + 3 * 32 + 0.1)];
    const notices = pairing.reconcile(outside);
    expect(notices.map((notice) => notice.update.state)).toContain('ended');
    expect(pairing.mediaPermits()).toHaveLength(2);
    expect(pairing.mediaPermits().some((permit) => permit.generation === firstGeneration)).toBe(
      false,
    );
    expect(
      pairing
        .mediaPermits()
        .map((permit) => permit.identity)
        .sort(),
    ).toEqual([ids[0], ids[1]]);
    expect(
      notices.every((notice) => conversationUpdateSchema.safeParse(notice.update).success),
    ).toBe(true);
  });

  it('keeps explicit leave idempotent, suppresses immediate rejoin, then allows a fresh re-entry', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const people = [candidate(0, 64), candidate(1, 96)];
    optInAll(pairing, people);
    const active = pairing.activateGeneration(latestGroup(pairing))[0]!.update;
    const firstLeave = pairing.leave(ids[1], active.conversationId, active.version);
    expect('notices' in firstLeave).toBe(true);
    if (!('notices' in firstLeave)) return;
    expect(pairing.reconcile(people)).toEqual([]);
    const separated = [people[0]!, candidate(1, 160)];
    pairing.reconcile(separated);
    pairing.reconcile(people);
    expect(pairing.mediaPermits()).toHaveLength(2);
  });

  it('blocks meeting members from proximity groups and releases the block after meeting leave', () => {
    const pairing = new ProximityPairing(epoch, 32);
    const people = [candidate(0, 64), candidate(1, 96)];
    optInAll(pairing, people);
    expect(pairing.mediaPermits()).toHaveLength(2);
    const notices = pairing.setBlockedParticipants([ids[0]], people);
    expect(notices.some((notice) => notice.update.state === 'ended')).toBe(true);
    expect(pairing.mediaPermits()).toEqual([]);
    pairing.setBlockedParticipants([], people);
    expect(pairing.mediaPermits()).toHaveLength(2);
  });
});
