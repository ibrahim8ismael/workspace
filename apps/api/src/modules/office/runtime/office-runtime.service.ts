import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  OFFICE_LIMITS,
  officeReadySchema,
  worldDeltaSchema,
  worldSnapshotSchema,
} from '@gather/contracts';
import type { WorldDelta, WorldSnapshot } from '@gather/contracts';
import { canStep, pixelToTile } from '@gather/world';
import { invariant } from '../../../platform/http/errors.js';
import { digest, newSecret } from '../../identity/security/secrets.js';
import { trustedOfficeMap } from '../office-map-registry.js';
import type { TrustedOfficeMap } from '../office-map-registry.js';

export interface ConsumedOfficeTicket {
  userId: string;
  displayName: string;
  sessionId: string;
  membershipGrantId: string;
  workspaceId: string;
  officeId: string;
  officeEpoch: string;
  mapVersion: string;
  protocolVersion: number;
  takeoverParticipationId?: string;
  takeoverOfficeEpoch?: string;
}

interface RuntimeParticipant {
  readonly socketId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly membershipGrantId: string;
  readonly publicState: WorldSnapshot['participants'][number];
  lastAcceptedInputSequence: number;
  hasAcceptedInput: boolean;
  inputTimestamps: number[];
  inputIntent: { dx: number; dy: number; expiresAt: number };
}

interface OfficeRuntime {
  readonly officeId: string;
  readonly workspaceId: string;
  readonly officeEpoch: string;
  readonly mapVersion: string;
  readonly map: TrustedOfficeMap;
  stateVersion: number;
  readonly participants: Map<string, RuntimeParticipant>;
  readonly participationByActor: Map<string, string>;
  readonly seats: Map<string, string | null>;
  lastSimulationAt: number;
  lastBroadcastAt: number;
  readonly dirtyParticipants: Set<string>;
}

export interface OfficeReservation {
  readonly roomId: string;
  readonly participationId: string;
  readonly retiredOfficeEpoch: string | null;
  readonly retiredSocketIds: readonly string[];
  readonly retiredReason: 'taken_over' | 'server_unavailable' | null;
  readonly ready: {
    participationId: string;
    workspaceId: string;
    officeId: string;
    mapVersion: string;
    protocolVersion: number;
    snapshot: WorldSnapshot;
  };
  readonly joined: WorldDelta;
}

export interface MovementIntent {
  readonly eventId: string;
  readonly officeEpoch: string;
  readonly sequence: number;
  readonly dx: -1 | 0 | 1;
  readonly dy: -1 | 0 | 1;
}

export interface TakeoverReferenceBinding {
  readonly userId: string;
  readonly sessionId: string;
  readonly membershipGrantId: string;
  readonly workspaceId: string;
  readonly officeId: string;
  readonly officeEpoch: string;
  readonly participationId: string;
}

interface StoredTakeoverReference extends TakeoverReferenceBinding {
  readonly expiresAt: number;
}

@Injectable()
export class OfficeRuntimeService {
  private readonly offices = new Map<string, OfficeRuntime>();
  private readonly takeoverReferences = new Map<string, StoredTakeoverReference>();

  issueTakeoverReference(binding: TakeoverReferenceBinding, expiresAt: number) {
    const office = this.offices.get(binding.officeId);
    const activeParticipationId = office?.participationByActor.get(
      `${binding.workspaceId}:${binding.userId}`,
    );
    const participant = activeParticipationId
      ? office?.participants.get(activeParticipationId)
      : undefined;
    if (
      !office ||
      office.workspaceId !== binding.workspaceId ||
      office.officeEpoch !== binding.officeEpoch ||
      activeParticipationId !== binding.participationId ||
      !participant ||
      participant.userId !== binding.userId ||
      participant.sessionId !== binding.sessionId ||
      participant.membershipGrantId !== binding.membershipGrantId
    )
      return 'invalid_target' as const;

    this.pruneTakeoverReferences();
    if (this.takeoverReferences.size >= OFFICE_LIMITS.maxTrackedTakeoverReferences)
      return 'rate_limited' as const;

    const reference = newSecret();
    this.takeoverReferences.set(digest(reference), {
      ...binding,
      expiresAt: performance.now() + Math.max(0, expiresAt - Date.now()),
    });
    return {
      reference,
      participationId: binding.participationId,
      officeEpoch: binding.officeEpoch,
    };
  }

  consumeTakeoverReference(reference: string, binding: TakeoverReferenceBinding) {
    this.pruneTakeoverReferences();
    const key = digest(reference);
    const stored = this.takeoverReferences.get(key);
    if (!stored) return 'invalid_token' as const;
    if (
      stored.userId !== binding.userId ||
      stored.sessionId !== binding.sessionId ||
      stored.membershipGrantId !== binding.membershipGrantId ||
      stored.workspaceId !== binding.workspaceId ||
      stored.officeId !== binding.officeId ||
      stored.officeEpoch !== binding.officeEpoch ||
      stored.participationId !== binding.participationId
    )
      return 'unauthorized' as const;
    const office = this.offices.get(stored.officeId);
    const participant = office?.participants.get(stored.participationId);
    if (
      !office ||
      office.officeEpoch !== stored.officeEpoch ||
      !participant ||
      participant.userId !== stored.userId ||
      participant.sessionId !== stored.sessionId ||
      participant.membershipGrantId !== stored.membershipGrantId
    ) {
      this.takeoverReferences.delete(key);
      return 'invalid_target' as const;
    }
    this.takeoverReferences.delete(key);
    return {
      participationId: stored.participationId,
      officeEpoch: stored.officeEpoch,
    };
  }

  reserve(ticket: ConsumedOfficeTicket, socketId: string): OfficeReservation {
    const map = trustedOfficeMap(ticket.mapVersion);
    invariant(map, 409, 'office_not_ready');
    const current = this.offices.get(ticket.officeId);
    let retiredOfficeEpoch: string | null = null;
    let retiredSocketIds: string[] = [];
    let retiredReason: OfficeReservation['retiredReason'] = null;
    if (current && current.officeEpoch !== ticket.officeEpoch) {
      // A new process epoch cannot inherit stale in-memory participants.
      retiredOfficeEpoch = current.officeEpoch;
      retiredReason = 'server_unavailable';
      retiredSocketIds = [...current.participants.values()].map(
        (participant) => participant.socketId,
      );
    }
    const office: OfficeRuntime =
      current?.officeEpoch === ticket.officeEpoch
        ? current
        : {
            officeId: ticket.officeId,
            workspaceId: ticket.workspaceId,
            officeEpoch: ticket.officeEpoch,
            mapVersion: ticket.mapVersion,
            map,
            stateVersion: 0,
            participants: new Map(),
            participationByActor: new Map(),
            seats: this.emptySeats(map),
            lastSimulationAt: performance.now(),
            lastBroadcastAt: performance.now(),
            dirtyParticipants: new Set(),
          };

    invariant(office.workspaceId === ticket.workspaceId, 401, 'unauthorized');
    invariant(office.mapVersion === ticket.mapVersion, 409, 'map_version_mismatch');
    const actorKey = `${ticket.workspaceId}:${ticket.userId}`;
    const activeParticipationId = office.participationByActor.get(actorKey);
    const removedParticipationIds: string[] = [];
    const changedSeats: WorldSnapshot['seats'] = [];
    let retiringParticipant: RuntimeParticipant | undefined;
    let releasedSeatId: string | null = null;
    invariant(
      Boolean(ticket.takeoverParticipationId) === Boolean(ticket.takeoverOfficeEpoch),
      409,
      'participation_conflict',
    );
    if (ticket.takeoverParticipationId && ticket.takeoverOfficeEpoch) {
      invariant(
        activeParticipationId === ticket.takeoverParticipationId &&
          ticket.takeoverOfficeEpoch === office.officeEpoch,
        409,
        'participation_conflict',
      );
      const previous = office.participants.get(ticket.takeoverParticipationId);
      invariant(
        previous &&
          previous.userId === ticket.userId &&
          previous.sessionId === ticket.sessionId &&
          previous.membershipGrantId === ticket.membershipGrantId,
        409,
        'participation_conflict',
      );
      retiringParticipant = previous;
      releasedSeatId = previous.publicState.seatId;
      if (releasedSeatId) {
        changedSeats.push({ seatId: releasedSeatId, occupantParticipationId: null });
      }
      removedParticipationIds.push(ticket.takeoverParticipationId);
      retiredSocketIds.push(previous.socketId);
      retiredReason = 'taken_over';
    } else {
      invariant(!activeParticipationId, 409, 'participation_conflict');
    }
    const nextParticipants = new Map(office.participants);
    const nextParticipationByActor = new Map(office.participationByActor);
    const nextSeats = new Map(office.seats);
    if (retiringParticipant && ticket.takeoverParticipationId) {
      nextParticipants.delete(ticket.takeoverParticipationId);
      nextParticipationByActor.delete(actorKey);
      if (releasedSeatId) nextSeats.set(releasedSeatId, null);
    }
    invariant(nextParticipants.size < OFFICE_LIMITS.maxParticipants, 409, 'room_full');
    const reservationOffice: OfficeRuntime = retiringParticipant
      ? {
          ...office,
          participants: nextParticipants,
          participationByActor: nextParticipationByActor,
          seats: nextSeats,
        }
      : office;

    const participationId = randomUUID();
    const participant: WorldSnapshot['participants'][number] = {
      participationId,
      displayName: ticket.displayName,
      appearance: map.defaultAppearance,
      position: this.spawnFor(reservationOffice),
      facing: 'south',
      availability: 'available',
      seatId: null,
      lastProcessedInputSequence: 0,
    };
    const baseVersion = office.stateVersion;
    const nextVersion = baseVersion + 1;
    const snapshot = worldSnapshotSchema.parse(
      this.snapshot(reservationOffice, participant, nextVersion),
    );
    const ready = officeReadySchema.parse({
      participationId,
      workspaceId: ticket.workspaceId,
      officeId: ticket.officeId,
      mapVersion: ticket.mapVersion,
      protocolVersion: ticket.protocolVersion,
      snapshot,
    });
    const joined = worldDeltaSchema.parse({
      officeEpoch: office.officeEpoch,
      baseVersion,
      stateVersion: nextVersion,
      serverTime: Date.now(),
      participants: [participant],
      removedParticipationIds,
      seats: changedSeats,
    });
    const roomId = this.roomId(ticket.workspaceId, ticket.officeId);
    if (retiringParticipant && ticket.takeoverParticipationId) {
      office.participants.delete(ticket.takeoverParticipationId);
      office.participationByActor.delete(actorKey);
      office.dirtyParticipants.delete(ticket.takeoverParticipationId);
      if (releasedSeatId) office.seats.set(releasedSeatId, null);
      this.invalidateTakeoverReferences(ticket.takeoverParticipationId);
    }
    office.stateVersion = nextVersion;
    office.participants.set(participationId, {
      socketId,
      userId: ticket.userId,
      sessionId: ticket.sessionId,
      membershipGrantId: ticket.membershipGrantId,
      publicState: participant,
      lastAcceptedInputSequence: 0,
      hasAcceptedInput: false,
      inputTimestamps: [],
      inputIntent: { dx: 0, dy: 0, expiresAt: 0 },
    });
    office.participationByActor.set(actorKey, participationId);
    this.offices.set(ticket.officeId, office);
    return {
      roomId,
      participationId,
      retiredOfficeEpoch,
      retiredSocketIds,
      retiredReason,
      ready,
      joined,
    };
  }

  release(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
  ): { roomId: string; delta: WorldDelta } | null {
    const office = this.offices.get(officeId);
    const participant = office?.participants.get(participationId);
    if (
      !office ||
      office.workspaceId !== workspaceId ||
      !participant ||
      participant.userId !== userId ||
      participant.socketId !== socketId
    )
      return null;

    const baseVersion = office.stateVersion;
    office.participants.delete(participationId);
    office.participationByActor.delete(`${workspaceId}:${userId}`);
    this.invalidateTakeoverReferences(participationId);
    const releasedSeatId = participant.publicState.seatId;
    if (releasedSeatId) office.seats.set(releasedSeatId, null);
    office.stateVersion += 1;
    const delta = worldDeltaSchema.parse({
      officeEpoch: office.officeEpoch,
      baseVersion,
      stateVersion: office.stateVersion,
      serverTime: Date.now(),
      participants: [],
      removedParticipationIds: [participationId],
      seats: releasedSeatId ? [{ seatId: releasedSeatId, occupantParticipationId: null }] : [],
    });
    if (office.participants.size === 0) this.offices.delete(officeId);
    return { roomId: this.roomId(workspaceId, officeId), delta };
  }

  setMovementIntent(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
    input: MovementIntent,
    now = performance.now(),
  ): 'stale_epoch' | 'stale_version' | 'rate_limited' | 'unauthorized' | 'conflict' | null {
    const office = this.offices.get(officeId);
    const participant = office?.participants.get(participationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== input.officeEpoch)
      return 'stale_epoch';
    if (!participant || participant.userId !== userId || participant.socketId !== socketId)
      return 'unauthorized';
    if (participant.publicState.seatId !== null) return 'conflict';
    if (participant.hasAcceptedInput && input.sequence <= participant.lastAcceptedInputSequence)
      return 'stale_version';

    participant.inputTimestamps = participant.inputTimestamps.filter((at) => now - at < 1000);
    if (participant.inputTimestamps.length >= OFFICE_LIMITS.movementInputsPerSecond)
      return 'rate_limited';
    participant.inputTimestamps.push(now);
    participant.lastAcceptedInputSequence = input.sequence;
    participant.hasAcceptedInput = true;
    participant.inputIntent = {
      dx: input.dx,
      dy: input.dy,
      expiresAt: now + OFFICE_LIMITS.movementIntentTimeoutMs,
    };
    return null;
  }

  setAvailability(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
    officeEpoch: string,
    availability: WorldSnapshot['participants'][number]['availability'],
  ): { roomId: string; delta: WorldDelta } | 'stale_epoch' | 'unauthorized' | null {
    const office = this.offices.get(officeId);
    const participant = office?.participants.get(participationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch';
    if (!participant || participant.userId !== userId || participant.socketId !== socketId)
      return 'unauthorized';
    if (participant.publicState.availability === availability) return null;
    participant.publicState.availability = availability;
    return this.change(office, [participant.publicState]);
  }

  resync(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
    officeEpoch: string,
    knownStateVersion: number,
  ):
    { roomId: string; snapshot: WorldSnapshot } | 'stale_epoch' | 'stale_version' | 'unauthorized' {
    const office = this.offices.get(officeId);
    const participant = office?.participants.get(participationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch';
    if (!participant || participant.userId !== userId || participant.socketId !== socketId)
      return 'unauthorized';
    if (knownStateVersion > office.stateVersion) return 'stale_version';
    return {
      roomId: this.roomId(workspaceId, officeId),
      snapshot: this.currentSnapshot(office),
    };
  }

  sit(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
    officeEpoch: string,
    seatId: string,
    now = performance.now(),
  ):
    | { roomId: string; delta: WorldDelta }
    | 'stale_epoch'
    | 'unauthorized'
    | 'seat_unavailable'
    | 'conflict' {
    const office = this.offices.get(officeId);
    const participant = office?.participants.get(participationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch';
    if (!participant || participant.userId !== userId || participant.socketId !== socketId)
      return 'unauthorized';
    const seat = office.map.seats.find((row) => row.seatId === seatId);
    if (!seat || office.seats.get(seatId) !== null || participant.publicState.seatId !== null)
      return 'seat_unavailable';
    if (
      participant.inputIntent.expiresAt > now &&
      (participant.inputIntent.dx !== 0 || participant.inputIntent.dy !== 0)
    )
      return 'conflict';
    const positionTile = pixelToTile(participant.publicState.position);
    const onSeatTile = positionTile.tx === seat.tile.tx && positionTile.ty === seat.tile.ty;
    if (
      !onSeatTile &&
      !canStep(positionTile, seat.tile, office.map.validated.bounds, office.map.validated.collision)
    )
      return 'seat_unavailable';
    if (
      [...office.participants.entries()].some(([otherId, other]) => {
        if (otherId === participationId) return false;
        const occupied = pixelToTile(other.publicState.position);
        return occupied.tx === seat.tile.tx && occupied.ty === seat.tile.ty;
      })
    )
      return 'seat_unavailable';

    participant.inputIntent = { dx: 0, dy: 0, expiresAt: 0 };
    participant.publicState.seatId = seatId;
    participant.publicState.position = {
      x: seat.tile.tx * office.map.geometry.tileSize + office.map.geometry.tileSize / 2,
      y: seat.tile.ty * office.map.geometry.tileSize + office.map.geometry.tileSize / 2,
    };
    office.seats.set(seatId, participationId);
    return this.change(
      office,
      [participant.publicState],
      [{ seatId, occupantParticipationId: participationId }],
    );
  }

  stand(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
    officeEpoch: string,
  ):
    | { roomId: string; delta: WorldDelta }
    | 'stale_epoch'
    | 'unauthorized'
    | 'seat_unavailable'
    | 'seat_exit_blocked' {
    const office = this.offices.get(officeId);
    const participant = office?.participants.get(participationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch';
    if (!participant || participant.userId !== userId || participant.socketId !== socketId)
      return 'unauthorized';
    const seatId = participant.publicState.seatId;
    if (!seatId) return 'seat_unavailable';
    const seat = office.map.seats.find((row) => row.seatId === seatId);
    if (!seat) return 'seat_unavailable';
    const exit = seat.exits.find((candidate) => {
      if (
        !canStep(seat.tile, candidate, office.map.validated.bounds, office.map.validated.collision)
      )
        return false;
      return ![...office.participants.entries()].some(([otherId, other]) => {
        if (otherId === participationId) return false;
        const occupied = pixelToTile(other.publicState.position);
        return occupied.tx === candidate.tx && occupied.ty === candidate.ty;
      });
    });
    if (!exit) return 'seat_exit_blocked';

    participant.publicState.position = {
      x: exit.tx * office.map.geometry.tileSize + office.map.geometry.tileSize / 2,
      y: exit.ty * office.map.geometry.tileSize + office.map.geometry.tileSize / 2,
    };
    participant.publicState.seatId = null;
    participant.inputIntent = { dx: 0, dy: 0, expiresAt: 0 };
    office.seats.set(seatId, null);
    return this.change(
      office,
      [participant.publicState],
      [{ seatId, occupantParticipationId: null }],
    );
  }

  hasOffice(officeId: string) {
    return this.offices.has(officeId);
  }

  tick(
    officeId: string,
    now = performance.now(),
    serverTime = Date.now(),
  ): { roomId: string; delta: WorldDelta } | null {
    const office = this.offices.get(officeId);
    if (!office) return null;
    const elapsedMs = Math.max(
      0,
      Math.min(1000 / OFFICE_LIMITS.simulationHz, now - office.lastSimulationAt),
    );
    office.lastSimulationAt = now;
    const seconds = elapsedMs / 1000;
    const pixels = OFFICE_LIMITS.movementSpeedPixelsPerSecond * seconds;
    for (const [participationId, participant] of office.participants) {
      const previous = participant.publicState.position;
      const nextSequence = Math.max(
        participant.publicState.lastProcessedInputSequence,
        participant.lastAcceptedInputSequence,
      );
      let nextPosition = previous;
      let dx = participant.inputIntent.dx;
      let dy = participant.inputIntent.dy;
      if (participant.inputIntent.expiresAt <= now) {
        dx = 0;
        dy = 0;
        participant.inputIntent = { dx: 0, dy: 0, expiresAt: 0 };
      }
      if (seconds > 0 && (dx !== 0 || dy !== 0)) {
        const magnitude = Math.hypot(dx, dy);
        const stepX = (dx / magnitude) * pixels;
        const stepY = (dy / magnitude) * pixels;
        let x = previous.x;
        let y = previous.y;
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(stepX), Math.abs(stepY)) / 8));
        for (let step = 0; step < steps; step += 1) {
          const candidateX = x + stepX / steps;
          if (this.canMoveBetween(office, participationId, { x, y }, { x: candidateX, y }))
            x = candidateX;
          const candidateY = y + stepY / steps;
          if (this.canMoveBetween(office, participationId, { x, y }, { x, y: candidateY }))
            y = candidateY;
        }
        nextPosition = { x, y };
      }

      const facing = this.facingFor(dx, dy, participant.publicState.facing);
      if (
        nextSequence !== participant.publicState.lastProcessedInputSequence ||
        nextPosition.x !== previous.x ||
        nextPosition.y !== previous.y ||
        facing !== participant.publicState.facing
      ) {
        participant.publicState.position = nextPosition;
        participant.publicState.facing = facing;
        participant.publicState.lastProcessedInputSequence = nextSequence;
        office.dirtyParticipants.add(participationId);
      }
    }
    if (
      office.dirtyParticipants.size === 0 ||
      now - office.lastBroadcastAt < 1000 / OFFICE_LIMITS.broadcastHz
    )
      return null;

    const baseVersion = office.stateVersion;
    office.stateVersion += 1;
    office.lastBroadcastAt = now;
    const changed = [...office.dirtyParticipants]
      .map((id) => office.participants.get(id)?.publicState)
      .filter((participant): participant is WorldSnapshot['participants'][number] => !!participant);
    office.dirtyParticipants.clear();
    return {
      roomId: this.roomId(office.workspaceId, office.officeId),
      delta: worldDeltaSchema.parse({
        officeEpoch: office.officeEpoch,
        baseVersion,
        stateVersion: office.stateVersion,
        serverTime,
        participants: changed,
        removedParticipationIds: [],
        seats: [],
      }),
    };
  }

  private canMoveBetween(
    office: OfficeRuntime,
    participationId: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    const fromTile = pixelToTile(from);
    const toTile = pixelToTile(to);
    if (fromTile.tx === toTile.tx && fromTile.ty === toTile.ty) return true;
    const occupiedSeat = office.map.seats.find(
      (seat) =>
        seat.tile.tx === toTile.tx &&
        seat.tile.ty === toTile.ty &&
        office.seats.get(seat.seatId) !== null &&
        office.seats.get(seat.seatId) !== participationId,
    );
    if (occupiedSeat) return false;
    return canStep(
      fromTile,
      toTile,
      {
        width: office.map.geometry.widthTiles * office.map.geometry.tileSize,
        height: office.map.geometry.heightTiles * office.map.geometry.tileSize,
      },
      office.map.validated.collision,
    );
  }

  private facingFor(
    dx: number,
    dy: number,
    fallback: WorldSnapshot['participants'][number]['facing'],
  ): WorldSnapshot['participants'][number]['facing'] {
    if (dx === 0 && dy === 0) return fallback;
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'west' : 'east';
    return dy < 0 ? 'north' : 'south';
  }

  private emptySeats(map: TrustedOfficeMap) {
    return new Map(map.seats.map((seat) => [seat.seatId, null] as const));
  }

  private pruneTakeoverReferences() {
    const now = performance.now();
    for (const [key, reference] of this.takeoverReferences) {
      if (reference.expiresAt <= now) this.takeoverReferences.delete(key);
    }
  }

  private invalidateTakeoverReferences(participationId: string) {
    for (const [key, reference] of this.takeoverReferences) {
      if (reference.participationId === participationId) this.takeoverReferences.delete(key);
    }
  }

  private change(
    office: OfficeRuntime,
    participants: WorldSnapshot['participants'],
    seats: WorldSnapshot['seats'] = [],
  ) {
    const baseVersion = office.stateVersion;
    office.stateVersion += 1;
    return {
      roomId: this.roomId(office.workspaceId, office.officeId),
      delta: worldDeltaSchema.parse({
        officeEpoch: office.officeEpoch,
        baseVersion,
        stateVersion: office.stateVersion,
        serverTime: Date.now(),
        participants,
        removedParticipationIds: [],
        seats,
      }),
    };
  }

  private snapshot(
    office: OfficeRuntime,
    joining: WorldSnapshot['participants'][number],
    stateVersion: number,
  ): WorldSnapshot {
    return this.toSnapshot(
      office,
      [...office.participants.values()].map((p) => p.publicState).concat(joining),
      stateVersion,
    );
  }

  private currentSnapshot(office: OfficeRuntime): WorldSnapshot {
    return this.toSnapshot(
      office,
      [...office.participants.values()].map((participant) => participant.publicState),
      office.stateVersion,
    );
  }

  private toSnapshot(
    office: OfficeRuntime,
    participants: WorldSnapshot['participants'],
    stateVersion: number,
  ): WorldSnapshot {
    return worldSnapshotSchema.parse({
      officeEpoch: office.officeEpoch,
      stateVersion,
      serverTime: Date.now(),
      participants,
      seats: [...office.seats].map(([seatId, occupantParticipationId]) => ({
        seatId,
        occupantParticipationId,
      })),
    });
  }

  private spawnFor(office: OfficeRuntime) {
    const { geometry, validated, seats } = office.map;
    const occupiedTiles = new Set(
      [...office.participants.values()].map(
        ({ publicState }) =>
          `${Math.floor(publicState.position.x / geometry.tileSize)}:${Math.floor(publicState.position.y / geometry.tileSize)}`,
      ),
    );
    const spawnTile = {
      tx: Math.floor(geometry.spawn.x / geometry.tileSize),
      ty: Math.floor(geometry.spawn.y / geometry.tileSize),
    };
    const candidates: Array<{ tx: number; ty: number }> = [];
    for (let ty = 0; ty < geometry.heightTiles; ty += 1) {
      for (let tx = 0; tx < geometry.widthTiles; tx += 1) {
        const isSeatTile = seats.some((seat) => seat.tile.tx === tx && seat.tile.ty === ty);
        if (validated.isReachable({ tx, ty }) && !isSeatTile) candidates.push({ tx, ty });
      }
    }
    candidates.sort(
      (left, right) =>
        Math.abs(left.tx - spawnTile.tx) +
          Math.abs(left.ty - spawnTile.ty) -
          (Math.abs(right.tx - spawnTile.tx) + Math.abs(right.ty - spawnTile.ty)) ||
        left.ty - right.ty ||
        left.tx - right.tx,
    );
    const free = candidates.find((tile) => !occupiedTiles.has(`${tile.tx}:${tile.ty}`));
    invariant(free, 409, 'room_full');
    return {
      x: free.tx * geometry.tileSize + geometry.tileSize / 2,
      y: free.ty * geometry.tileSize + geometry.tileSize / 2,
    };
  }

  private roomId(workspaceId: string, officeId: string) {
    return `office:${workspaceId}:${officeId}`;
  }
}
