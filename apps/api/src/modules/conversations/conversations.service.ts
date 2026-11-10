import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OFFICE_CHAT_PAGE_SIZE,
  OFFICE_CHAT_RETENTION_DAYS,
  officeMessageSchema,
  officeMessagesResponseSchema,
  sendOfficeMessageSchema,
} from '@gather/contracts';
import type { ActorContext } from '../identity/sessions/session.service.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { invariant } from '../../platform/http/errors.js';
import { OfficeRoomEventPublisher } from '../office/office-room-event-publisher.js';
import { TenancyService } from '../tenancy/tenancy.service.js';
import { ConversationModels } from './conversation.models.js';

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(ConversationModels) private readonly conversations: ConversationModels,
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OfficeRoomEventPublisher) private readonly roomEvents: OfficeRoomEventPublisher,
  ) {}

  async list(context: ActorContext, workspaceId: string, officeId: string) {
    await this.tenancy.getOffice(context, workspaceId, officeId);
    const now = new Date();
    const records = await this.conversations.messages
      .find({ workspaceId, officeId, expiresAt: { $gt: now } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(OFFICE_CHAT_PAGE_SIZE)
      .read('primary')
      .lean();
    return officeMessagesResponseSchema.parse({
      messages: records.reverse().map((record) => this.toDto(record)),
    });
  }

  async send(context: ActorContext, workspaceId: string, officeId: string, input: unknown) {
    const body = sendOfficeMessageSchema.parse(input);
    const result = await this.db.transaction(async (tx) => {
      await this.tenancy.lockAccess(context, workspaceId, tx);
      const office = await this.tenancy.models.offices
        .findOne({ _id: officeId, workspaceId })
        .session(tx)
        .lean();
      invariant(office, 404, 'not_found');

      const existing = await this.conversations.messages
        .findOne({
          workspaceId,
          officeId,
          senderId: context.user._id,
          clientMessageId: body.clientMessageId,
        })
        .session(tx)
        .lean();
      if (existing) {
        invariant(existing.text === body.text, 409, 'idempotency_conflict');
        return { message: this.toDto(existing), created: false };
      }

      const createdAt = new Date();
      const record = {
        _id: randomUUID(),
        workspaceId,
        officeId,
        senderId: context.user._id,
        senderName: context.user.displayName,
        clientMessageId: body.clientMessageId,
        text: body.text,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + OFFICE_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      };
      await this.conversations.messages.create([record], { session: tx });
      return { message: officeMessageSchema.parse(this.toDto(record)), created: true };
    });

    if (result.created) {
      this.roomEvents.publish(workspaceId, officeId, result.message);
    }
    return { message: result.message };
  }

  private toDto(record: {
    _id: string;
    senderId: string;
    senderName: string;
    text: string;
    createdAt: Date;
  }) {
    return {
      id: record._id,
      senderId: record.senderId,
      senderName: record.senderName,
      text: record.text,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
