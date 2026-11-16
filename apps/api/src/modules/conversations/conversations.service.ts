import { Inject, Injectable } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { IdentityModels } from '../identity/identity.models.js';
import { randomUUID } from 'node:crypto';
import {
  OFFICE_CHAT_PAGE_SIZE,
  OFFICE_CHAT_RETENTION_DAYS,
  officeMessageSchema,
  officeMessagesResponseSchema,
  sendOfficeMessageSchema,
  spaceMessageSchema,
  spaceMessagesResponseSchema,
  type SpaceConversation,
  type SpaceMessageScope,
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
    @Inject(IdentityModels) private readonly identities: IdentityModels,
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
      await this.roomEvents.publish(workspaceId, officeId, result.message);
    }
    return { message: result.message };
  }

  private async authorizeScope(
    context: ActorContext,
    workspaceId: string,
    officeId: string,
    conversation: SpaceConversation,
    tx: ClientSession,
  ): Promise<{ key: string; scope: SpaceMessageScope }> {
    await this.tenancy.lockAccess(context, workspaceId, tx);
    const office = await this.tenancy.models.offices
      .findOne({ _id: officeId, workspaceId })
      .session(tx)
      .lean();
    invariant(office, 404, 'not_found');
    if (conversation.kind === 'channel') {
      return { key: `channel:${conversation.id}`, scope: conversation };
    }
    invariant(conversation.userId !== context.user._id, 400, 'validation_failed');
    const member = await this.tenancy.models.memberships
      .findOneAndUpdate(
        { workspaceId, userId: conversation.userId, status: 'active' },
        { $inc: { policyVersion: 1 } },
        { session: tx, returnDocument: 'after' },
      )
      .lean();
    invariant(member, 404, 'not_found');
    const user = await this.identities.users
      .findOneAndUpdate(
        { _id: conversation.userId, status: 'active', verifiedAt: { $ne: null } },
        { $inc: { policyVersion: 1 } },
        { session: tx, returnDocument: 'after' },
      )
      .lean();
    invariant(user, 404, 'not_found');
    const userIds: [string, string] = [context.user._id, conversation.userId].sort() as [
      string,
      string,
    ];
    return { key: `dm:${userIds.join(':')}`, scope: { kind: 'dm', userIds } };
  }

  async listScoped(
    context: ActorContext,
    workspaceId: string,
    officeId: string,
    conversation: SpaceConversation,
  ) {
    if (conversation.kind === 'channel' && conversation.id === 'general') {
      const result = await this.list(context, workspaceId, officeId);
      return { messages: result.messages.map((message) => ({ ...message, scope: conversation })) };
    }
    return this.db.transaction(async (tx) => {
      const { key, scope } = await this.authorizeScope(
        context,
        workspaceId,
        officeId,
        conversation,
        tx,
      );
      const records = await this.conversations.scopedMessages
        .find({ workspaceId, officeId, conversationKey: key, expiresAt: { $gt: new Date() } })
        .session(tx)
        .sort({ createdAt: -1, _id: -1 })
        .limit(OFFICE_CHAT_PAGE_SIZE)
        .lean();
      return spaceMessagesResponseSchema.parse({
        messages: records.reverse().map((record) => ({ ...this.toDto(record), scope })),
      });
    });
  }

  async sendScoped(
    context: ActorContext,
    workspaceId: string,
    officeId: string,
    conversation: SpaceConversation,
    input: unknown,
  ) {
    if (conversation.kind === 'channel' && conversation.id === 'general') {
      const { message } = await this.send(context, workspaceId, officeId, input);
      return { message: { ...message, scope: conversation } };
    }
    const body = sendOfficeMessageSchema.parse(input);
    const result = await this.db.transaction(async (tx) => {
      const { key, scope } = await this.authorizeScope(
        context,
        workspaceId,
        officeId,
        conversation,
        tx,
      );
      const existing = await this.conversations.scopedMessages
        .findOne({
          workspaceId,
          officeId,
          conversationKey: key,
          senderId: context.user._id,
          clientMessageId: body.clientMessageId,
        })
        .session(tx)
        .lean();
      if (existing) {
        invariant(existing.text === body.text, 409, 'idempotency_conflict');
        return {
          message: spaceMessageSchema.parse({ ...this.toDto(existing), scope }),
          created: false,
        };
      }
      const createdAt = new Date();
      const record = {
        _id: randomUUID(),
        workspaceId,
        officeId,
        conversationKey: key,
        senderId: context.user._id,
        senderName: context.user.displayName,
        clientMessageId: body.clientMessageId,
        text: body.text,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + OFFICE_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      };
      await this.conversations.scopedMessages.create([record], { session: tx });
      return { message: spaceMessageSchema.parse({ ...this.toDto(record), scope }), created: true };
    });
    if (result.created)
      await this.roomEvents.publishSpaceMessage(workspaceId, officeId, result.message);
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
