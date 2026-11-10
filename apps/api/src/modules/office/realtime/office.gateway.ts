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
  conversationUpdateSchema,
  proximityOptInEventSchema,
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
      this.namespace
        .to(reservation.roomId)
        .except(socket.id)
        .emit('world:delta', worldDeltaSchema.parse(reservation.joined));
      this.registerCommands(socket);
      this.startSimulation(ticket.officeId);
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
      this.publishConversationNotices(this.runtime.reconcileProximity(ticket.officeId));
      if (!this.runtime.hasOffice(ticket.officeId)) this.stopSimulation(ticket.officeId);
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
      this.publishConversationNotices(this.runtime.reconcileProximity(ticket.officeId));
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
      this.publishConversationNotices(notices);
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
      this.publishConversationNotices(result.notices);
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

  private reply(
    acknowledge: unknown,
    eventId: unknown,
    error:
      | 'stale_epoch'
      | 'stale_version'
      | 'rate_limited'
      | 'unauthorized'
      | 'validation_failed'
      | 'seat_unavailable'
      | 'seat_exit_blocked'
      | 'conflict'
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

  private publishConversationNotices(
    notices: ReturnType<OfficeRuntimeService['reconcileProximity']>,
  ) {
    for (const notice of notices) {
      const update = conversationUpdateSchema.parse(notice.update);
      for (const socketId of new Set(notice.socketIds)) {
        const recipient = this.namespace.sockets.get(socketId);
        if (recipient?.connected) recipient.emit('conversation:update', update);
      }
    }
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

  private startSimulation(officeId: string) {
    if (this.simulationTimers.has(officeId)) return;
    const timer = setInterval(() => {
      const update = this.runtime.tick(officeId);
      if (update) {
        this.namespace.to(update.roomId).emit('world:delta', worldDeltaSchema.parse(update.delta));
      }
      this.publishConversationNotices(this.runtime.reconcileProximity(officeId));
      if (!this.runtime.hasOffice(officeId)) this.stopSimulation(officeId);
    }, 1000 / OFFICE_LIMITS.simulationHz);
    this.simulationTimers.set(officeId, timer);
  }

  private stopSimulation(officeId: string) {
    const timer = this.simulationTimers.get(officeId);
    if (!timer) return;
    clearInterval(timer);
    this.simulationTimers.delete(officeId);
  }
}
