import { HttpException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import {
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
    try {
      await socket.join(reservation.roomId);
      socket.emit('office:ready', officeReadySchema.parse(reservation.ready));
      this.namespace
        .to(reservation.roomId)
        .except(socket.id)
        .emit('world:delta', worldDeltaSchema.parse(reservation.joined));
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
}
