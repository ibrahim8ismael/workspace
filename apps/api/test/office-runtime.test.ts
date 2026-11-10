import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { OFFICE_LIMITS } from '@gather/contracts';
import { COMMONS_GEOMETRY, VIVO_GEOMETRY, pixelToTile } from '@gather/world';
import commonsManifest from '@gather/assets/manifests/commons-map.json' with { type: 'json' };
import vivoManifest from '@gather/assets/manifests/vivo-map.json' with { type: 'json' };
import { OfficeRuntimeService } from '../dist/modules/office/runtime/office-runtime.service.js';
import type { ConsumedOfficeTicket } from '../dist/modules/office/runtime/office-runtime.service.js';

function ticket(userNumber: number, mapVersion = commonsManifest.mapVersion): ConsumedOfficeTicket {
  return {
    userId: `user-${userNumber}`,
    displayName: `User ${userNumber}`,
    sessionId: `session-${userNumber}`,
    membershipGrantId: `grant-${userNumber}`,
    workspaceId: '10000000-0000-4000-8000-000000000001',
    officeId: '20000000-0000-4000-8000-000000000001',
    officeEpoch: '5fc87e60-62b8-4cf9-8edc-dcaa2a1d8249',
    mapVersion,
    protocolVersion: 1,
  };
}

describe('office runtime reservations', () => {
  it('runs Vivo offices against the registered 52 by 50 map and its seat layout', () => {
    const runtime = new OfficeRuntimeService();
    const active = ticket(1, vivoManifest.mapVersion);
    const reservation = runtime.reserve(active, 'socket-vivo');
    const self = reservation.ready.snapshot.participants[0]!;
    expect(reservation.ready.mapVersion).toBe(vivoManifest.mapVersion);
    expect(reservation.ready.snapshot.seats).toHaveLength(
      VIVO_GEOMETRY.objects.reduce((count, object) => count + object.seats.length, 0),
    );
    expect(self.position).toEqual(VIVO_GEOMETRY.spawn);
    expect(self.position.x).toBeLessThan(VIVO_GEOMETRY.widthTiles * VIVO_GEOMETRY.tileSize);
    expect(self.position.y).toBeLessThan(VIVO_GEOMETRY.heightTiles * VIVO_GEOMETRY.tileSize);
  });

  it('caps admission, prevents duplicate actors and frees capacity on release', () => {
    const runtime = new OfficeRuntimeService();
    const reservations = Array.from({ length: OFFICE_LIMITS.maxParticipants }, (_, index) =>
      runtime.reserve(ticket(index + 1), `socket-${index + 1}`),
    );
    expect(reservations.at(-1)?.ready.snapshot.participants).toHaveLength(
      OFFICE_LIMITS.maxParticipants,
    );

    expect(() => runtime.reserve(ticket(1), 'duplicate-socket')).toThrow('participation_conflict');
    expect(() =>
      runtime.reserve(ticket(OFFICE_LIMITS.maxParticipants + 1), 'overflow-socket'),
    ).toThrow('room_full');

    const first = reservations[0]!;
    const removed = runtime.release(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'user-1',
      'socket-1',
      first.participationId,
    );
    expect(removed?.delta.removedParticipationIds).toEqual([first.participationId]);
    expect(() =>
      runtime.reserve(ticket(OFFICE_LIMITS.maxParticipants + 1), 'overflow-socket'),
    ).not.toThrow();
  });

  it('coalesces monotonic movement intent and broadcasts bounded server-time motion', () => {
    const runtime = new OfficeRuntimeService();
    const active = ticket(1);
    const reservation = runtime.reserve(active, 'socket-1');
    const start = reservation.ready.snapshot.participants[0]!.position;
    const now = performance.now();
    const input = {
      eventId: randomUUID(),
      officeEpoch: active.officeEpoch,
      sequence: 1,
      dx: 1 as const,
      dy: 0 as const,
    };
    expect(
      runtime.setMovementIntent(
        active.officeId,
        active.workspaceId,
        active.userId,
        'socket-1',
        reservation.participationId,
        input,
        now,
      ),
    ).toBeNull();
    expect(
      runtime.setMovementIntent(
        active.officeId,
        active.workspaceId,
        active.userId,
        'socket-1',
        reservation.participationId,
        input,
        now + 1,
      ),
    ).toBe('stale_version');

    runtime.tick(active.officeId, now + 50, 1050);
    const update = runtime.tick(active.officeId, now + 100, 1100);
    const moved = update?.delta.participants[0];
    expect(moved?.position.x).toBeGreaterThan(start.x);
    expect(moved?.position.y).toBe(start.y);
    expect(moved?.lastProcessedInputSequence).toBe(1);
    expect(update?.delta.stateVersion).toBeGreaterThan(update?.delta.baseVersion ?? 0);
  });

  it('enforces per-participation movement input budgets and rejects old epochs', () => {
    const runtime = new OfficeRuntimeService();
    const active = ticket(1);
    const reservation = runtime.reserve(active, 'socket-1');
    const submit = (sequence: number, now: number, officeEpoch = active.officeEpoch) =>
      runtime.setMovementIntent(
        active.officeId,
        active.workspaceId,
        active.userId,
        'socket-1',
        reservation.participationId,
        { eventId: randomUUID(), officeEpoch, sequence, dx: 1, dy: 0 },
        now,
      );

    for (let sequence = 1; sequence <= OFFICE_LIMITS.movementInputsPerSecond; sequence += 1)
      expect(submit(sequence, sequence)).toBeNull();
    expect(submit(OFFICE_LIMITS.movementInputsPerSecond + 1, 31)).toBe('rate_limited');
    expect(submit(OFFICE_LIMITS.movementInputsPerSecond + 1, 1001)).toBeNull();
    expect(submit(OFFICE_LIMITS.movementInputsPerSecond + 2, 1002, randomUUID())).toBe(
      'stale_epoch',
    );
  });

  it('normalizes diagonal intent to the same server speed as cardinal movement', () => {
    const distanceAfterTwoTicks = (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
      const runtime = new OfficeRuntimeService();
      const active = ticket(1);
      const reservation = runtime.reserve(active, 'socket-1');
      const start = reservation.ready.snapshot.participants[0]!.position;
      const now = performance.now();
      runtime.setMovementIntent(
        active.officeId,
        active.workspaceId,
        active.userId,
        'socket-1',
        reservation.participationId,
        { eventId: randomUUID(), officeEpoch: active.officeEpoch, sequence: 1, dx, dy },
        now,
      );
      runtime.tick(active.officeId, now + 50, 1050);
      const update = runtime.tick(active.officeId, now + 100, 1100);
      const end = update!.delta.participants[0]!.position;
      return Math.hypot(end.x - start.x, end.y - start.y);
    };
    expect(distanceAfterTwoTicks(1, 1)).toBeCloseTo(distanceAfterTwoTicks(1, 0), 3);
  });

  it('keeps repeated movement inputs inside the approved map bounds', () => {
    const runtime = new OfficeRuntimeService();
    const active = ticket(1);
    const reservation = runtime.reserve(active, 'socket-1');
    const start = reservation.ready.snapshot.participants[0]!.position;
    let now = performance.now() + 1;
    let lastPosition = start;
    for (let sequence = 1; sequence <= 100; sequence += 1) {
      expect(
        runtime.setMovementIntent(
          active.officeId,
          active.workspaceId,
          active.userId,
          'socket-1',
          reservation.participationId,
          {
            eventId: randomUUID(),
            officeEpoch: active.officeEpoch,
            sequence,
            dx: 1,
            dy: 0,
          },
          now,
        ),
      ).toBeNull();
      const update = runtime.tick(active.officeId, now + 50, 1000 + sequence * 50);
      const moved = update?.delta.participants[0];
      if (moved) lastPosition = moved.position;
      now += 50;
    }
    expect(lastPosition.x).toBeGreaterThan(start.x);
    expect(lastPosition.x).toBeLessThan(COMMONS_GEOMETRY.widthTiles * COMMONS_GEOMETRY.tileSize);
    expect(lastPosition.y).toBe(start.y);
  });

  it('stops movement at an approved Commons wall edge', () => {
    const runtime = new OfficeRuntimeService();
    const active = ticket(1);
    const reservation = runtime.reserve(active, 'socket-1');
    let now = performance.now() + 1;
    let lastPosition = reservation.ready.snapshot.participants[0]!.position;
    let sequence = 0;
    for (const direction of [
      { dx: -1 as const, dy: 0 as const },
      { dx: 0 as const, dy: -1 as const },
    ]) {
      for (let tick = 0; tick < OFFICE_LIMITS.simulationHz; tick += 1) {
        sequence += 1;
        runtime.setMovementIntent(
          active.officeId,
          active.workspaceId,
          active.userId,
          'socket-1',
          reservation.participationId,
          {
            eventId: randomUUID(),
            officeEpoch: active.officeEpoch,
            sequence,
            ...direction,
          },
          now,
        );
        const update = runtime.tick(active.officeId, now + 50, 1000 + sequence * 50);
        const moved = update?.delta.participants[0];
        if (moved) lastPosition = moved.position;
        now += 50;
      }
    }
    const finalTile = pixelToTile(lastPosition);
    expect(finalTile.tx).toBe(5);
    expect(finalTile.ty).toBe(6);
  });

  it('serializes seat claims, applies availability, stands through a valid exit and frees seats', () => {
    const runtime = new OfficeRuntimeService();
    const firstTicket = ticket(1);
    const secondTicket = ticket(2);
    const first = runtime.reserve(firstTicket, 'socket-1');
    const second = runtime.reserve(secondTicket, 'socket-2');
    let now = performance.now() + 1;
    let sequence = 0;
    const walkNearSeat = (
      active: ConsumedOfficeTicket,
      reservation: typeof first,
      socket: string,
    ) => {
      const run = (dx: -1 | 0 | 1, dy: -1 | 0 | 1, ticks: number) => {
        for (let index = 0; index < ticks; index += 1) {
          sequence += 1;
          expect(
            runtime.setMovementIntent(
              active.officeId,
              active.workspaceId,
              active.userId,
              socket,
              reservation.participationId,
              { eventId: randomUUID(), officeEpoch: active.officeEpoch, sequence, dx, dy },
              now,
            ),
          ).toBeNull();
          runtime.tick(active.officeId, now + 50);
          now += 50;
        }
      };
      run(1, 0, active.userId === firstTicket.userId ? 24 : 20);
      run(0, 1, 7);
      run(-1, 0, 4);
      sequence += 1;
      runtime.setMovementIntent(
        active.officeId,
        active.workspaceId,
        active.userId,
        socket,
        reservation.participationId,
        {
          eventId: randomUUID(),
          officeEpoch: active.officeEpoch,
          sequence,
          dx: 0,
          dy: 0,
        },
        now,
      );
      runtime.tick(active.officeId, now + 50);
      now += 50;
    };
    walkNearSeat(firstTicket, first, 'socket-1');
    walkNearSeat(secondTicket, second, 'socket-2');

    const seatId = 'commons-southeast-table:0';
    const moveSecond = (dx: -1 | 0 | 1, dy: -1 | 0 | 1, ticks: number) => {
      for (let index = 0; index < ticks; index += 1) {
        sequence += 1;
        runtime.setMovementIntent(
          secondTicket.officeId,
          secondTicket.workspaceId,
          secondTicket.userId,
          'socket-2',
          second.participationId,
          { eventId: randomUUID(), officeEpoch: secondTicket.officeEpoch, sequence, dx, dy },
          now,
        );
        runtime.tick(secondTicket.officeId, now + 50);
        now += 50;
      }
    };
    // Enter the southeast room through its north doorway at column 18, then reach the chair.
    moveSecond(1, 0, 6);
    moveSecond(0, 1, 2);
    moveSecond(-1, 0, 3);
    moveSecond(0, 1, 4);
    expect(
      runtime.sit(
        firstTicket.officeId,
        firstTicket.workspaceId,
        firstTicket.userId,
        'socket-1',
        first.participationId,
        firstTicket.officeEpoch,
        seatId,
        now,
      ),
    ).toBe('seat_unavailable');
    moveSecond(0, -1, 4);

    const claim = runtime.sit(
      firstTicket.officeId,
      firstTicket.workspaceId,
      firstTicket.userId,
      'socket-1',
      first.participationId,
      firstTicket.officeEpoch,
      seatId,
      now,
    );
    expect(typeof claim).not.toBe('string');
    if (typeof claim === 'string') throw new Error(claim);
    expect(claim.delta.seats).toEqual([{ seatId, occupantParticipationId: first.participationId }]);
    expect(claim.delta.participants[0]?.seatId).toBe(seatId);
    expect(
      runtime.sit(
        secondTicket.officeId,
        secondTicket.workspaceId,
        secondTicket.userId,
        'socket-2',
        second.participationId,
        secondTicket.officeEpoch,
        seatId,
        now,
      ),
    ).toBe('seat_unavailable');

    const availability = runtime.setAvailability(
      firstTicket.officeId,
      firstTicket.workspaceId,
      firstTicket.userId,
      'socket-1',
      first.participationId,
      firstTicket.officeEpoch,
      'away',
    );
    expect(
      availability &&
        typeof availability !== 'string' &&
        availability.delta.participants[0]?.availability,
    ).toBe('away');
    const stand = runtime.stand(
      firstTicket.officeId,
      firstTicket.workspaceId,
      firstTicket.userId,
      'socket-1',
      first.participationId,
      firstTicket.officeEpoch,
    );
    expect(typeof stand).not.toBe('string');
    if (typeof stand === 'string') throw new Error(stand);
    expect(stand.delta.seats).toEqual([{ seatId, occupantParticipationId: null }]);
    expect(stand.delta.participants[0]?.position).toEqual({ x: 528, y: 368 });

    const sitAgain = runtime.sit(
      firstTicket.officeId,
      firstTicket.workspaceId,
      firstTicket.userId,
      'socket-1',
      first.participationId,
      firstTicket.officeEpoch,
      seatId,
      now,
    );
    expect(typeof sitAgain).not.toBe('string');
    const released = runtime.release(
      firstTicket.officeId,
      firstTicket.workspaceId,
      firstTicket.userId,
      'socket-1',
      first.participationId,
    );
    expect(released?.delta.seats).toEqual([{ seatId, occupantParticipationId: null }]);
  });

  it('returns a current safe snapshot for a known gap and rejects impossible future versions', () => {
    const runtime = new OfficeRuntimeService();
    const active = ticket(1);
    const reservation = runtime.reserve(active, 'socket-1');
    const originalVersion = reservation.ready.snapshot.stateVersion;

    const availability = runtime.setAvailability(
      active.officeId,
      active.workspaceId,
      active.userId,
      'socket-1',
      reservation.participationId,
      active.officeEpoch,
      'busy',
    );
    expect(availability && typeof availability !== 'string').toBe(true);

    const repaired = runtime.resync(
      active.officeId,
      active.workspaceId,
      active.userId,
      'socket-1',
      reservation.participationId,
      active.officeEpoch,
      originalVersion,
    );
    expect(typeof repaired).not.toBe('string');
    if (typeof repaired === 'string') throw new Error(repaired);
    expect(repaired.snapshot.stateVersion).toBe(originalVersion + 1);
    expect(repaired.snapshot.participants[0]?.availability).toBe('busy');

    expect(
      runtime.resync(
        active.officeId,
        active.workspaceId,
        active.userId,
        'socket-1',
        reservation.participationId,
        active.officeEpoch,
        repaired.snapshot.stateVersion + 1,
      ),
    ).toBe('stale_version');
    expect(
      runtime.resync(
        active.officeId,
        active.workspaceId,
        'another-user',
        'socket-1',
        reservation.participationId,
        active.officeEpoch,
        originalVersion,
      ),
    ).toBe('unauthorized');
  });

  it('consumes takeover references once and atomically replaces the bound participation', () => {
    const runtime = new OfficeRuntimeService();
    const active = ticket(1);
    const oldReservation = runtime.reserve(active, 'socket-old');
    const binding = {
      userId: active.userId,
      sessionId: active.sessionId,
      membershipGrantId: active.membershipGrantId,
      workspaceId: active.workspaceId,
      officeId: active.officeId,
      officeEpoch: active.officeEpoch,
      participationId: oldReservation.participationId,
    };
    const result = runtime.issueTakeoverReference(binding, Date.now() + 30_000);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') throw new Error(result);
    const expired = runtime.issueTakeoverReference(binding, Date.now() - 1);
    expect(typeof expired).not.toBe('string');
    if (typeof expired === 'string') throw new Error(expired);
    expect(runtime.consumeTakeoverReference(expired.reference, binding)).toBe('invalid_token');

    expect(
      runtime.consumeTakeoverReference(result.reference, {
        ...binding,
        sessionId: 'other-session',
      }),
    ).toBe('unauthorized');
    expect(runtime.consumeTakeoverReference(result.reference, binding)).toEqual({
      participationId: oldReservation.participationId,
      officeEpoch: active.officeEpoch,
    });
    expect(runtime.consumeTakeoverReference(result.reference, binding)).toBe('invalid_token');

    const replacement = runtime.reserve(
      {
        ...active,
        takeoverParticipationId: oldReservation.participationId,
        takeoverOfficeEpoch: active.officeEpoch,
      },
      'socket-new',
    );
    expect(replacement.retiredReason).toBe('taken_over');
    expect(replacement.retiredSocketIds).toEqual(['socket-old']);
    expect(replacement.joined.removedParticipationIds).toEqual([oldReservation.participationId]);
    expect(
      replacement.joined.participants.map((participant) => participant.participationId),
    ).toEqual([replacement.participationId]);
    expect(
      replacement.ready.snapshot.participants.map((participant) => participant.participationId),
    ).toEqual([replacement.participationId]);
    expect(
      runtime.release(
        active.officeId,
        active.workspaceId,
        active.userId,
        'socket-old',
        oldReservation.participationId,
      ),
    ).toBeNull();
  });
});
