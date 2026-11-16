import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { registerModel, schemaOptions } from '../../platform/database/models.js';

export interface ScopedMessageRecord extends OfficeMessageRecord {
  conversationKey: string;
}

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

const messageFields = {
  _id: { type: String, required: true },
  workspaceId: { type: String, required: true },
  officeId: { type: String, required: true },
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  clientMessageId: { type: String, required: true },
  text: { type: String, required: true, maxlength: 4000 },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
};
const officeMessageSchema = new Schema<OfficeMessageRecord>(messageFields, schemaOptions);
officeMessageSchema.index(
  { workspaceId: 1, officeId: 1, senderId: 1, clientMessageId: 1 },
  { unique: true },
);
officeMessageSchema.index({ workspaceId: 1, officeId: 1, createdAt: -1 });
officeMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
officeMessageSchema.set('collection', 'office_messages');

// Keep legacy General history and its indexes intact. Social/DMs use a new collection.
const scopedMessageSchema = new Schema<ScopedMessageRecord>(
  {
    ...messageFields,
    conversationKey: { type: String, required: true },
  },
  schemaOptions,
);
scopedMessageSchema.index(
  { workspaceId: 1, officeId: 1, conversationKey: 1, senderId: 1, clientMessageId: 1 },
  { unique: true },
);
scopedMessageSchema.index({
  workspaceId: 1,
  officeId: 1,
  conversationKey: 1,
  createdAt: -1,
  _id: -1,
});
scopedMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
scopedMessageSchema.set('collection', 'space_messages');

@Injectable()
export class ConversationModels {
  readonly messages: Model<OfficeMessageRecord>;
  readonly scopedMessages: Model<ScopedMessageRecord>;

  constructor(@InjectConnection() connection: Connection) {
    this.messages = registerModel(connection, 'OfficeMessage', officeMessageSchema);
    this.scopedMessages = registerModel(connection, 'SpaceMessage', scopedMessageSchema);
  }

  async createIndexes() {
    await this.messages.createIndexes();
    await this.scopedMessages.createIndexes();
  }
}
