import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { registerModel, schemaOptions } from '../../platform/database/models.js';

export interface OfficeMessageRecord {
  _id: string;
  workspaceId: string;
  officeId: string;
  senderId: string;
  senderName: string;
  clientMessageId: string;
  text: string;
  createdAt: Date;
  expiresAt: Date;
}

const officeMessageSchema = new Schema<OfficeMessageRecord>(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true },
    officeId: { type: String, required: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    clientMessageId: { type: String, required: true },
    text: { type: String, required: true, maxlength: 4000 },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  schemaOptions,
);
officeMessageSchema.index(
  { workspaceId: 1, officeId: 1, senderId: 1, clientMessageId: 1 },
  { unique: true },
);
officeMessageSchema.index({ workspaceId: 1, officeId: 1, createdAt: -1 });
officeMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
officeMessageSchema.set('collection', 'office_messages');

@Injectable()
export class ConversationModels {
  readonly messages: Model<OfficeMessageRecord>;

  constructor(@InjectConnection() connection: Connection) {
    this.messages = registerModel(connection, 'OfficeMessage', officeMessageSchema);
  }

  async createIndexes() {
    await this.messages.createIndexes();
  }
}
