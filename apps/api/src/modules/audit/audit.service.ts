import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Connection, Schema } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { registerModel, schemaOptions } from '../../platform/database/models.js';

interface AuditRecord {
  _id: string;
  actorId: string;
  workspaceId: string | null;
  action: string;
  targetId: string;
  createdAt: Date;
  expiresAt: Date;
}
const schema = new Schema<AuditRecord>(
  {
    _id: { type: String, required: true },
    actorId: { type: String, required: true },
    workspaceId: { type: String, default: null },
    action: { type: String, required: true },
    targetId: { type: String, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  schemaOptions,
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.set('collection', 'audit_events');
@Injectable()
export class AuditService {
  readonly model;
  constructor(@InjectConnection() connection: Connection) {
    this.model = registerModel(connection, 'AuditEvent', schema);
  }
  async record(
    actorId: string,
    action: string,
    targetId: string,
    session: ClientSession,
    workspaceId: string | null = null,
  ) {
    const now = new Date();
    await this.model.create(
      [
        {
          _id: randomUUID(),
          actorId,
          action,
          targetId,
          workspaceId,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 30 * 86400_000),
        },
      ],
      { session },
    );
  }
}
