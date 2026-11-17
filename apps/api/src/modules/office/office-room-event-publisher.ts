import { Inject, Injectable } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import type { OfficeMessage, SpaceMessage } from '@gather/contracts';
import { OfficeAdmissionService } from './office-admission.service.js';
import type { ConsumedOfficeTicket } from './runtime/office-runtime.service.js';
import type { PrivateConversationNotice } from './runtime/proximity-pairing.js';

@Injectable()
export class OfficeRoomEventPublisher {
  private namespace: Namespace | null = null;

  constructor(@Inject(OfficeAdmissionService) private readonly admission: OfficeAdmissionService) {}

  bind(namespace: Namespace) {
    this.namespace = namespace;
  }

  async publish(workspaceId: string, officeId: string, message: OfficeMessage) {
    const recipients = await this.authorizedRecipients(workspaceId, officeId);
    for (const socket of recipients) {
      socket.emit('chat:message', message);
      socket.emit('space:message', { ...message, scope: { kind: 'channel', id: 'general' } });
    }
  }

  async publishSpaceMessage(workspaceId: string, officeId: string, message: SpaceMessage) {
    const recipients = await this.authorizedRecipients(
      workspaceId,
      officeId,
      message.scope.kind === 'dm' ? message.scope.userIds : undefined,
    );
    for (const socket of recipients) socket.emit('space:message', message);
  }

  private async authorizedRecipients(
    workspaceId: string,
    officeId: string,
    userIds?: readonly string[],
  ) {
    const namespace = this.namespace;
    if (!namespace) return [];
    const room = `office:${workspaceId}:${officeId}`;
    const candidates = [...(namespace.adapter.rooms.get(room) ?? [])]
      .map((id) => namespace.sockets.get(id))
      .filter((socket): socket is Socket => Boolean(socket));
    const checked = await Promise.all(
      candidates.map(async (socket) => {
        const ticket = socket.data['officeAdmission'] as ConsumedOfficeTicket | undefined;
        if (
          !ticket ||
          ticket.workspaceId !== workspaceId ||
          ticket.officeId !== officeId ||
          (userIds && !userIds.includes(ticket.userId))
        )
          return null;
        try {
          // Recheck policy before each delivery, rather than relying on the socket's periodic lease.
          if (await this.admission.isSocketAuthorized(ticket)) {
            if (
              socket.connected &&
              socket.rooms.has(room) &&
              socket.data['officeAdmission'] === ticket
            )
              return socket;
          }
        } catch {
          // Fail closed on an unavailable policy store. History remains available after reconnect.
        }
        return null;
      }),
    );
    return checked.filter((socket): socket is Socket => socket !== null);
  }

  publishConversationNotices(notices: readonly PrivateConversationNotice[]) {
    for (const notice of notices) {
      for (const socketId of new Set(notice.socketIds)) {
        const recipient = this.namespace?.sockets.get(socketId);
        if (recipient?.connected) recipient.emit('conversation:update', notice.update);
      }
    }
  }

  async publishWave(workspaceId: string, officeId: string, event: unknown) {
    const recipients = await this.authorizedRecipients(workspaceId, officeId);
    for (const socket of recipients) socket.emit('office:wave', event);
  }
}
