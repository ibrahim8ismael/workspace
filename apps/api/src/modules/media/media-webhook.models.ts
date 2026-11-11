import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { registerModel, schemaOptions } from '../../platform/database/models.js';

export type MediaWebhookDisposition = 'advanced' | 'late' | 'same_time';

export interface MediaWebhookEventRecord {
  _id: string;
  eventName: string;
  roomName: string;
  participantIdentity?: string;
  occurredAt: Date;
  receivedAt: Date;
  expiresAt: Date;
  disposition: MediaWebhookDisposition;
}

export interface MediaWebhookRoomCursorRecord {
  _id: string;
  eventId: string;
  eventName: string;
  occurredAt: Date;
  updatedAt: Date;
}

const mediaWebhookEventSchema = new Schema<MediaWebhookEventRecord>(
  {
    _id: { type: String, required: true },
    eventName: { type: String, required: true },
    roomName: { type: String, required: true },
    participantIdentity: { type: String },
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    disposition: {
      type: String,
      enum: ['advanced', 'late', 'same_time'],
      required: true,
    },
  },
  schemaOptions,
);
mediaWebhookEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
mediaWebhookEventSchema.set('collection', 'media_webhook_events');

const mediaWebhookRoomCursorSchema = new Schema<MediaWebhookRoomCursorRecord>(
  {
    _id: { type: String, required: true },
    eventId: { type: String, required: true },
    eventName: { type: String, required: true },
    occurredAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  schemaOptions,
);
mediaWebhookRoomCursorSchema.set('collection', 'media_webhook_room_cursors');

@Injectable()
export class MediaWebhookModels {
  readonly events: Model<MediaWebhookEventRecord>;
  readonly roomCursors: Model<MediaWebhookRoomCursorRecord>;

  constructor(@InjectConnection() connection: Connection) {
    this.events = registerModel(connection, 'MediaWebhookEvent', mediaWebhookEventSchema);
    this.roomCursors = registerModel(
      connection,
      'MediaWebhookRoomCursor',
      mediaWebhookRoomCursorSchema,
    );
  }

  async createIndexes() {
    await this.events.createIndexes();
    await this.roomCursors.createIndexes();
  }
}
