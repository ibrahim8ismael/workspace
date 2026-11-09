import { HttpException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { performance } from 'node:perf_hooks';
import {
  OFFICE_LIMITS,
  apiErrorCodeSchema,
  officeAccessEndedSchema,
  officeReadySchema,
  officeSocketAuthSchema,
  worldDeltaSchema,
} from '@gather/contracts';
import { OfficeAdmissionService } from '../office-admission.service.js';
import type { ConsumedOfficeTicket, OfficeReservation } from '../runtime/office-runtime.service.js';
import { OfficeRuntimeService } from '../runtime/office-runtime.service.js';

interface OfficeSocketData {
  officeAdmission?: ConsumedOfficeTicket;
  officeReservation?: OfficeReservation;
  officeCleanupRegistered?: boolean;
  officeLeaseTimer?: ReturnType<typeof setTimeout>;
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
  @WebSocketServer()
  private namespace!: Namespace;

  constructor(
    @Inject(OfficeAdmissionService) private readonly admission: OfficeAdmissionService,
    @Inject(OfficeRuntimeService) private readonly runtime: OfficeRuntimeService,
  ) {}

  afterInit(namespace: Namespace) {
    this.namespace = namespace;
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
      if (reservation.retiredOfficeEpoch) {
        const accessEnded = officeAccessEndedSchema.parse({
          officeEpoch: reservation.retiredOfficeEpoch,
          reason: 'server_unavailable',
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
    delete socket.data.officeLeaseTimer;
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
    socket.data.officeLeaseTimer = setTimeout(() => {
      void this.checkAuthorizationLease(socket, ticket, leaseDeadline);
    }, OFFICE_LIMITS.socketPolicyCheckIntervalMs);
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
}
