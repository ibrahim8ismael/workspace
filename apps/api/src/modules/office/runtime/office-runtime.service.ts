import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OFFICE_LIMITS,
  officeReadySchema,
  worldDeltaSchema,
  worldSnapshotSchema,
} from '@gather/contracts';
import type { WorldDelta, WorldSnapshot } from '@gather/contracts';
import { COMMONS_GEOMETRY, validateOfficeGeometry } from '@gather/world';
import { invariant } from '../../../platform/http/errors.js';
import { APPROVED_OFFICE_DEFAULT_APPEARANCE } from '../commons-registry.js';

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
}

interface RuntimeParticipant {
  readonly socketId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly publicState: WorldSnapshot['participants'][number];
}

interface OfficeRuntime {
  readonly officeId: string;
  readonly workspaceId: string;
  readonly officeEpoch: string;
  stateVersion: number;
  readonly participants: Map<string, RuntimeParticipant>;
  readonly participationByActor: Map<string, string>;
}

const validatedCommons = validateOfficeGeometry(COMMONS_GEOMETRY);

export interface OfficeReservation {
  readonly roomId: string;
  readonly participationId: string;
  readonly retiredOfficeEpoch: string | null;
  readonly retiredSocketIds: readonly string[];
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

@Injectable()
export class OfficeRuntimeService {
  private readonly offices = new Map<string, OfficeRuntime>();

  reserve(ticket: ConsumedOfficeTicket, socketId: string): OfficeReservation {
    const current = this.offices.get(ticket.officeId);
    let retiredOfficeEpoch: string | null = null;
    let retiredSocketIds: string[] = [];
    if (current && current.officeEpoch !== ticket.officeEpoch) {
      // A new process epoch cannot inherit stale in-memory participants.
      retiredOfficeEpoch = current.officeEpoch;
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
            stateVersion: 0,
            participants: new Map(),
            participationByActor: new Map(),
          };

    invariant(office.workspaceId === ticket.workspaceId, 401, 'unauthorized');
    const actorKey = `${ticket.workspaceId}:${ticket.userId}`;
    invariant(!office.participationByActor.has(actorKey), 409, 'participation_conflict');
    invariant(office.participants.size < OFFICE_LIMITS.maxParticipants, 409, 'room_full');

    const participationId = randomUUID();
    const participant: WorldSnapshot['participants'][number] = {
      participationId,
      displayName: ticket.displayName,
      appearance: APPROVED_OFFICE_DEFAULT_APPEARANCE,
      position: this.spawnFor(office),
      facing: 'south',
      availability: 'available',
      seatId: null,
      lastProcessedInputSequence: 0,
    };
    const baseVersion = office.stateVersion;
    const nextVersion = baseVersion + 1;
    const snapshot = worldSnapshotSchema.parse(this.snapshot(office, participant, nextVersion));
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
      removedParticipationIds: [],
      seats: [],
    });
    const roomId = this.roomId(ticket.workspaceId, ticket.officeId);
    office.stateVersion = nextVersion;
    office.participants.set(participationId, {
      socketId,
      userId: ticket.userId,
      sessionId: ticket.sessionId,
      publicState: participant,
    });
    office.participationByActor.set(actorKey, participationId);
    this.offices.set(ticket.officeId, office);
    return {
      roomId,
      participationId,
      retiredOfficeEpoch,
      retiredSocketIds,
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
    office.stateVersion += 1;
    const delta = worldDeltaSchema.parse({
      officeEpoch: office.officeEpoch,
      baseVersion,
      stateVersion: office.stateVersion,
      serverTime: Date.now(),
      participants: [],
      removedParticipationIds: [participationId],
      seats: [],
    });
    if (office.participants.size === 0) this.offices.delete(officeId);
    return { roomId: this.roomId(workspaceId, officeId), delta };
  }

  private snapshot(
    office: OfficeRuntime,
    joining: WorldSnapshot['participants'][number],
    stateVersion: number,
  ): WorldSnapshot {
    return worldSnapshotSchema.parse({
      officeEpoch: office.officeEpoch,
      stateVersion,
      serverTime: Date.now(),
      participants: [
        ...[...office.participants.values()].map((participant) => participant.publicState),
        joining,
      ],
      seats: COMMONS_GEOMETRY.objects.flatMap((object) =>
        object.seats.map((seat) => ({ seatId: seat.seatId, occupantParticipationId: null })),
      ),
    });
  }

  private spawnFor(office: OfficeRuntime) {
    const occupiedTiles = new Set(
      [...office.participants.values()].map(
        ({ publicState }) =>
          `${Math.floor(publicState.position.x / COMMONS_GEOMETRY.tileSize)}:${Math.floor(publicState.position.y / COMMONS_GEOMETRY.tileSize)}`,
      ),
    );
    const spawnTile = {
      tx: Math.floor(COMMONS_GEOMETRY.spawn.x / COMMONS_GEOMETRY.tileSize),
      ty: Math.floor(COMMONS_GEOMETRY.spawn.y / COMMONS_GEOMETRY.tileSize),
    };
    const candidates: Array<{ tx: number; ty: number }> = [];
    for (let ty = 0; ty < COMMONS_GEOMETRY.heightTiles; ty += 1) {
      for (let tx = 0; tx < COMMONS_GEOMETRY.widthTiles; tx += 1) {
        if (validatedCommons.isReachable({ tx, ty })) candidates.push({ tx, ty });
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
      x: free.tx * COMMONS_GEOMETRY.tileSize + COMMONS_GEOMETRY.tileSize / 2,
      y: free.ty * COMMONS_GEOMETRY.tileSize + COMMONS_GEOMETRY.tileSize / 2,
    };
  }

  private roomId(workspaceId: string, officeId: string) {
    return `office:${workspaceId}:${officeId}`;
  }
}
