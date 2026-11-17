import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  OFFICE_LIMITS,
  conversationUpdateSchema,
  meetingInvitationSchema,
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
import { ProximityPairing } from './proximity-pairing.js';
import type { PrivateConversationNotice, ProximityCandidate } from './proximity-pairing.js';

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
  meetingRoute?: { tx: number; ty: number }[];
  meetingInvitationId?: string;
}

interface MeetingInvitationState {
  readonly invitationId: string;
  readonly commandEventId?: string;
  readonly senderParticipationId: string;
  readonly recipientParticipationId: string;
  readonly zoneId: string;
  readonly conversationId: string;
  readonly generation: string;
  readonly expiresAt: number;
  deadlineMonotonic: number;
  status: 'pending' | 'arriving' | 'joined' | 'declined' | 'expired' | 'cancelled';
}
interface MeetingGroupState {
  conversationId: string;
  generation: string;
  version: number;
  members: { participationId: string; socketId: string; displayName: string }[];
  active: boolean;
}
interface MeetingInvitationNotice {
  readonly socketId: string;
  readonly invitation: ReturnType<typeof meetingInvitationSchema.parse>;
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
  readonly proximity: ProximityPairing;
  lastSimulationAt: number;
  lastBroadcastAt: number;
  readonly dirtyParticipants: Set<string>;
  readonly meetingInvitations: Map<string, MeetingInvitationState>;
  readonly meetingNotices: PrivateConversationNotice[];
  readonly meetingGroups: Map<string, MeetingGroupState>;
  readonly meetingInvitationNotices: MeetingInvitationNotice[];
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

  liveParticipation(
    officeId: string,
    workspaceId: string,
    officeEpoch: string,
    participationId: string,
  ) {
    const office = this.offices.get(officeId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return null;
    const participant = office.participants.get(participationId);
    if (!participant) return null;
    return {
      socketId: participant.socketId,
      userId: participant.userId,
      displayName: participant.publicState.displayName,
      participationId,
    };
  }

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
            proximity: new ProximityPairing(ticket.officeEpoch, map.geometry.tileSize),
            lastSimulationAt: performance.now(),
            lastBroadcastAt: performance.now(),
            dirtyParticipants: new Set(),
            meetingInvitations: new Map(),
            meetingNotices: [],
            meetingGroups: new Map(),
            meetingInvitationNotices: [],
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

    for (const invite of office.meetingInvitations.values()) {
      if (
        (invite.senderParticipationId === participationId ||
          invite.recipientParticipationId === participationId) &&
        (invite.status === 'pending' || invite.status === 'arriving')
      )
        this.finishMeetingInvitation(office, invite, 'cancelled', 'disconnected');
    }
    this.removeMeetingMember(office, participationId);

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
    if (participant.meetingRoute && input.dx === 0 && input.dy === 0) return null;
    participant.inputIntent = {
      dx: input.dx,
      dy: input.dy,
      expiresAt: now + OFFICE_LIMITS.movementIntentTimeoutMs,
    };
    if (participant.meetingRoute) {
      const invitationId = participant.meetingInvitationId;
      const invite = invitationId ? office.meetingInvitations.get(invitationId) : undefined;
      if (invite && (input.dx !== 0 || input.dy !== 0)) {
        invite.status = 'cancelled';
        this.queueMeetingInvitationNotice(
          office,
          invitationId!,
          'cancelled',
          participant.socketId,
          'obstructed',
        );
        const sender = office.participants.get(invite.senderParticipationId);
        if (sender)
          this.queueMeetingInvitationNotice(
            office,
            invitationId!,
            'cancelled',
            sender.socketId,
            'obstructed',
          );
      }
      delete participant.meetingRoute;
      delete participant.meetingInvitationId;
    }
    return null;
  }

  createMeetingInvitation(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    senderParticipationId: string,
    officeEpoch: string,
    recipientParticipationId: string,
    zoneId: string,
    now = Date.now(),
    commandEventId?: string,
  ) {
    const office = this.offices.get(officeId);
    const sender = office?.participants.get(senderParticipationId);
    const recipient = office?.participants.get(recipientParticipationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch' as const;
    if (!sender || sender.userId !== userId || sender.socketId !== socketId)
      return 'unauthorized' as const;
    const zone = office.map.geometry.zones.find(
      (item) => item.zoneId === zoneId && item.kind === 'meeting',
    );
    if (!zone || !recipient || recipientParticipationId === senderParticipationId)
      return 'zone_unavailable' as const;
    const senderTile = pixelToTile(sender.publicState.position);
    if (
      senderTile.tx < zone.bounds.tx ||
      senderTile.tx >= zone.bounds.tx + zone.bounds.width ||
      senderTile.ty < zone.bounds.ty ||
      senderTile.ty >= zone.bounds.ty + zone.bounds.height
    )
      return 'zone_unavailable' as const;
    if (
      sender.publicState.availability !== 'available' ||
      recipient.publicState.availability !== 'available'
    )
      return 'conflict' as const;
    this.reconcileMeetingState(office, performance.now());
    if (
      commandEventId &&
      [...office.meetingInvitations.values()].some(
        (invite) =>
          invite.senderParticipationId === senderParticipationId &&
          invite.commandEventId === commandEventId,
      )
    )
      return 'conflict' as const;
    const activeForRecipient = [...office.meetingInvitations.values()].some(
      (invite) =>
        invite.recipientParticipationId === recipientParticipationId &&
        (invite.status === 'pending' || invite.status === 'arriving'),
    );
    if (activeForRecipient || recipient.meetingInvitationId || recipient.publicState.seatId)
      return 'conflict' as const;
    const group = office.meetingGroups.get(zoneId);
    if (
      !group ||
      group.members.some((member) => member.participationId === recipientParticipationId)
    )
      return 'conflict' as const;
    if (
      !group.active ||
      !group.members.some((member) => member.participationId === senderParticipationId)
    )
      return 'conflict' as const;
    const invitationId = randomUUID();
    const expiresAt = now + OFFICE_LIMITS.meetingInvitationLifetimeMs;
    office.meetingInvitations.set(invitationId, {
      invitationId,
      ...(commandEventId ? { commandEventId } : {}),
      senderParticipationId,
      recipientParticipationId,
      zoneId,
      conversationId: group.conversationId,
      generation: group.generation,
      expiresAt,
      deadlineMonotonic: performance.now() + OFFICE_LIMITS.meetingInvitationLifetimeMs,
      status: 'pending',
    });
    this.queueMeetingInvitationNotice(office, invitationId, 'pending', recipient.socketId);
    this.queueMeetingInvitationNotice(office, invitationId, 'pending', sender.socketId);
    return {
      invitationId,
      expiresAt,
      zoneLabel: zone.label,
      recipientSocketId: recipient.socketId,
      recipientDisplayName: recipient.publicState.displayName,
    };
  }

  joinMeetingZone(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
    officeEpoch: string,
    zoneId: string,
  ) {
    const office = this.offices.get(officeId);
    const participant = office?.participants.get(participationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch' as const;
    if (!participant || participant.userId !== userId || participant.socketId !== socketId)
      return 'unauthorized' as const;
    const zone = office.map.geometry.zones.find(
      (item) => item.zoneId === zoneId && item.kind === 'meeting',
    );
    const tile = pixelToTile(participant.publicState.position);
    if (
      !zone ||
      tile.tx < zone.bounds.tx ||
      tile.tx >= zone.bounds.tx + zone.bounds.width ||
      tile.ty < zone.bounds.ty ||
      tile.ty >= zone.bounds.ty + zone.bounds.height
    )
      return 'zone_unavailable' as const;
    if (participant.publicState.availability !== 'available' || participant.publicState.seatId)
      return 'conflict' as const;
    if (participant.meetingInvitationId) return 'conflict' as const;
    const existing = office.meetingGroups.get(zoneId);
    if (existing?.members.some((member) => member.participationId === participationId))
      return { notices: [] as PrivateConversationNotice[] };
    const prior = [...office.meetingGroups.values()].find((group) =>
      group.members.some((member) => member.participationId === participationId),
    );
    if (prior) return 'conflict' as const;
    const reserved = [...office.meetingInvitations.values()].filter(
      (invite) => invite.zoneId === zoneId && invite.status === 'arriving',
    ).length;
    if ((existing?.members.length ?? 0) + reserved >= OFFICE_LIMITS.maxMeetingParticipants)
      return 'room_full' as const;
    const notices = office.proximity.setOptIn(
      participationId,
      false,
      this.proximityCandidates(office),
      performance.now(),
    );
    const group = existing ?? {
      conversationId: randomUUID(),
      generation: randomUUID(),
      version: 0,
      members: [],
      active: false,
    };
    if (group.members.length >= OFFICE_LIMITS.maxMeetingParticipants) return 'room_full' as const;
    if (group.members.length)
      office.meetingNotices.push(
        this.meetingNotice(office, group, 'retiring', group.generation, group.version + 1),
      );
    group.members = [
      ...group.members,
      { participationId, socketId, displayName: participant.publicState.displayName },
    ];
    group.members.sort((left, right) => left.participationId.localeCompare(right.participationId));
    group.generation = randomUUID();
    group.version += 2;
    group.active = false;
    office.meetingGroups.set(zoneId, group);
    office.meetingNotices.push(this.meetingNotice(office, group, 'joining'));
    return { notices };
  }

  respondMeetingInvitation(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    recipientParticipationId: string,
    officeEpoch: string,
    invitationId: string,
    decision: 'accept' | 'decline',
  ) {
    const office = this.offices.get(officeId);
    const recipient = office?.participants.get(recipientParticipationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch' as const;
    if (!recipient || recipient.userId !== userId || recipient.socketId !== socketId)
      return 'unauthorized' as const;
    const invite = office.meetingInvitations.get(invitationId);
    if (
      !invite ||
      invite.recipientParticipationId !== recipientParticipationId ||
      invite.status !== 'pending'
    )
      return 'conflict' as const;
    const sender = office.participants.get(invite.senderParticipationId);
    if (invite.deadlineMonotonic <= performance.now()) {
      invite.status = 'expired';
      this.queueMeetingInvitationNotice(office, invitationId, 'expired', recipient.socketId);
      if (sender)
        this.queueMeetingInvitationNotice(office, invitationId, 'expired', sender.socketId);
      return {
        status: 'expired' as const,
        senderSocketId: sender?.socketId ?? null,
        zoneId: invite.zoneId,
      };
    }
    if (!sender) {
      invite.status = 'cancelled';
      return { status: 'cancelled' as const, senderSocketId: null, zoneId: invite.zoneId };
    }
    const zone = office.map.geometry.zones.find(
      (item) => item.zoneId === invite.zoneId && item.kind === 'meeting',
    );
    const senderTile = pixelToTile(sender.publicState.position);
    const senderInZone = Boolean(
      zone &&
      senderTile.tx >= zone.bounds.tx &&
      senderTile.tx < zone.bounds.tx + zone.bounds.width &&
      senderTile.ty >= zone.bounds.ty &&
      senderTile.ty < zone.bounds.ty + zone.bounds.height,
    );
    const group = office.meetingGroups.get(invite.zoneId);
    if (
      !senderInZone ||
      !group ||
      group.conversationId !== invite.conversationId ||
      group.members.some((member) => member.participationId === recipientParticipationId) ||
      !group.members.some((member) => member.participationId === invite.senderParticipationId)
    ) {
      invite.status = 'cancelled';
      return {
        status: 'destination_unavailable' as const,
        senderSocketId: sender.socketId,
        zoneId: invite.zoneId,
      };
    }
    if (decision === 'decline') {
      invite.status = 'declined';
      this.queueMeetingInvitationNotice(office, invitationId, 'declined', recipient.socketId);
      this.queueMeetingInvitationNotice(office, invitationId, 'declined', sender.socketId);
      return {
        status: 'declined' as const,
        senderSocketId: sender.socketId,
        zoneId: invite.zoneId,
      };
    }
    if (!zone) {
      invite.status = 'cancelled';
      return {
        status: 'cancelled' as const,
        senderSocketId: sender.socketId,
        zoneId: invite.zoneId,
      };
    }
    if (recipient.publicState.availability !== 'available' || recipient.publicState.seatId) {
      this.finishMeetingInvitation(office, invite, 'cancelled', 'destination_unavailable');
      return {
        status: 'destination_unavailable' as const,
        senderSocketId: sender.socketId,
        zoneId: zone.zoneId,
      };
    }
    const arrivals = [...office.meetingInvitations.values()].filter(
      (candidate) => candidate.zoneId === zone.zoneId && candidate.status === 'arriving',
    ).length;
    if (group.members.length + arrivals >= OFFICE_LIMITS.maxMeetingParticipants) {
      this.finishMeetingInvitation(office, invite, 'cancelled', 'destination_full');
      return {
        status: 'destination_full' as const,
        senderSocketId: sender.socketId,
        zoneId: zone.zoneId,
      };
    }
    const reservedDestinations = new Set(
      [...office.participants.values()].flatMap((person) => {
        const destination = person.meetingRoute?.at(-1);
        return destination ? [`${destination.tx}:${destination.ty}`] : [];
      }),
    );
    const start = pixelToTile(recipient.publicState.position);
    const queue = [start];
    const parent = new Map<string, string | null>([[`${start.tx}:${start.ty}`, null]]);
    let destination: { tx: number; ty: number } | null = null;
    while (queue.length && !destination) {
      const tile = queue.shift()!;
      const occupied = [...office.participants.entries()].some(
        ([id, person]) =>
          id !== recipientParticipationId &&
          pixelToTile(person.publicState.position).tx === tile.tx &&
          pixelToTile(person.publicState.position).ty === tile.ty,
      );
      const inZone =
        tile.tx >= zone.bounds.tx &&
        tile.tx < zone.bounds.tx + zone.bounds.width &&
        tile.ty >= zone.bounds.ty &&
        tile.ty < zone.bounds.ty + zone.bounds.height;
      if (
        inZone &&
        !occupied &&
        !reservedDestinations.has(`${tile.tx}:${tile.ty}`) &&
        office.map.validated.isReachable(tile) &&
        !office.map.seats.some((seat) => seat.tile.tx === tile.tx && seat.tile.ty === tile.ty)
      ) {
        destination = tile;
        break;
      }
      for (const next of [
        { tx: tile.tx + 1, ty: tile.ty },
        { tx: tile.tx - 1, ty: tile.ty },
        { tx: tile.tx, ty: tile.ty + 1 },
        { tx: tile.tx, ty: tile.ty - 1 },
      ]) {
        const key = `${next.tx}:${next.ty}`;
        if (
          parent.has(key) ||
          !canStep(tile, next, office.map.validated.bounds, office.map.validated.collision)
        )
          continue;
        if (
          [...office.participants.entries()].some(
            ([id, person]) =>
              id !== recipientParticipationId &&
              pixelToTile(person.publicState.position).tx === next.tx &&
              pixelToTile(person.publicState.position).ty === next.ty,
          )
        )
          continue;
        parent.set(key, `${tile.tx}:${tile.ty}`);
        queue.push(next);
      }
    }
    if (!destination) {
      this.finishMeetingInvitation(office, invite, 'cancelled', 'obstructed');
      return {
        status: 'obstructed' as const,
        senderSocketId: sender.socketId,
        zoneId: zone.zoneId,
      };
    }
    const route: { tx: number; ty: number }[] = [];
    let key: string | null = `${destination.tx}:${destination.ty}`;
    while (key) {
      const [tx, ty] = key.split(':').map(Number);
      route.unshift({ tx: tx!, ty: ty! });
      key = parent.get(key) ?? null;
    }
    if (route.length && route[0]!.tx === start.tx && route[0]!.ty === start.ty) route.shift();
    office.meetingNotices.push(
      ...office.proximity.setOptIn(
        recipientParticipationId,
        false,
        this.proximityCandidates(office),
        performance.now(),
      ),
    );
    this.removeMeetingMember(office, recipientParticipationId);
    recipient.inputIntent = { dx: 0, dy: 0, expiresAt: 0 };
    recipient.meetingRoute = route;
    recipient.meetingInvitationId = invitationId;
    invite.status = 'arriving';
    invite.deadlineMonotonic = performance.now() + 120_000;
    this.queueMeetingInvitationNotice(office, invitationId, 'arriving', recipient.socketId);
    this.queueMeetingInvitationNotice(office, invitationId, 'arriving', sender.socketId);
    return { status: 'arriving' as const, senderSocketId: sender.socketId, zoneId: zone.zoneId };
  }

  cancelMeetingInvitation(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
    officeEpoch: string,
    invitationId: string,
  ) {
    const office = this.offices.get(officeId);
    const sender = office?.participants.get(participationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch' as const;
    if (!sender || sender.userId !== userId || sender.socketId !== socketId)
      return 'unauthorized' as const;
    const invite = office.meetingInvitations.get(invitationId);
    if (
      !invite ||
      invite.senderParticipationId !== participationId ||
      !['pending', 'arriving'].includes(invite.status)
    )
      return 'conflict' as const;
    invite.status = 'cancelled';
    const recipient = office.participants.get(invite.recipientParticipationId);
    if (recipient?.meetingInvitationId === invitationId) {
      delete recipient.meetingInvitationId;
      delete recipient.meetingRoute;
    }
    return {
      status: 'cancelled' as const,
      recipientSocketId: recipient?.socketId ?? null,
      zoneId: invite.zoneId,
    };
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
    this.reconcileMeetingState(office, performance.now());
    return this.change(office, [participant.publicState]);
  }

  setProximityOptIn(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
    officeEpoch: string,
    enabled: boolean,
    now = performance.now(),
  ): PrivateConversationNotice[] | 'stale_epoch' | 'unauthorized' {
    const office = this.offices.get(officeId);
    const participant = office?.participants.get(participationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch';
    if (!participant || participant.userId !== userId || participant.socketId !== socketId)
      return 'unauthorized';
    return office.proximity.setOptIn(
      participationId,
      enabled,
      this.proximityCandidates(office),
      now,
    );
  }

  leaveProximityConversation(
    officeId: string,
    workspaceId: string,
    userId: string,
    socketId: string,
    participationId: string,
    officeEpoch: string,
    conversationId: string,
    conversationVersion: number,
  ):
    | { notices: PrivateConversationNotice[] }
    | { error: 'stale_version' }
    | 'stale_epoch'
    | 'stale_version'
    | 'unauthorized' {
    const office = this.offices.get(officeId);
    const participant = office?.participants.get(participationId);
    if (!office || office.workspaceId !== workspaceId || office.officeEpoch !== officeEpoch)
      return 'stale_epoch';
    if (!participant || participant.userId !== userId || participant.socketId !== socketId)
      return 'unauthorized';
    const meeting = [...office.meetingGroups.entries()].find(
      ([, group]) => group.conversationId === conversationId,
    );
    if (meeting) {
      const [, group] = meeting;
      if (
        group.version !== conversationVersion ||
        !group.members.some((member) => member.participationId === participationId)
      )
        return { error: 'stale_version' as const };
      this.removeMeetingMember(office, participationId);
      this.reconcileMeetingState(office, performance.now());
      return { notices: [] };
    }
    const result = office.proximity.leave(participationId, conversationId, conversationVersion);
    return 'error' in result ? result.error : result;
  }

  reconcileProximity(officeId: string, now = performance.now()): PrivateConversationNotice[] {
    const office = this.offices.get(officeId);
    if (!office) return [];
    return office.proximity.reconcile(this.proximityCandidates(office), now);
  }

  proximityMediaPermits() {
    return [...this.offices.values()].flatMap((office) => [
      ...office.proximity.mediaPermits(),
      ...[...office.meetingGroups.values()].flatMap((group) =>
        group.members.map((member) => ({
          generation: group.generation,
          identity: member.participationId,
          room: group.generation,
          version: 1,
          sources: ['microphone'] as const,
        })),
      ),
    ]);
  }

  proximityMediaParticipation(
    participationId: string,
    conversationId: string,
    conversationVersion: number,
  ) {
    for (const office of this.offices.values()) {
      const participant = office.participants.get(participationId);
      const conversation = office.proximity.mediaConversation(
        participationId,
        conversationId,
        conversationVersion,
      );
      const meeting = [...office.meetingGroups.values()].find(
        (group) =>
          group.conversationId === conversationId &&
          group.version === conversationVersion &&
          group.active &&
          group.members.some((member) => member.participationId === participationId),
      );
      if (!participant || (!conversation && !meeting)) continue;
      return {
        participationId,
        userId: participant.userId,
        sessionId: participant.sessionId,
        membershipGrantId: participant.membershipGrantId,
        displayName: participant.publicState.displayName,
        workspaceId: office.workspaceId,
        officeId: office.officeId,
        officeEpoch: office.officeEpoch,
        mapVersion: office.mapVersion,
        conversationId: conversation?.conversationId ?? meeting!.conversationId,
        conversationVersion: conversation?.conversationVersion ?? meeting!.version,
        generation: conversation?.generation ?? meeting!.generation,
        room: conversation?.room ?? meeting!.generation,
      };
    }
    return null;
  }

  activateProximityGeneration(generation: string): PrivateConversationNotice[] {
    for (const office of this.offices.values()) {
      const notices = office.proximity.activateGeneration(generation);
      if (notices.length > 0) return notices;
      const group = [...office.meetingGroups.values()].find(
        (candidate) => candidate.generation === generation,
      );
      if (group && !group.active) {
        group.active = true;
        group.version += 1;
        const notice = this.meetingNotice(office, group, 'active');
        return [{ socketIds: notice.socketIds, update: notice.update }];
      }
    }
    return [];
  }

  drainMeetingNotices() {
    const notices = [...this.offices.values()].flatMap((office) => office.meetingNotices.splice(0));
    return notices;
  }

  drainMeetingInvitationNotices() {
    return [...this.offices.values()].flatMap((office) =>
      office.meetingInvitationNotices.splice(0),
    );
  }

  meetingInvitationProjection(
    officeId: string,
    invitationId: string,
    status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'arriving' | 'joined',
    reason?: 'destination_unavailable' | 'destination_full' | 'obstructed' | 'disconnected',
  ) {
    const office = this.offices.get(officeId);
    const invite = office?.meetingInvitations.get(invitationId);
    if (!office || !invite) return null;
    const sender = office.participants.get(invite.senderParticipationId);
    const recipient = office.participants.get(invite.recipientParticipationId);
    const zone = office.map.geometry.zones.find((item) => item.zoneId === invite.zoneId);
    return meetingInvitationSchema.parse({
      invitationId,
      officeEpoch: office.officeEpoch,
      senderParticipationId: invite.senderParticipationId,
      senderDisplayName: sender?.publicState.displayName ?? 'Former member',
      recipientParticipationId: invite.recipientParticipationId,
      recipientDisplayName: recipient?.publicState.displayName ?? 'Former member',
      zoneId: invite.zoneId,
      zoneLabel: zone?.label ?? invite.zoneId,
      status,
      expiresAt: invite.expiresAt,
      ...(reason ? { reason } : {}),
    });
  }

  private queueMeetingInvitationNotice(
    office: OfficeRuntime,
    invitationId: string,
    status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'arriving' | 'joined',
    socketId: string,
    reason?: 'destination_unavailable' | 'destination_full' | 'obstructed' | 'disconnected',
  ) {
    const invitation = this.meetingInvitationProjection(
      office.officeId,
      invitationId,
      status,
      reason,
    );
    if (invitation) office.meetingInvitationNotices.push({ socketId, invitation });
  }

  private meetingNotice(
    office: OfficeRuntime,
    group: MeetingGroupState,
    state: 'joining' | 'active' | 'retiring' | 'ended',
    generation = group.generation,
    version = group.version,
    members = group.members,
  ): PrivateConversationNotice {
    return {
      socketIds: members.map((member) => member.socketId),
      update: conversationUpdateSchema.parse({
        officeEpoch: office.officeEpoch,
        conversationId: group.conversationId,
        kind: 'meeting',
        state,
        version,
        generation,
        mediaReady: state === 'active',
        participants:
          state === 'ended'
            ? []
            : members.map(({ participationId, displayName }) => ({ participationId, displayName })),
      }),
    };
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
    if (participant.meetingInvitationId) return 'conflict';
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
    this.reconcileMeetingState(office, performance.now());
    for (const [participationId, participant] of office.participants) {
      const previous = participant.publicState.position;
      const nextSequence = Math.max(
        participant.publicState.lastProcessedInputSequence,
        participant.lastAcceptedInputSequence,
      );
      let nextPosition = previous;
      let dx = participant.inputIntent.dx;
      let dy = participant.inputIntent.dy;
      let routeArrived =
        participant.meetingRoute?.length === 0 && Boolean(participant.meetingInvitationId);
      if (participant.meetingRoute?.length) {
        const nextTile = participant.meetingRoute[0]!;
        const target = {
          x: nextTile.tx * office.map.geometry.tileSize + office.map.geometry.tileSize / 2,
          y: nextTile.ty * office.map.geometry.tileSize + office.map.geometry.tileSize / 2,
        };
        const distance = Math.hypot(target.x - previous.x, target.y - previous.y);
        const travel = Math.min(pixels, distance);
        const nextPosition =
          distance === 0
            ? target
            : {
                x: previous.x + ((target.x - previous.x) / distance) * travel,
                y: previous.y + ((target.y - previous.y) / distance) * travel,
              };
        const occupied = [...office.participants.entries()].some(
          ([id, person]) =>
            id !== participationId &&
            pixelToTile(person.publicState.position).tx === nextTile.tx &&
            pixelToTile(person.publicState.position).ty === nextTile.ty,
        );
        if (!occupied && this.canMoveBetween(office, participationId, previous, nextPosition)) {
          participant.publicState.position = nextPosition;
          participant.publicState.facing = this.facingFor(
            target.x - previous.x,
            target.y - previous.y,
            participant.publicState.facing,
          );
          office.dirtyParticipants.add(participationId);
          if (travel >= distance) {
            participant.meetingRoute.shift();
            routeArrived = participant.meetingRoute.length === 0;
          }
        } else {
          const invite = participant.meetingInvitationId
            ? office.meetingInvitations.get(participant.meetingInvitationId)
            : undefined;
          if (invite) invite.status = 'cancelled';
          if (invite) {
            this.queueMeetingInvitationNotice(
              office,
              invite.invitationId,
              'cancelled',
              participant.socketId,
              'obstructed',
            );
            const sender = office.participants.get(invite.senderParticipationId);
            if (sender)
              this.queueMeetingInvitationNotice(
                office,
                invite.invitationId,
                'cancelled',
                sender.socketId,
                'obstructed',
              );
          }
          delete participant.meetingRoute;
          delete participant.meetingInvitationId;
        }
      }
      if (routeArrived) {
        const invitationId = participant.meetingInvitationId;
        const invite = invitationId ? office.meetingInvitations.get(invitationId) : undefined;
        const group = invite ? office.meetingGroups.get(invite.zoneId) : undefined;
        const sender = invite ? office.participants.get(invite.senderParticipationId) : undefined;
        const zone = invite
          ? office.map.geometry.zones.find((item) => item.zoneId === invite.zoneId)
          : undefined;
        const tile = pixelToTile(participant.publicState.position);
        const inZone = Boolean(
          zone &&
          tile.tx >= zone.bounds.tx &&
          tile.tx < zone.bounds.tx + zone.bounds.width &&
          tile.ty >= zone.bounds.ty &&
          tile.ty < zone.bounds.ty + zone.bounds.height,
        );
        if (
          invite &&
          invite.status === 'arriving' &&
          group &&
          group.members.length < OFFICE_LIMITS.maxMeetingParticipants &&
          sender &&
          this.isInMeetingZone(office, invite.zoneId, sender) &&
          inZone &&
          group.conversationId === invite.conversationId &&
          group.members.some((member) => member.participationId === invite.senderParticipationId)
        ) {
          office.meetingNotices.push(
            this.meetingNotice(office, group, 'retiring', group.generation, group.version + 1),
          );
          group.members = [
            ...group.members,
            {
              participationId,
              socketId: participant.socketId,
              displayName: participant.publicState.displayName,
            },
          ];
          group.members.sort((left, right) =>
            left.participationId.localeCompare(right.participationId),
          );
          group.generation = randomUUID();
          group.version += 2;
          group.active = false;
          office.meetingNotices.push(this.meetingNotice(office, group, 'joining'));
          invite.status = 'joined';
          this.queueMeetingInvitationNotice(
            office,
            invite.invitationId,
            'joined',
            participant.socketId,
          );
          this.queueMeetingInvitationNotice(office, invite.invitationId, 'joined', sender.socketId);
        } else if (invite)
          this.finishMeetingInvitation(
            office,
            invite,
            'cancelled',
            group && group.members.length >= OFFICE_LIMITS.maxMeetingParticipants
              ? 'destination_full'
              : 'destination_unavailable',
          );
        delete participant.meetingRoute;
        delete participant.meetingInvitationId;
      }
      if (participant.meetingRoute) {
        participant.publicState.lastProcessedInputSequence = nextSequence;
        continue;
      }
      if (
        routeArrived ||
        (participant.meetingInvitationId === undefined &&
          nextSequence !== participant.publicState.lastProcessedInputSequence)
      ) {
        // Route movement is already applied above; don't apply an unrelated input in the same tick.
        if (routeArrived) continue;
      }
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
    this.reconcileMeetingState(office, performance.now());
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

  private isInMeetingZone(office: OfficeRuntime, zoneId: string, participant: RuntimeParticipant) {
    const zone = office.map.geometry.zones.find(
      (item) => item.zoneId === zoneId && item.kind === 'meeting',
    );
    const tile = pixelToTile(participant.publicState.position);
    return Boolean(
      zone &&
      tile.tx >= zone.bounds.tx &&
      tile.tx < zone.bounds.tx + zone.bounds.width &&
      tile.ty >= zone.bounds.ty &&
      tile.ty < zone.bounds.ty + zone.bounds.height,
    );
  }

  private finishMeetingInvitation(
    office: OfficeRuntime,
    invite: MeetingInvitationState,
    status: 'cancelled' | 'expired' | 'declined' | 'joined',
    reason?: 'destination_unavailable' | 'destination_full' | 'obstructed' | 'disconnected',
  ) {
    invite.status = status;
    const recipient = office.participants.get(invite.recipientParticipationId);
    if (recipient?.meetingInvitationId === invite.invitationId) {
      delete recipient.meetingRoute;
      delete recipient.meetingInvitationId;
      recipient.inputIntent = { dx: 0, dy: 0, expiresAt: 0 };
    }
    for (const id of [invite.senderParticipationId, invite.recipientParticipationId]) {
      const participant = office.participants.get(id);
      if (participant)
        this.queueMeetingInvitationNotice(
          office,
          invite.invitationId,
          status,
          participant.socketId,
          reason,
        );
    }
  }

  private removeMeetingMember(office: OfficeRuntime, participationId: string) {
    for (const [zoneId, group] of office.meetingGroups) {
      if (!group.members.some((member) => member.participationId === participationId)) continue;
      const departing = group.members.filter(
        (member) => member.participationId === participationId,
      );
      office.meetingNotices.push(
        this.meetingNotice(office, group, 'ended', group.generation, group.version + 1, departing),
      );
      const retained = group.members.filter((member) => member.participationId !== participationId);
      if (retained.length)
        office.meetingNotices.push(
          this.meetingNotice(
            office,
            group,
            'retiring',
            group.generation,
            group.version + 1,
            retained,
          ),
        );
      group.members = group.members.filter((member) => member.participationId !== participationId);
      if (!group.members.length) office.meetingGroups.delete(zoneId);
      else {
        group.generation = randomUUID();
        group.version += 2;
        group.active = false;
        office.meetingNotices.push(this.meetingNotice(office, group, 'joining'));
      }
    }
  }

  private reconcileMeetingState(office: OfficeRuntime, now: number) {
    for (const [zoneId, group] of [...office.meetingGroups]) {
      for (const member of [...group.members]) {
        const participant = office.participants.get(member.participationId);
        if (
          !participant ||
          participant.publicState.availability !== 'available' ||
          !this.isInMeetingZone(office, zoneId, participant)
        )
          this.removeMeetingMember(office, member.participationId);
      }
    }
    for (const invite of office.meetingInvitations.values()) {
      if (invite.status !== 'pending' && invite.status !== 'arriving') continue;
      const sender = office.participants.get(invite.senderParticipationId);
      const recipient = office.participants.get(invite.recipientParticipationId);
      const group = office.meetingGroups.get(invite.zoneId);
      if (invite.deadlineMonotonic <= now) this.finishMeetingInvitation(office, invite, 'expired');
      else if (!sender || !recipient)
        this.finishMeetingInvitation(office, invite, 'cancelled', 'disconnected');
      else if (
        !group ||
        group.conversationId !== invite.conversationId ||
        !group.members.some((member) => member.participationId === invite.senderParticipationId) ||
        !this.isInMeetingZone(office, invite.zoneId, sender) ||
        sender.publicState.availability !== 'available' ||
        recipient.publicState.availability !== 'available'
      )
        this.finishMeetingInvitation(office, invite, 'cancelled', 'destination_unavailable');
    }
    // Terminal IDs remain briefly for replay rejection, with a strict per-office bound.
    const terminal = [...office.meetingInvitations.values()].filter(
      (invite) => invite.status !== 'pending' && invite.status !== 'arriving',
    );
    for (const invite of terminal.slice(
      0,
      Math.max(0, terminal.length - OFFICE_LIMITS.replayCacheEntries),
    ))
      office.meetingInvitations.delete(invite.invitationId);
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

  private proximityCandidates(office: OfficeRuntime): ProximityCandidate[] {
    return [...office.participants.entries()].map(([participationId, participant]) => ({
      participationId,
      socketId: participant.socketId,
      displayName: participant.publicState.displayName,
      availability:
        participant.meetingInvitationId ||
        [...office.meetingGroups.values()].some((group) =>
          group.members.some((member) => member.participationId === participationId),
        )
          ? 'busy'
          : participant.publicState.availability,
      position: participant.publicState.position,
    }));
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
