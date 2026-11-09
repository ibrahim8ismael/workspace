import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { Schema } from 'mongoose';
import type { Connection } from 'mongoose';
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
interface AuditMirrorOutboxRecord {
  _id: string;
  schemaVersion: number;
  eventId: string;
  occurredAt: Date;
  actorId: string;
  workspaceId: string | null;
  action: string;
  targetId: string;
  digest: string;
  state: 'pending';
  createdAt: Date;
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
const mirrorOutboxSchema = new Schema<AuditMirrorOutboxRecord>(
  {
    _id: { type: String, required: true },
    schemaVersion: { type: Number, required: true },
    eventId: { type: String, required: true },
    occurredAt: { type: Date, required: true },
    actorId: { type: String, required: true },
    workspaceId: { type: String, default: null },
    action: { type: String, required: true },
    targetId: { type: String, required: true },
    digest: { type: String, required: true },
    state: { type: String, enum: ['pending'], required: true },
    createdAt: { type: Date, required: true },
  },
  schemaOptions,
);
mirrorOutboxSchema.index({ state: 1, createdAt: 1 });
mirrorOutboxSchema.set('collection', 'audit_mirror_outbox');
@Injectable()
export class AuditService {
  readonly model;
  readonly mirrorOutbox;
  constructor(@InjectConnection() connection: Connection) {
    this.model = registerModel(connection, 'AuditEvent', schema);
    this.mirrorOutbox = registerModel(connection, 'AuditMirrorOutbox', mirrorOutboxSchema);
  }
  async record(
    actorId: string,
    action: string,
    targetId: string,
    session: ClientSession,
    workspaceId: string | null = null,
  ) {
    const now = new Date();
    const eventId = randomUUID();
    const occurredAt = now.toISOString();
    const projection = {
      schemaVersion: 1,
      eventId,
      occurredAt,
      actorId,
      workspaceId,
      action,
      targetId,
    };
    const digest = createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex');
    await this.model.create(
      [
        {
          _id: eventId,
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
    await this.mirrorOutbox.create(
      [
        {
          _id: eventId,
          ...projection,
          occurredAt: now,
          digest,
          state: 'pending',
          createdAt: now,
        },
      ],
      { session },
    );
  }
}
