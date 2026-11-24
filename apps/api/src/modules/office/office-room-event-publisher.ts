import { Inject, Injectable } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import type {
  ConversationAreas,
  MeetingScreenShareUpdate,
  MeetingZones,
  OfficeMessage,
  SpaceMessage,
} from '@gather/contracts';
import { OfficeAdmissionService } from './office-admission.service.js';
import type { ConsumedOfficeTicket } from './runtime/office-runtime.service.js';
import type { PrivateConversationNotice } from './runtime/proximity-pairing.js';

@Injectable()
export class OfficeRoomEventPublisher {
  private namespace: Namespace | null = null;
  private readonly areaSequences = new Map<string, number>();
  private readonly meetingSnapshots = new Map<string, string>();

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

  publishConversationAreas(workspaceId: string, officeId: string, areas: ConversationAreas) {
    const key = `${workspaceId}:${officeId}:${areas.officeEpoch}`;
    const prefix = `${workspaceId}:${officeId}:`;
    for (const existing of this.areaSequences.keys())
      if (existing.startsWith(prefix) && existing !== key) this.areaSequences.delete(existing);
    const previous = this.areaSequences.get(key) ?? -1;
    if (areas.sequence <= previous) return;
    this.areaSequences.set(key, areas.sequence);
    this.namespace?.to(`office:${workspaceId}:${officeId}`).emit('conversation:areas', areas);
  }

  sendOfficeMetadata(socketId: string, areas: ConversationAreas, zones: MeetingZones) {
    const recipient = this.namespace?.sockets.get(socketId);
    if (!recipient?.connected) return;
    recipient.emit('conversation:areas', areas);
    recipient.emit('meeting:zones', zones);
  }

  publishMeetingZones(workspaceId: string, officeId: string, zones: MeetingZones) {
    const key = `${workspaceId}:${officeId}:${zones.officeEpoch}`;
    const prefix = `${workspaceId}:${officeId}:`;
    for (const existing of this.meetingSnapshots.keys())
      if (existing.startsWith(prefix) && existing !== key) this.meetingSnapshots.delete(existing);
    const serialized = JSON.stringify(zones);
    if (this.meetingSnapshots.get(key) === serialized) return;
    this.meetingSnapshots.set(key, serialized);
    this.namespace?.to(`office:${workspaceId}:${officeId}`).emit('meeting:zones', zones);
  }

  forgetOffice(workspaceId: string, officeId: string) {
    const prefix = `${workspaceId}:${officeId}:`;
    for (const key of this.meetingSnapshots.keys())
      if (key.startsWith(prefix)) this.meetingSnapshots.delete(key);
    for (const key of this.areaSequences.keys())
      if (key.startsWith(prefix)) this.areaSequences.delete(key);
  }

  publishConversationNotices(notices: readonly PrivateConversationNotice[]) {
    for (const notice of notices) {
      for (const socketId of new Set(notice.socketIds)) {
        const recipient = this.namespace?.sockets.get(socketId);
        if (recipient?.connected) recipient.emit('conversation:update', notice.update);
      }
    }
  }

  publishMeetingScreenShareNotices(
    notices: readonly {
      readonly socketIds: readonly string[];
      readonly update: MeetingScreenShareUpdate;
    }[],
  ) {
    for (const notice of notices) {
      for (const socketId of new Set(notice.socketIds)) {
        const recipient = this.namespace?.sockets.get(socketId);
        if (recipient?.connected) recipient.emit('meeting:screen-share:update', notice.update);
      }
    }
  }

  async publishWave(workspaceId: string, officeId: string, event: unknown) {
    const recipients = await this.authorizedRecipients(workspaceId, officeId);
    for (const socket of recipients) socket.emit('office:wave', event);
  }
}
