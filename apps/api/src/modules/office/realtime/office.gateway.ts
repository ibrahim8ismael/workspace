import { HttpException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { performance } from 'node:perf_hooks';
import {
  OFFICE_LIMITS,
  apiErrorCodeSchema,
  idSchema,
  officeCommandAckSchema,
  officeAccessEndedSchema,
  officeReadySchema,
  officeSocketAuthSchema,
  presenceUpdateEventSchema,
  seatSitEventSchema,
  seatStandEventSchema,
  worldInputEventSchema,
  worldResyncEventSchema,
  worldDeltaSchema,
  worldSnapshotSchema,
  conversationLeaveEventSchema,
  meetingJoinEventSchema,
  meetingLeaveEventSchema,
  proximityOptInEventSchema,
  waveEventSchema,
  officeWaveSchema,
  meetingInviteEventSchema,
  meetingInvitationResponseEventSchema,
  meetingInvitationCancelEventSchema,
} from '@gather/contracts';
import { OfficeAdmissionService } from '../office-admission.service.js';
import type { ConsumedOfficeTicket, OfficeReservation } from '../runtime/office-runtime.service.js';
import { OfficeRuntimeService } from '../runtime/office-runtime.service.js';
import { OfficeRoomEventPublisher } from '../office-room-event-publisher.js';

interface OfficeSocketData {
  officeAdmission?: ConsumedOfficeTicket;
  officeReservation?: OfficeReservation;
  officeCleanupRegistered?: boolean;
  officeLeaseTimer?: ReturnType<typeof setTimeout>;
  officeLeaseExpiryTimer?: ReturnType<typeof setTimeout>;
  officeLeaseDeadline?: number;
  officeMovementAttemptTimestamps?: number[];
  officeCommandAttemptTimestamps?: number[];
  officeResyncAttemptTimestamps?: number[];
}
type OfficeSocket = Socket & { data: Socket['data'] & OfficeSocketData };

function safeSocketErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null && 'code' in body) {
      const parsed = apiErrorCodeSchema.safeParse(body.code);
      if (parsed.success) return parsed.data;
    }
  }
  return 'unauthorized';
}

@WebSocketGateway({ namespace: '/office' })
export class OfficeGateway
  implements
    OnGatewayInit<Namespace>,
    OnGatewayConnection<OfficeSocket>,
    OnGatewayDisconnect<OfficeSocket>
{
  private readonly simulationTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly waveStates = new Map<
    string,
    { lastWaveAt: number; attempts: number[]; eventIds: Map<string, number> }
  >();

  @WebSocketServer()
  private namespace!: Namespace;

  constructor(
    @Inject(OfficeAdmissionService) private readonly admission: OfficeAdmissionService,
    @Inject(OfficeRuntimeService) private readonly runtime: OfficeRuntimeService,
    @Inject(OfficeRoomEventPublisher) private readonly roomEvents: OfficeRoomEventPublisher,
  ) {}

  afterInit(namespace: Namespace) {
    this.namespace = namespace;
    this.roomEvents.bind(namespace);
    namespace.use((socket, next) => {
      void this.authenticateAndReserve(socket as OfficeSocket, next);
    });
  }

  async handleConnection(socket: OfficeSocket) {
    const ticket = socket.data.officeAdmission;
    const reservation = socket.data.officeReservation;
    if (!ticket || !reservation) {
      socket.disconnect(true);
      return;
    }
    this.registerCleanup(socket);
    const leaseRequestStarted = performance.now();
    try {
      if (!(await this.admission.isSocketAuthorized(ticket))) {
        this.endAccess(socket, 'authorization_ended');
        return;
      }
      const leaseDeadline = leaseRequestStarted + OFFICE_LIMITS.maxAuthorizationLeaseMs;
      if (performance.now() >= leaseDeadline) {
        this.endAccess(socket, 'server_unavailable');
        return;
      }
      await socket.join(reservation.roomId);
      if (performance.now() >= leaseDeadline) {
        this.endAccess(socket, 'server_unavailable');
        return;
      }
      socket.emit('office:ready', officeReadySchema.parse(reservation.ready));
      const areas = this.runtime.conversationAreas(ticket.officeId);
      const zones = this.runtime.meetingZones(ticket.officeId);
      if (areas && zones) this.roomEvents.sendOfficeMetadata(socket.id, areas, zones);
      this.namespace
        .to(reservation.roomId)
        .except(socket.id)
        .emit('world:delta', worldDeltaSchema.parse(reservation.joined));
      this.registerCommands(socket);
      this.startSimulation(ticket.officeId, ticket.workspaceId);
      this.scheduleAuthorizationCheck(socket, ticket, leaseDeadline);
    } catch {
      this.cleanup(socket);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: OfficeSocket) {
    this.cleanup(socket);
  }

  private async authenticateAndReserve(socket: OfficeSocket, next: (error?: Error) => void) {
    const auth = officeSocketAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const ticket = await this.admission.consumeSocketTicket(
        auth.data.ticket,
        auth.data.protocolVersion,
      );
      const reservation = this.runtime.reserve(ticket, socket.id);
      if (reservation.retiredSocketIds.length > 0) {
        const accessEnded = officeAccessEndedSchema.parse({
          officeEpoch: reservation.retiredOfficeEpoch ?? ticket.officeEpoch,
          reason: reservation.retiredReason ?? 'server_unavailable',
        });
        for (const socketId of reservation.retiredSocketIds) {
          const previous = this.namespace.sockets.get(socketId);
          previous?.emit('office:access-ended', accessEnded);
          previous?.disconnect(true);
        }
      }
      socket.data.officeAdmission = ticket;
      socket.data.officeReservation = reservation;
      this.registerCleanup(socket);
      next();
    } catch (error) {
      next(new Error(safeSocketErrorCode(error)));
    }
  }

  private cleanup(socket: OfficeSocket) {
    if (socket.data.officeLeaseTimer) clearTimeout(socket.data.officeLeaseTimer);
    if (socket.data.officeLeaseExpiryTimer) clearTimeout(socket.data.officeLeaseExpiryTimer);
    delete socket.data.officeLeaseTimer;
    delete socket.data.officeLeaseExpiryTimer;
    delete socket.data.officeLeaseDeadline;
    const ticket = socket.data.officeAdmission;
    const reservation = socket.data.officeReservation;
    if (!ticket || !reservation) return;
    delete socket.data.officeAdmission;
    delete socket.data.officeReservation;
    const released = this.runtime.release(
      ticket.officeId,
      ticket.workspaceId,
      ticket.userId,
      socket.id,
      reservation.participationId,
    );
    if (released) {
      this.namespace
        .to(released.roomId)
        .emit('world:delta', worldDeltaSchema.parse(released.delta));
      this.publishConversationState(ticket.workspaceId, ticket.officeId);
      if (!this.runtime.hasOffice(ticket.officeId)) {
        this.stopSimulation(ticket.officeId);
        this.roomEvents.forgetOffice(ticket.workspaceId, ticket.officeId);
      }
    }
  }

  private registerCleanup(socket: OfficeSocket) {
    if (socket.data.officeCleanupRegistered) return;
    socket.data.officeCleanupRegistered = true;
    socket.once('disconnect', () => this.cleanup(socket));
  }

  private scheduleAuthorizationCheck(
    socket: OfficeSocket,
    ticket: ConsumedOfficeTicket,
    leaseDeadline: number,
  ) {
    if (socket.data.officeLeaseTimer) clearTimeout(socket.data.officeLeaseTimer);
    if (socket.data.officeLeaseExpiryTimer) clearTimeout(socket.data.officeLeaseExpiryTimer);
    socket.data.officeLeaseDeadline = leaseDeadline;
    socket.data.officeLeaseExpiryTimer = setTimeout(
      () => {
        if (socket.connected && socket.data.officeLeaseDeadline === leaseDeadline) {
          this.endAccess(socket, 'server_unavailable');
        }
      },
      Math.max(0, leaseDeadline - performance.now()),
    );
    socket.data.officeLeaseTimer = setTimeout(
      () => {
        void this.checkAuthorizationLease(socket, ticket, leaseDeadline);
      },
      Math.min(
        OFFICE_LIMITS.socketPolicyCheckIntervalMs,
        Math.max(0, leaseDeadline - performance.now()),
      ),
    );
  }

  private async checkAuthorizationLease(
    socket: OfficeSocket,
    ticket: ConsumedOfficeTicket,
    leaseDeadline: number,
  ) {
    if (!socket.connected) return;
    const requestStarted = performance.now();
    if (requestStarted >= leaseDeadline) {
      this.endAccess(socket, 'server_unavailable');
      return;
    }
    try {
      if (!(await this.admission.isSocketAuthorized(ticket))) {
        this.endAccess(socket, 'authorization_ended');
        return;
      }
      if (!socket.connected) return;
      const completedAt = performance.now();
      if (
        completedAt >= leaseDeadline ||
        completedAt >= requestStarted + OFFICE_LIMITS.maxAuthorizationLeaseMs
      ) {
        this.endAccess(socket, 'server_unavailable');
        return;
      }
      this.scheduleAuthorizationCheck(
        socket,
        ticket,
        requestStarted + OFFICE_LIMITS.maxAuthorizationLeaseMs,
      );
    } catch {
      if (!socket.connected) return;
      if (performance.now() >= leaseDeadline) {
        this.endAccess(socket, 'server_unavailable');
      } else {
        this.scheduleAuthorizationCheck(socket, ticket, leaseDeadline);
      }
    }
  }

  private endAccess(socket: OfficeSocket, reason: 'authorization_ended' | 'server_unavailable') {
    const ticket = socket.data.officeAdmission;
    if (ticket) {
      socket.emit(
        'office:access-ended',
        officeAccessEndedSchema.parse({ officeEpoch: ticket.officeEpoch, reason }),
      );
    }
    this.cleanup(socket);
    socket.disconnect(true);
  }

  private registerCommands(socket: OfficeSocket) {
    socket.on('office:wave', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = waveEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      void this.handleWave(socket, parsed.data, acknowledge).catch(() => {
        this.reply(acknowledge, parsed.data.eventId, 'unauthorized');
      });
    });
    socket.on('world:input', (raw: unknown, acknowledge?: unknown) => {
      const now = performance.now();
      const attempts = (socket.data.officeMovementAttemptTimestamps ?? []).filter(
        (at: number) => now - at < 1000,
      );
      const eventId =
        typeof raw === 'object' && raw !== null && 'eventId' in raw ? raw.eventId : undefined;
      if (attempts.length >= OFFICE_LIMITS.movementInputsPerSecond) {
        socket.data.officeMovementAttemptTimestamps = attempts;
        this.reply(acknowledge, eventId, 'rate_limited');
        return;
      }
      attempts.push(now);
      socket.data.officeMovementAttemptTimestamps = attempts;
      const parsed = worldInputEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, eventId, 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const error = this.runtime.setMovementIntent(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        { ...parsed.data, ...parsed.data.payload },
      );
      this.reply(acknowledge, parsed.data.eventId, error);
    });
    socket.on('world:resync', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket) || !this.allowWorldResync(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = worldResyncEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const result = this.runtime.resync(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
        parsed.data.payload.stateVersion,
      );
      if (typeof result === 'string') {
        this.reply(acknowledge, parsed.data.eventId, result);
        return;
      }
      socket.emit('world:snapshot', worldSnapshotSchema.parse(result.snapshot));
      const areas = this.runtime.conversationAreas(ticket.officeId);
      const zones = this.runtime.meetingZones(ticket.officeId);
      if (areas && zones) this.roomEvents.sendOfficeMetadata(socket.id, areas, zones);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
    socket.on('presence:update', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = presenceUpdateEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const result = this.runtime.setAvailability(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
        parsed.data.payload.availability,
      );
      if (typeof result === 'string') {
        this.reply(acknowledge, parsed.data.eventId, result);
        return;
      }
      if (result) this.namespace.to(result.roomId).emit('world:delta', result.delta);
      this.publishConversationState(ticket.workspaceId, ticket.officeId);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
    socket.on('proximity:set-opt-in', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = proximityOptInEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const notices = this.runtime.setProximityOptIn(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
        parsed.data.payload.enabled,
      );
      if (typeof notices === 'string') {
        this.reply(acknowledge, parsed.data.eventId, notices);
        return;
      }
      this.roomEvents.publishConversationNotices(notices);
      this.publishAreas(ticket.workspaceId, ticket.officeId);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
    socket.on('conversation:leave', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = conversationLeaveEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const result = this.runtime.leaveProximityConversation(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
        parsed.data.payload.conversationId,
        parsed.data.payload.conversationVersion,
      );
      if (typeof result === 'string') {
        this.reply(acknowledge, parsed.data.eventId, result);
        return;
      }
      if ('error' in result) {
        this.reply(acknowledge, parsed.data.eventId, result.error);
        return;
      }
      this.roomEvents.publishConversationNotices(result.notices);
      this.publishAreas(ticket.workspaceId, ticket.officeId);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
    socket.on('meeting:leave', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = meetingLeaveEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const result = this.runtime.leaveProximityConversation(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
        parsed.data.payload.conversationId,
        parsed.data.payload.conversationVersion,
      );
      if (typeof result === 'string') {
        this.reply(acknowledge, parsed.data.eventId, result);
        return;
      }
      if ('error' in result) {
        this.reply(acknowledge, parsed.data.eventId, result.error);
        return;
      }
      this.roomEvents.publishConversationNotices(result.notices);
      this.roomEvents.publishConversationNotices(this.runtime.reconcileProximity(ticket.officeId));
      this.publishMeetingInvitationNotices();
      this.publishAreas(ticket.workspaceId, ticket.officeId);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
    socket.on('meeting:invite', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = meetingInviteEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      void this.handleMeetingInvite(socket, parsed.data, acknowledge).catch(() => {
        this.reply(acknowledge, parsed.data.eventId, 'unauthorized');
      });
    });
    socket.on('meeting:join', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = meetingJoinEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const result = this.runtime.joinMeetingZone(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
        parsed.data.payload.zoneId,
      );
      if (typeof result === 'string') {
        this.reply(acknowledge, parsed.data.eventId, result);
        return;
      }
      this.roomEvents.publishConversationNotices(result.notices);
      this.roomEvents.publishConversationNotices(this.runtime.reconcileProximity(ticket.officeId));
      this.publishMeetingInvitationNotices();
      this.publishAreas(ticket.workspaceId, ticket.officeId);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
    socket.on('meeting:invitation:respond', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = meetingInvitationResponseEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const result = this.runtime.respondMeetingInvitation(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
        parsed.data.payload.invitationId,
        parsed.data.payload.decision,
      );
      if (typeof result === 'string') {
        this.reply(acknowledge, parsed.data.eventId, result);
        return;
      }
      const status =
        result.status === 'destination_full' ||
        result.status === 'obstructed' ||
        result.status === 'destination_unavailable'
          ? 'cancelled'
          : result.status;
      const inviteNotice = this.runtime.meetingInvitationProjection(
        ticket.officeId,
        parsed.data.payload.invitationId,
        status,
        result.status === 'destination_full'
          ? 'destination_full'
          : result.status === 'obstructed'
            ? 'obstructed'
            : result.status === 'destination_unavailable'
              ? 'destination_unavailable'
              : undefined,
      );
      if (
        ['destination_full', 'obstructed', 'destination_unavailable'].includes(result.status) &&
        inviteNotice
      ) {
        socket.emit('meeting:invitation', inviteNotice);
        if (result.senderSocketId)
          this.namespace.sockets
            .get(result.senderSocketId)
            ?.emit('meeting:invitation', inviteNotice);
      }
      this.roomEvents.publishConversationNotices(this.runtime.reconcileProximity(ticket.officeId));
      this.publishMeetingInvitationNotices();
      this.publishAreas(ticket.workspaceId, ticket.officeId);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
    socket.on('meeting:invitation:cancel', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = meetingInvitationCancelEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const result = this.runtime.cancelMeetingInvitation(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
        parsed.data.payload.invitationId,
      );
      if (typeof result === 'string') {
        this.reply(acknowledge, parsed.data.eventId, result);
        return;
      }
      const notice = this.runtime.meetingInvitationProjection(
        ticket.officeId,
        parsed.data.payload.invitationId,
        'cancelled',
      );
      if (notice) socket.emit('meeting:invitation', notice);
      if (result.recipientSocketId && notice)
        this.namespace.sockets.get(result.recipientSocketId)?.emit('meeting:invitation', notice);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
    socket.on('seat:sit', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = seatSitEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const result = this.runtime.sit(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
        parsed.data.payload.seatId,
      );
      if (typeof result === 'string') {
        this.reply(acknowledge, parsed.data.eventId, result);
        return;
      }
      this.namespace.to(result.roomId).emit('world:delta', result.delta);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
    socket.on('seat:stand', (raw: unknown, acknowledge?: unknown) => {
      if (!this.allowOfficeCommand(socket)) {
        this.reply(acknowledge, this.eventId(raw), 'rate_limited');
        return;
      }
      const parsed = seatStandEventSchema.safeParse(raw);
      if (!parsed.success) {
        this.reply(acknowledge, this.eventId(raw), 'validation_failed');
        return;
      }
      const ticket = socket.data.officeAdmission;
      const reservation = socket.data.officeReservation;
      if (!ticket || !reservation) return;
      const result = this.runtime.stand(
        ticket.officeId,
        ticket.workspaceId,
        ticket.userId,
        socket.id,
        reservation.participationId,
        parsed.data.officeEpoch,
      );
      if (typeof result === 'string') {
        this.reply(acknowledge, parsed.data.eventId, result);
        return;
      }
      this.namespace.to(result.roomId).emit('world:delta', result.delta);
      this.reply(acknowledge, parsed.data.eventId, null);
    });
  }

  private async handleWave(
    socket: OfficeSocket,
    command: ReturnType<typeof waveEventSchema.parse>,
    acknowledge: unknown,
  ) {
    const ticket = socket.data.officeAdmission;
    const reservation = socket.data.officeReservation;
    if (!ticket || !reservation) return;
    const sender = this.runtime.liveParticipation(
      ticket.officeId,
      ticket.workspaceId,
      ticket.officeEpoch,
      reservation.participationId,
    );
    const recipient = this.runtime.liveParticipation(
      ticket.officeId,
      ticket.workspaceId,
      ticket.officeEpoch,
      command.payload.targetParticipationId,
    );
    const senderRoom = `office:${ticket.workspaceId}:${ticket.officeId}`;
    const senderSocket = this.namespace.sockets.get(sender?.socketId ?? '');
    const recipientSocket = this.namespace.sockets.get(recipient?.socketId ?? '');
    if (
      !sender ||
      sender.userId !== ticket.userId ||
      !senderSocket?.connected ||
      senderSocket !== socket ||
      !senderSocket.rooms.has(senderRoom) ||
      !recipient ||
      recipient.participationId === sender.participationId ||
      !recipientSocket?.connected ||
      !recipientSocket.rooms.has(senderRoom) ||
      recipientSocket.data['officeAdmission']?.officeEpoch !== ticket.officeEpoch ||
      recipientSocket.data['officeAdmission']?.workspaceId !== ticket.workspaceId ||
      recipientSocket.data['officeAdmission']?.officeId !== ticket.officeId ||
      recipientSocket.data['officeReservation']?.participationId !== recipient.participationId ||
      command.officeEpoch !== ticket.officeEpoch
    ) {
      this.reply(acknowledge, command.eventId, 'conflict');
      return;
    }
    const key = `${ticket.workspaceId}:${ticket.userId}:${ticket.officeEpoch}`;
    const previousState = this.waveStates.get(key);
    const beforeAuthorization = performance.now();
    if (previousState) {
      for (const [id, at] of previousState.eventIds) {
        if (beforeAuthorization - at > OFFICE_LIMITS.replayWindowMs)
          previousState.eventIds.delete(id);
      }
    }
    if (previousState?.eventIds.has(command.eventId)) {
      this.reply(acknowledge, command.eventId, null);
      return;
    }
    try {
      if (!(await this.admission.isSocketAuthorized(ticket))) {
        this.reply(acknowledge, command.eventId, 'unauthorized');
        return;
      }
      if (
        !(await this.admission.isSocketAuthorized(
          recipientSocket.data['officeAdmission'] as ConsumedOfficeTicket,
        ))
      ) {
        this.reply(acknowledge, command.eventId, 'conflict');
        return;
      }
    } catch {
      this.reply(acknowledge, command.eventId, 'unauthorized');
      return;
    }
    // Socket access may have ended while policy checks were in flight.
    if (
      !socket.connected ||
      !recipientSocket.connected ||
      !socket.rooms.has(senderRoom) ||
      !recipientSocket.rooms.has(senderRoom)
    ) {
      this.reply(acknowledge, command.eventId, 'conflict');
      return;
    }
    const authorizedAt = performance.now();
    this.pruneWaveStates(authorizedAt);
    let state = this.waveStates.get(key);
    if (!state) {
      state = { lastWaveAt: 0, attempts: [], eventIds: new Map() };
      this.waveStates.set(key, state);
    }
    for (const [id, at] of state.eventIds) {
      if (authorizedAt - at > OFFICE_LIMITS.replayWindowMs) state.eventIds.delete(id);
    }
    if (state.eventIds.has(command.eventId)) {
      this.reply(acknowledge, command.eventId, null);
      return;
    }
    state.attempts = state.attempts.filter((at) => authorizedAt - at < 1000);
    if (state.attempts.length >= OFFICE_LIMITS.wavesPerSecond) {
      this.reply(acknowledge, command.eventId, 'rate_limited');
      return;
    }
    if (
      this.runtime.liveParticipation(
        ticket.officeId,
        ticket.workspaceId,
        ticket.officeEpoch,
        sender.participationId,
      )?.socketId !== socket.id ||
      this.runtime.liveParticipation(
        ticket.officeId,
        ticket.workspaceId,
        ticket.officeEpoch,
        recipient.participationId,
      )?.socketId !== recipientSocket.id
    ) {
      this.reply(acknowledge, command.eventId, 'conflict');
      return;
    }
    state.attempts.push(authorizedAt);
    state.lastWaveAt = authorizedAt;
    state.eventIds.set(command.eventId, authorizedAt);
    if (state.eventIds.size > OFFICE_LIMITS.replayCacheEntries)
      state.eventIds.delete(state.eventIds.keys().next().value!);
    const event = officeWaveSchema.parse({
      eventId: command.eventId,
      officeEpoch: ticket.officeEpoch,
      senderParticipationId: sender.participationId,
      senderName: sender.displayName,
      recipientParticipationId: recipient.participationId,
      recipientName: recipient.displayName,
      durationMs: 2200,
    });
    await this.roomEvents.publishWave(ticket.workspaceId, ticket.officeId, event);
    this.reply(acknowledge, command.eventId, null);
  }

  private async handleMeetingInvite(
    socket: OfficeSocket,
    command: ReturnType<typeof meetingInviteEventSchema.parse>,
    acknowledge: unknown,
  ) {
    const ticket = socket.data.officeAdmission;
    const reservation = socket.data.officeReservation;
    if (!ticket || !reservation) return;
    const sender = this.runtime.liveParticipation(
      ticket.officeId,
      ticket.workspaceId,
      ticket.officeEpoch,
      reservation.participationId,
    );
    const recipient = this.runtime.liveParticipation(
      ticket.officeId,
      ticket.workspaceId,
      ticket.officeEpoch,
      command.payload.targetParticipationId,
    );
    if (
      !sender ||
      sender.socketId !== socket.id ||
      !recipient ||
      recipient.participationId === sender.participationId
    ) {
      this.reply(acknowledge, command.eventId, 'conflict');
      return;
    }
    const target = this.namespace.sockets.get(recipient.socketId) as OfficeSocket | undefined;
    const targetTicket = target?.data.officeAdmission;
    const targetRoom = `office:${ticket.workspaceId}:${ticket.officeId}`;
    if (
      !target?.connected ||
      !targetTicket ||
      !target.rooms.has(targetRoom) ||
      targetTicket.workspaceId !== ticket.workspaceId ||
      targetTicket.officeId !== ticket.officeId ||
      targetTicket.officeEpoch !== ticket.officeEpoch
    ) {
      this.reply(acknowledge, command.eventId, 'conflict');
      return;
    }
    try {
      if (
        !(await this.admission.isSocketAuthorized(ticket)) ||
        !(await this.admission.isSocketAuthorized(targetTicket))
      ) {
        this.reply(acknowledge, command.eventId, 'unauthorized');
        return;
      }
    } catch {
      this.reply(acknowledge, command.eventId, 'unauthorized');
      return;
    }
    if (
      !socket.connected ||
      !target.connected ||
      this.runtime.liveParticipation(
        ticket.officeId,
        ticket.workspaceId,
        ticket.officeEpoch,
        reservation.participationId,
      )?.socketId !== socket.id ||
      this.runtime.liveParticipation(
        ticket.officeId,
        ticket.workspaceId,
        ticket.officeEpoch,
        command.payload.targetParticipationId,
      )?.socketId !== target.id
    ) {
      this.reply(acknowledge, command.eventId, 'conflict');
      return;
    }
    const result = this.runtime.createMeetingInvitation(
      ticket.officeId,
      ticket.workspaceId,
      ticket.userId,
      socket.id,
      reservation.participationId,
      command.officeEpoch,
      command.payload.targetParticipationId,
      command.payload.zoneId,
      Date.now(),
      command.eventId,
    );
    if (typeof result === 'string') {
      this.reply(acknowledge, command.eventId, result);
      return;
    }
    this.roomEvents.publishConversationNotices(this.runtime.drainMeetingNotices());
    this.publishMeetingInvitationNotices();
    this.reply(acknowledge, command.eventId, null);
  }

  private pruneWaveStates(now: number) {
    for (const [key, state] of this.waveStates) {
      for (const [id, at] of state.eventIds)
        if (now - at > OFFICE_LIMITS.replayWindowMs) state.eventIds.delete(id);
      if (now - state.lastWaveAt > OFFICE_LIMITS.replayWindowMs && state.eventIds.size === 0)
        this.waveStates.delete(key);
    }
    while (this.waveStates.size > 10000)
      this.waveStates.delete(this.waveStates.keys().next().value!);
  }

  private reply(
    acknowledge: unknown,
    eventId: unknown,
    error:
      | 'stale_epoch'
      | 'stale_version'
      | 'rate_limited'
      | 'unauthorized'
      | 'service_unavailable'
      | 'validation_failed'
      | 'seat_unavailable'
      | 'seat_exit_blocked'
      | 'room_full'
      | 'zone_unavailable'
      | 'conflict'
      | 'participation_conflict'
      | null,
  ) {
    if (typeof acknowledge !== 'function' || !idSchema.safeParse(eventId).success) return;
    acknowledge(
      officeCommandAckSchema.parse(
        error ? { eventId, ok: false, error: { code: error } } : { eventId, ok: true },
      ),
    );
  }

  private eventId(raw: unknown) {
    return typeof raw === 'object' && raw !== null && 'eventId' in raw ? raw.eventId : undefined;
  }

  private allowOfficeCommand(socket: OfficeSocket) {
    const now = performance.now();
    const attempts = (socket.data.officeCommandAttemptTimestamps ?? []).filter(
      (at: number) => now - at < 1000,
    );
    if (attempts.length >= OFFICE_LIMITS.officeCommandsPerSecond) {
      socket.data.officeCommandAttemptTimestamps = attempts;
      return false;
    }
    attempts.push(now);
    socket.data.officeCommandAttemptTimestamps = attempts;
    return true;
  }

  private allowWorldResync(socket: OfficeSocket) {
    const now = performance.now();
    const attempts = (socket.data.officeResyncAttemptTimestamps ?? []).filter(
      (at: number) => now - at < 1000,
    );
    if (attempts.length >= OFFICE_LIMITS.worldResyncsPerSecond) {
      socket.data.officeResyncAttemptTimestamps = attempts;
      return false;
    }
    attempts.push(now);
    socket.data.officeResyncAttemptTimestamps = attempts;
    return true;
  }

  private startSimulation(officeId: string, workspaceId: string) {
    if (this.simulationTimers.has(officeId)) return;
    const timer = setInterval(() => {
      const update = this.runtime.tick(officeId);
      if (update) {
        this.namespace.to(update.roomId).emit('world:delta', worldDeltaSchema.parse(update.delta));
      }
      this.publishConversationState(workspaceId, officeId);
      this.publishMeetingInvitationNotices();
      if (!this.runtime.hasOffice(officeId)) {
        this.stopSimulation(officeId);
        this.roomEvents.forgetOffice(workspaceId, officeId);
      }
    }, 1000 / OFFICE_LIMITS.simulationHz);
    this.simulationTimers.set(officeId, timer);
  }

  private publishMeetingInvitationNotices() {
    for (const notice of this.runtime.drainMeetingInvitationNotices()) {
      const socket = this.namespace.sockets.get(notice.socketId);
      if (socket?.connected) socket.emit('meeting:invitation', notice.invitation);
    }
  }

  private stopSimulation(officeId: string) {
    const timer = this.simulationTimers.get(officeId);
    if (!timer) return;
    clearInterval(timer);
    this.simulationTimers.delete(officeId);
  }

  private publishConversationState(workspaceId: string, officeId: string) {
    this.roomEvents.publishConversationNotices(this.runtime.reconcileProximity(officeId));
    this.publishAreas(workspaceId, officeId);
    this.publishMeetingInvitationNotices();
  }

  private publishAreas(workspaceId: string, officeId: string) {
    const areas = this.runtime.conversationAreas(officeId);
    if (areas) this.roomEvents.publishConversationAreas(workspaceId, officeId, areas);
    const zones = this.runtime.meetingZones(officeId);
    if (zones) this.roomEvents.publishMeetingZones(workspaceId, officeId, zones);
  }
}
