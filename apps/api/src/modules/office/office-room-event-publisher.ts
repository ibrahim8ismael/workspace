import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import type { OfficeMessage } from '@gather/contracts';

@Injectable()
export class OfficeRoomEventPublisher {
  private namespace: Namespace | null = null;

  bind(namespace: Namespace) {
    this.namespace = namespace;
  }

  publish(workspaceId: string, officeId: string, message: OfficeMessage) {
    this.namespace?.to(`office:${workspaceId}:${officeId}`).emit('chat:message', message);
  }
}
