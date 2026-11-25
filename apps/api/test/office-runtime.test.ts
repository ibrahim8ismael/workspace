import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { OFFICE_LIMITS, OFFICE_PROTOCOL_VERSION } from '@gather/contracts';
import type { WorldSnapshot } from '@gather/contracts';
import { COMMONS_GEOMETRY, VIVO_GEOMETRY, pixelToTile } from '@gather/world';
import commonsManifest from '@gather/assets/manifests/commons-map.json' with { type: 'json' };
import vivoManifest from '@gather/assets/manifests/vivo-map.json' with { type: 'json' };
import { OfficeRuntimeService } from '../dist/modules/office/runtime/office-runtime.service.js';
import type { ConsumedOfficeTicket } from '../dist/modules/office/runtime/office-runtime.service.js';

function ticket(userNumber: number, mapVersion = commonsManifest.mapVersion): ConsumedOfficeTicket {
  return {
    userId: `00000000-0000-4000-8000-${String(userNumber).padStart(12, '0')}`,
    displayName: `User ${userNumber}`,
    sessionId: `session-${userNumber}`,
    membershipGrantId: `grant-${userNumber}`,
    workspaceId: '10000000-0000-4000-8000-000000000001',
    officeId: '20000000-0000-4000-8000-000000000001',
    officeEpoch: '5fc87e60-62b8-4cf9-8edc-dcaa2a1d8249',
    mapVersion,
    protocolVersion: OFFICE_PROTOCOL_VERSION,
  };
}

function meetingFixture(count = 3) {
  const runtime = new OfficeRuntimeService();
  const actors = Array.from({ length: count }, (_, index) => ticket(index + 1));
  const reservations = actors.map((actor, index) =>
    runtime.reserve(actor, `screen-share-socket-${index + 1}`),
  );
  const office = (
    runtime as unknown as {
      offices: Map<
        string,
        { participants: Map<string, { publicState: WorldSnapshot['participants'][number] }> }
      >;
    }
  ).offices.get(actors[0]!.officeId)!;
  const room = COMMONS_GEOMETRY.zones.find((zone) => zone.kind === 'meeting')!;
  const position = {
    x: (room.bounds.tx + 0.5) * COMMONS_GEOMETRY.tileSize,
    y: (room.bounds.ty + 0.5) * COMMONS_GEOMETRY.tileSize,
  };
  for (const reservation of reservations)
    office.participants.get(reservation.participationId)!.publicState.position = position;
  const join = (index: number) =>
    runtime.joinMeetingZone(
      actors[index]!.officeId,
      actors[index]!.workspaceId,
      actors[index]!.userId,
      `screen-share-socket-${index + 1}`,
      reservations[index]!.participationId,
      actors[index]!.officeEpoch,
      room.zoneId,
    );
  const currentMeeting = () =>
    runtime.meetingZones(actors[0]!.officeId)!.zones.find((zone) => zone.zoneId === room.zoneId)!
      .meeting!;
  const operate = (
    operation: 'start' | 'confirm' | 'stop',
    index: number,
    shareId: string,
    conversationVersion = currentMeeting().version,
    socketId = `screen-share-socket-${index + 1}`,
  ) => {
    const actor = actors[index]!;
    const participationId = reservations[index]!.participationId;
    const common = [
      actor.officeId,
      actor.workspaceId,
      actor.userId,
      socketId,
      participationId,
      actor.officeEpoch,
      currentMeeting().conversationId,
    ] as const;
    if (operation === 'start')
      return runtime.startMeetingScreenShare(...common, conversationVersion, shareId);
    if (operation === 'confirm') return runtime.confirmMeetingScreenShare(...common, shareId);
    return runtime.stopMeetingScreenShare(...common, shareId);
  };
  return { runtime, actors, reservations, room, join, currentMeeting, operate };
}

describe('office runtime reservations', () => {
  it('projects stable meeting rooms with authoritative occupancy, admission, and entrances', () => {
    const runtime = new OfficeRuntimeService();
    const active = ticket(1);
    const reservation = runtime.reserve(active, 'socket-1');
    const office = (
      runtime as unknown as {
        offices: Map<
          string,
          { participants: Map<string, { publicState: { position: { x: number; y: number } } }> }
        >;
      }
    ).offices.get(active.officeId)!;
    office.participants.get(reservation.participationId)!.publicState.position = {
      x: 2 * COMMONS_GEOMETRY.tileSize + 16,
      y: 4 * COMMONS_GEOMETRY.tileSize + 16,
    };
    const rooms = runtime.meetingZones(active.officeId);
    expect(rooms?.zones.map((zone) => zone.zoneId)).toEqual([
      'commons-northwest-meeting',
      'commons-southeast-meeting',
    ]);
    expect(rooms?.zones[0]).toMatchObject({
      occupancy: [reservation.participationId],
      admittedMembers: [],
      accessPolicy: 'explicit-admission',
      meeting: null,
      entrances: [{ side: 'south', at: 4, state: 'occupied' }],
    });
    expect(
      runtime.joinMeetingZone(
        active.officeId,
        active.workspaceId,
        active.userId,
        'socket-1',
        reservation.participationId,
        active.officeEpoch,
        'commons-northwest-meeting',
      ),
    ).toMatchObject({ notices: [] });
    expect(runtime.meetingZones(active.officeId)?.zones[0]?.admittedMembers).toEqual([
      reservation.participationId,
    ]);
    office.participants.get(reservation.participationId)!.publicState.position = {
      ...COMMONS_GEOMETRY.spawn,
    };
    runtime.reconcileProximity(active.officeId);
    expect(runtime.meetingZones(active.officeId)?.zones[0]?.admittedMembers).toEqual([]);
    expect(runtime.proximityMediaPermits()).toEqual([]);
  });

  it('retires media authorization as soon as authoritative position leaves an admitted room', () => {
    const runtime = new OfficeRuntimeService();
    const active = ticket(1);
    const reservation = runtime.reserve(active, 'socket-1');
    const office = (
      runtime as unknown as {
        offices: Map<
          string,
          { participants: Map<string, { publicState: { position: { x: number; y: number } } }> }
        >;
      }
    ).offices.get(active.officeId)!;
    const participant = office.participants.get(reservation.participationId)!;
    participant.publicState.position = {
      x: 2 * COMMONS_GEOMETRY.tileSize + 16,
      y: 4 * COMMONS_GEOMETRY.tileSize + 16,
    };
    expect(runtime.proximityMediaPermits()).toEqual([]);
    const joined = runtime.joinMeetingZone(
      active.officeId,
      active.workspaceId,
      active.userId,
      'socket-1',
      reservation.participationId,
      active.officeEpoch,
      'commons-northwest-meeting',
    );
    if (typeof joined === 'string') throw new Error(joined);
    // First member has no prior proximity group; meeting state is queued separately.
    const meetingRuntime = (
      runtime as unknown as {
        offices: Map<string, { meetingGroups: Map<string, { generation: string }> }>;
      }
    ).offices.get(active.officeId)!;
    const generation = meetingRuntime.meetingGroups.get('commons-northwest-meeting')!.generation;
    expect(runtime.activateProximityGeneration(generation)[0]?.update.state).toBe('active');
    const meeting = runtime.meetingZones(active.officeId)!.zones[0]!.meeting!;
    expect(runtime.proximityMediaPermits()).toMatchObject([
      { identity: reservation.participationId, generation },
    ]);
    participant.publicState.position = { ...COMMONS_GEOMETRY.spawn };
    expect(
      runtime.conversationMediaParticipation(
        reservation.participationId,
        meeting.conversationId,
        meeting.version,
      ),
    ).toBeNull();
    expect(runtime.proximityMediaPermits()).toEqual([]);
    expect(runtime.meetingZones(active.officeId)?.zones[0]?.admittedMembers).toEqual([]);
  });

  it('keeps one meeting room identity through joins, departures, re-entry, and creates a new one after end', () => {
    const runtime = new OfficeRuntimeService();
    const actors = [ticket(1), ticket(2), ticket(3)];
    const reservations = actors.map((actor, index) =>
      runtime.reserve(actor, `meeting-socket-${index + 1}`),
    );
    const office = (
      runtime as unknown as {
        offices: Map<
          string,
          {
            participants: Map<string, { publicState: { position: { x: number; y: number } } }>;
          }
        >;
      }
    ).offices.get(actors[0]!.officeId)!;
    const roomPosition = {
      x: 2 * COMMONS_GEOMETRY.tileSize + 16,
      y: 4 * COMMONS_GEOMETRY.tileSize + 16,
    };
    for (const reservation of reservations)
      office.participants.get(reservation.participationId)!.publicState.position = roomPosition;

    const join = (index: number) =>
      runtime.joinMeetingZone(
        actors[index]!.officeId,
        actors[index]!.workspaceId,
        actors[index]!.userId,
        `meeting-socket-${index + 1}`,
        reservations[index]!.participationId,
        actors[index]!.officeEpoch,
        'commons-northwest-meeting',
      );
    const currentMeeting = () =>
      runtime
        .meetingZones(actors[0]!.officeId)!
        .zones.find((zone) => zone.zoneId === 'commons-northwest-meeting')!.meeting!;
    const permits = () => runtime.proximityMediaPermits();
    const identitiesFor = (generation: string) =>
      new Set(
        permits()
          .filter((permit) => permit.generation === generation)
          .map((p) => p.identity),
      );

    expect(typeof join(0)).toBe('object');
    runtime.reconcileProximity(actors[0]!.officeId);
    const first = currentMeeting();
    const firstGeneration = permits()[0]!.generation;
    expect(
      runtime.activateProximityGeneration(firstGeneration, identitiesFor(firstGeneration))[0]
        ?.update.state,
    ).toBe('active');

    expect(typeof join(1)).toBe('object');
    const secondJoinNotices = runtime.reconcileProximity(actors[0]!.officeId);
    expect(secondJoinNotices).toHaveLength(1);
    expect(secondJoinNotices[0]!.socketIds).toEqual(['meeting-socket-2']);
    expect(secondJoinNotices[0]!.update).toMatchObject({
      state: 'joining',
      conversationId: first.conversationId,
      generation: firstGeneration,
    });
    expect(secondJoinNotices[0]!.update.participants.map((p) => p.participationId).sort()).toEqual(
      [reservations[0]!.participationId, reservations[1]!.participationId].sort(),
    );
    expect(currentMeeting()).toMatchObject({
      conversationId: first.conversationId,
      state: 'active',
    });
    expect(currentMeeting().version).toBeGreaterThan(first.version);
    expect(
      runtime.activateProximityGeneration(
        firstGeneration,
        new Set([reservations[0]!.participationId]),
      ),
    ).toEqual([]);
    const afterJoinReady = runtime.activateProximityGeneration(
      firstGeneration,
      identitiesFor(firstGeneration),
    )[0]!.update;
    expect(afterJoinReady).toMatchObject({
      state: 'active',
      conversationId: first.conversationId,
      generation: firstGeneration,
    });
    expect(afterJoinReady.participants.map((p) => p.participationId).sort()).toEqual(
      [reservations[0]!.participationId, reservations[1]!.participationId].sort(),
    );
    expect(
      runtime.conversationMediaParticipation(
        reservations[0]!.participationId,
        first.conversationId,
        afterJoinReady.version,
      )?.generation,
    ).toBe(firstGeneration);

    const leaveSecond = runtime.leaveProximityConversation(
      actors[1]!.officeId,
      actors[1]!.workspaceId,
      actors[1]!.userId,
      'meeting-socket-2',
      reservations[1]!.participationId,
      actors[1]!.officeEpoch,
      first.conversationId,
      afterJoinReady.version,
    );
    expect(typeof leaveSecond).toBe('object');
    const departureNotices = runtime.reconcileProximity(actors[0]!.officeId);
    expect(departureNotices.map((notice) => notice.update.state)).toEqual(['ended', 'active']);
    const departureVersion = departureNotices[0]!.update.version;
    expect(departureNotices[0]!.update.generation).toBe(firstGeneration);
    expect(departureNotices[1]!.update.generation).toBe(firstGeneration);
    expect(
      runtime.conversationMediaParticipation(
        reservations[1]!.participationId,
        first.conversationId,
        departureVersion,
      ),
    ).toBeNull();

    expect(typeof join(1)).toBe('object');
    const reentryNotice = runtime.reconcileProximity(actors[0]!.officeId)[0]!;
    expect(reentryNotice.socketIds).toEqual(['meeting-socket-2']);
    expect(reentryNotice.update).toMatchObject({
      state: 'joining',
      conversationId: first.conversationId,
      generation: firstGeneration,
      version: expect.any(Number),
    });
    expect(reentryNotice.update.version).toBeGreaterThan(departureVersion);
    const reentryReady = runtime.activateProximityGeneration(
      firstGeneration,
      identitiesFor(firstGeneration),
    )[0]!.update;
    expect(reentryReady.participants).toHaveLength(2);
    expect(reentryReady.generation).toBe(firstGeneration);

    for (const index of [0, 1]) {
      const activeMeeting = currentMeeting();
      const leaving = runtime.leaveProximityConversation(
        actors[index]!.officeId,
        actors[index]!.workspaceId,
        actors[index]!.userId,
        `meeting-socket-${index + 1}`,
        reservations[index]!.participationId,
        actors[index]!.officeEpoch,
        activeMeeting.conversationId,
        activeMeeting.version,
      );
      expect(typeof leaving).toBe('object');
      runtime.reconcileProximity(actors[0]!.officeId);
    }
    expect(currentMeeting()).toBeNull();

    expect(typeof join(2)).toBe('object');
    runtime.reconcileProximity(actors[0]!.officeId);
    const newMeeting = currentMeeting();
    const newGeneration = permits()[0]!.generation;
    expect(newMeeting.conversationId).not.toBe(first.conversationId);
    expect(newGeneration).not.toBe(firstGeneration);
  });

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
      ticket(1).userId,
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

describe('authoritative meeting screen-share state', () => {
  it('serializes competing presenters and makes start, confirm, and stop retries idempotent', async () => {
    const fixture = meetingFixture();
    fixture.join(0);
    fixture.join(1);
    fixture.runtime.drainMeetingScreenShareNotices();
    const firstShare = '30000000-0000-4000-8000-000000000001';
    const secondShare = '30000000-0000-4000-8000-000000000002';
    const starts = await Promise.all([
      Promise.resolve().then(() => fixture.operate('start', 0, firstShare)),
      Promise.resolve().then(() => fixture.operate('start', 1, secondShare)),
    ]);
    expect(starts.filter((result) => result === null)).toHaveLength(1);
    expect(starts.filter((result) => result === 'conflict')).toHaveLength(1);
    const startingNotice = fixture.runtime.drainMeetingScreenShareNotices();
    expect(startingNotice).toHaveLength(1);
    expect(startingNotice[0]!.socketIds.sort()).toEqual([
      'screen-share-socket-1',
      'screen-share-socket-2',
    ]);
    const winningShare = startingNotice[0]!.update.presentation!.shareId;
    const winningPresenter = winningShare === firstShare ? 0 : 1;
    const meetingMemberIds = fixture.reservations
      .slice(0, 2)
      .map(({ participationId }) => participationId);
    const grantedPermits = fixture.runtime
      .conversationMediaPermits()
      .filter((permit) => meetingMemberIds.includes(permit.identity));
    expect(
      grantedPermits.find(
        (permit) => permit.identity === fixture.reservations[winningPresenter]!.participationId,
      )?.sources,
    ).toEqual(['microphone', 'screen_share']);
    expect(
      grantedPermits
        .filter(
          (permit) => permit.identity !== fixture.reservations[winningPresenter]!.participationId,
        )
        .every((permit) => permit.sources.length === 1 && permit.sources[0] === 'microphone'),
    ).toBe(true);

    expect(fixture.operate('start', winningPresenter, winningShare)).toBeNull();
    const retriedStart = fixture.runtime.drainMeetingScreenShareNotices();
    expect(retriedStart).toHaveLength(1);
    expect(retriedStart[0]!.update.version).toBe(startingNotice[0]!.update.version);
    expect(fixture.operate('confirm', winningPresenter, winningShare)).toBeNull();
    expect(fixture.operate('confirm', winningPresenter, winningShare)).toBeNull();
    const liveNotices = fixture.runtime.drainMeetingScreenShareNotices();
    expect(liveNotices).toHaveLength(1);
    expect(liveNotices[0]!.update.presentation).toMatchObject({
      shareId: winningShare,
      presenterParticipationId: fixture.reservations[winningPresenter]!.participationId,
      status: 'live',
    });

    expect(fixture.operate('stop', winningPresenter, winningShare)).toBeNull();
    expect(fixture.operate('stop', winningPresenter, winningShare)).toBeNull();
    const stoppedNotices = fixture.runtime.drainMeetingScreenShareNotices();
    expect(stoppedNotices).toHaveLength(2);
    expect(stoppedNotices[0]!.update.version).toBe(stoppedNotices[1]!.update.version);
    expect(stoppedNotices[0]!.update.presentation).toBeNull();
    expect(
      fixture.runtime
        .conversationMediaPermits()
        .filter(
          (permit) => permit.identity === fixture.reservations[winningPresenter]!.participationId,
        )
        .every((permit) => permit.sources.length === 1 && permit.sources[0] === 'microphone'),
    ).toBe(true);
    expect(fixture.operate('start', winningPresenter, secondShare)).toBeNull();
    fixture.runtime.drainMeetingScreenShareNotices();
    expect(fixture.operate('stop', winningPresenter, winningShare)).toBe('conflict');
    expect(
      fixture.runtime.meetingScreenShareState(
        fixture.actors[0]!.officeId,
        fixture.reservations[winningPresenter]!.participationId,
      )[0]!.update.presentation?.shareId,
    ).toBe(secondShare);
  });

  it('rejects nonmembers and nonpresenters and clears an owner share on departure', () => {
    const fixture = meetingFixture(3);
    fixture.join(0);
    fixture.join(1);
    const meeting = fixture.currentMeeting();
    fixture.runtime.drainMeetingScreenShareNotices();
    const shareId = '30000000-0000-4000-8000-000000000003';
    expect(fixture.operate('start', 0, shareId)).toBeNull();
    fixture.runtime.drainMeetingScreenShareNotices();
    expect(fixture.operate('stop', 1, shareId)).toBe('conflict');
    expect(fixture.operate('start', 2, '30000000-0000-4000-8000-000000000004')).toBe(
      'unauthorized',
    );

    const result = fixture.runtime.leaveProximityConversation(
      fixture.actors[0]!.officeId,
      fixture.actors[0]!.workspaceId,
      fixture.actors[0]!.userId,
      'screen-share-socket-1',
      fixture.reservations[0]!.participationId,
      fixture.actors[0]!.officeEpoch,
      meeting.conversationId,
      meeting.version,
    );
    expect(typeof result).toBe('object');
    const ended = fixture.runtime.drainMeetingScreenShareNotices();
    expect(ended).toHaveLength(1);
    expect(ended[0]!.socketIds).toEqual(['screen-share-socket-2']);
    expect(ended[0]!.update.presentation).toBeNull();
  });

  it('expires abandoned starts and rejects their late confirm and replay', () => {
    const fixture = meetingFixture(1);
    fixture.join(0);
    fixture.runtime.drainMeetingScreenShareNotices();
    const actor = fixture.actors[0]!;
    const participationId = fixture.reservations[0]!.participationId;
    const conversation = fixture.currentMeeting();
    const shareId = '30000000-0000-4000-8000-000000000005';
    const now = performance.now();
    expect(
      fixture.runtime.startMeetingScreenShare(
        actor.officeId,
        actor.workspaceId,
        actor.userId,
        'screen-share-socket-1',
        participationId,
        actor.officeEpoch,
        conversation.conversationId,
        conversation.version,
        shareId,
        now,
        Date.now(),
      ),
    ).toBeNull();
    fixture.runtime.drainMeetingScreenShareNotices();
    fixture.runtime.tick(actor.officeId, now + OFFICE_LIMITS.meetingScreenShareStartTimeoutMs + 1);
    const expired = fixture.runtime.drainMeetingScreenShareNotices();
    expect(expired).toHaveLength(1);
    expect(expired[0]!.update.presentation).toBeNull();
    expect(
      fixture.runtime
        .conversationMediaPermits()
        .every((permit) => permit.sources.length === 1 && permit.sources[0] === 'microphone'),
    ).toBe(true);
    expect(fixture.operate('confirm', 0, shareId)).toBe('conflict');
    expect(fixture.operate('start', 0, shareId)).toBe('conflict');
  });

  it('releases a live presenter when the bounded confirmation lease is not renewed', () => {
    const fixture = meetingFixture(1);
    fixture.join(0);
    fixture.runtime.drainMeetingScreenShareNotices();
    const shareId = '30000000-0000-4000-8000-000000000022';
    expect(fixture.operate('start', 0, shareId)).toBeNull();
    expect(fixture.operate('confirm', 0, shareId)).toBeNull();
    fixture.runtime.drainMeetingScreenShareNotices();

    const now = performance.now();
    fixture.runtime.tick(
      fixture.actors[0]!.officeId,
      now + OFFICE_LIMITS.meetingScreenShareLeaseMs - 1,
    );
    expect(
      fixture.runtime.activeMeetingScreenShare(
        fixture.runtime.conversationMediaPermits()[0]!.generation,
      ),
    ).toMatchObject({
      shareId,
      status: 'live',
    });
    fixture.runtime.tick(
      fixture.actors[0]!.officeId,
      now + OFFICE_LIMITS.meetingScreenShareLeaseMs + 1,
    );
    expect(
      fixture.runtime.activeMeetingScreenShare(
        fixture.runtime.conversationMediaPermits()[0]!.generation,
      ),
    ).toBeNull();
    expect(fixture.runtime.drainMeetingScreenShareNotices()[0]!.update.presentation).toBeNull();
  });

  it('clears only the matching observed share and ignores stale media events', () => {
    const fixture = meetingFixture(2);
    fixture.join(0);
    fixture.join(1);
    const room = fixture.currentMeeting().conversationId;
    const roomGeneration = fixture.runtime.conversationMediaPermits()[0]!.generation;
    const presenter = fixture.reservations[0]!.participationId;
    const firstShare = '30000000-0000-4000-8000-000000000020';
    const nextShare = '30000000-0000-4000-8000-000000000021';

    expect(fixture.operate('start', 0, firstShare)).toBeNull();
    expect(fixture.operate('confirm', 0, firstShare)).toBeNull();
    expect(fixture.runtime.activeMeetingScreenShare(roomGeneration)).toMatchObject({
      shareId: firstShare,
      presenterParticipationId: presenter,
      status: 'live',
    });

    expect(
      fixture.runtime.clearMeetingScreenShareFromMediaObservation(
        roomGeneration,
        presenter,
        '30000000-0000-4000-8000-000000000099',
      ),
    ).toBe(false);
    expect(
      fixture.runtime.clearMeetingScreenShareFromMediaObservation(
        roomGeneration,
        fixture.reservations[1]!.participationId,
        firstShare,
      ),
    ).toBe(false);
    expect(
      fixture.runtime.clearMeetingScreenShareFromMediaObservation(
        roomGeneration,
        presenter,
        firstShare,
      ),
    ).toBe(true);
    fixture.runtime.drainMeetingScreenShareNotices();

    expect(fixture.operate('start', 0, nextShare)).toBeNull();
    expect(
      fixture.runtime.clearMeetingScreenShareFromMediaObservation(
        roomGeneration,
        presenter,
        firstShare,
      ),
    ).toBe(false);
    expect(fixture.runtime.activeMeetingScreenShare(roomGeneration)?.shareId).toBe(nextShare);
    expect(fixture.runtime.activeMeetingScreenShare(room)).toBeNull();
  });

  it('clears presenter state when the presenter authorization is released', () => {
    const fixture = meetingFixture(2);
    fixture.join(0);
    fixture.join(1);
    const shareId = '30000000-0000-4000-8000-000000000008';
    expect(fixture.operate('start', 0, shareId)).toBeNull();
    fixture.runtime.drainMeetingScreenShareNotices();
    fixture.runtime.release(
      fixture.actors[0]!.officeId,
      fixture.actors[0]!.workspaceId,
      fixture.actors[0]!.userId,
      'screen-share-socket-1',
      fixture.reservations[0]!.participationId,
    );
    const updates = fixture.runtime.drainMeetingScreenShareNotices();
    expect(updates).toHaveLength(1);
    expect(updates[0]!.socketIds).toEqual(['screen-share-socket-2']);
    expect(updates[0]!.update.presentation).toBeNull();
  });

  it('sends current presentation state to newly admitted and reconnected viewers without changing proximity', () => {
    const fixture = meetingFixture(5);
    fixture.join(0);
    fixture.join(1);
    const officeId = fixture.actors[0]!.officeId;
    const office = (
      fixture.runtime as unknown as {
        offices: Map<
          string,
          { participants: Map<string, { publicState: WorldSnapshot['participants'][number] }> }
        >;
      }
    ).offices.get(officeId)!;
    const proximityIds = [
      fixture.reservations[3]!.participationId,
      fixture.reservations[4]!.participationId,
    ];
    for (const id of proximityIds)
      office.participants.get(id)!.publicState.position = COMMONS_GEOMETRY.spawn;
    for (const index of [3, 4]) {
      const actor = fixture.actors[index]!;
      fixture.runtime.setProximityOptIn(
        actor.officeId,
        actor.workspaceId,
        actor.userId,
        `screen-share-socket-${index + 1}`,
        fixture.reservations[index]!.participationId,
        actor.officeEpoch,
        true,
      );
    }
    const permitsBeforeShare = fixture.runtime
      .proximityMediaPermits()
      .filter((permit) => proximityIds.includes(permit.identity));
    expect(permitsBeforeShare).toHaveLength(2);
    const shareId = '30000000-0000-4000-8000-000000000006';
    expect(fixture.operate('start', 0, shareId)).toBeNull();
    fixture.runtime.drainMeetingScreenShareNotices();
    expect(
      fixture.runtime
        .proximityMediaPermits()
        .filter((permit) => proximityIds.includes(permit.identity)),
    ).toEqual(permitsBeforeShare);

    const viewer = fixture.actors[2]!;
    const oldViewer = fixture.reservations[2]!;
    const roomPosition = {
      x: (fixture.room.bounds.tx + 0.5) * COMMONS_GEOMETRY.tileSize,
      y: (fixture.room.bounds.ty + 0.5) * COMMONS_GEOMETRY.tileSize,
    };
    office.participants.get(oldViewer.participationId)!.publicState.position = roomPosition;
    fixture.join(2);
    const admitted = fixture.runtime.drainMeetingScreenShareNotices();
    expect(admitted).toHaveLength(1);
    expect(admitted[0]!.socketIds).toEqual(['screen-share-socket-3']);
    expect(admitted[0]!.update.presentation?.shareId).toBe(shareId);

    fixture.runtime.release(
      viewer.officeId,
      viewer.workspaceId,
      viewer.userId,
      'screen-share-socket-3',
      oldViewer.participationId,
    );
    fixture.runtime.drainMeetingScreenShareNotices();
    const reconnect = fixture.runtime.reserve(viewer, 'screen-share-reconnected');
    office.participants.get(reconnect.participationId)!.publicState.position = roomPosition;
    fixture.runtime.joinMeetingZone(
      viewer.officeId,
      viewer.workspaceId,
      viewer.userId,
      'screen-share-reconnected',
      reconnect.participationId,
      viewer.officeEpoch,
      fixture.room.zoneId,
    );
    const restored = fixture.runtime.drainMeetingScreenShareNotices();
    expect(restored).toHaveLength(1);
    expect(restored[0]!.socketIds).toEqual(['screen-share-reconnected']);
    expect(restored[0]!.update.presentation?.shareId).toBe(shareId);
    expect(
      fixture.runtime.meetingScreenShareState(viewer.officeId, reconnect.participationId)[0]!.update
        .presentation?.shareId,
    ).toBe(shareId);
  });
});
