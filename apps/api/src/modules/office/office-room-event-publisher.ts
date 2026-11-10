import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import type { OfficeMessage } from '@gather/contracts';
import type { PrivateConversationNotice } from './runtime/proximity-pairing.js';

@Injectable()
export class OfficeRoomEventPublisher {
  private namespace: Namespace | null = null;

  bind(namespace: Namespace) {
    this.namespace = namespace;
  }

  publish(workspaceId: string, officeId: string, message: OfficeMessage) {
    this.namespace?.to(`office:${workspaceId}:${officeId}`).emit('chat:message', message);
  }

  publishConversationNotices(notices: readonly PrivateConversationNotice[]) {
    for (const notice of notices) {
      for (const socketId of new Set(notice.socketIds)) {
        const recipient = this.namespace?.sockets.get(socketId);
        if (recipient?.connected) recipient.emit('conversation:update', notice.update);
      }
    }
  }
}
