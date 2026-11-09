import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { OFFICE_LIMITS } from '@gather/contracts';
import { COMMONS_GEOMETRY, pixelToTile } from '@gather/world';
import { OfficeRuntimeService } from '../dist/modules/office/runtime/office-runtime.service.js';
import type { ConsumedOfficeTicket } from '../dist/modules/office/runtime/office-runtime.service.js';

function ticket(userNumber: number): ConsumedOfficeTicket {
  return {
    userId: `user-${userNumber}`,
    displayName: `User ${userNumber}`,
    sessionId: `session-${userNumber}`,
    membershipGrantId: `grant-${userNumber}`,
    workspaceId: '10000000-0000-4000-8000-000000000001',
    officeId: '20000000-0000-4000-8000-000000000001',
    officeEpoch: '5fc87e60-62b8-4cf9-8edc-dcaa2a1d8249',
    mapVersion: `commons-v1-${'a'.repeat(64)}`,
    protocolVersion: 1,
  };
}

describe('office runtime reservations', () => {
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
});
