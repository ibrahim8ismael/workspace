import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import {
  idSchema,
  officeMessageResponseSchema,
  sendOfficeMessageSchema,
  spaceChannelIdSchema,
  type SpaceConversation,
} from '@gather/contracts';
import type { AuthRequest } from '../identity/security/guards.js';
import { actor } from '../identity/sessions/session.service.js';
import { AbuseService } from '../identity/security/abuse.service.js';
import { ValidationPipe } from '../../platform/http/validation.pipe.js';
import { ConversationsService } from './conversations.service.js';

@Controller('workspaces/:workspaceId/offices/:officeId/messages')
export class ConversationsController {
  constructor(
    @Inject(ConversationsService) private readonly conversations: ConversationsService,
    @Inject(AbuseService) private readonly abuse: AbuseService,
  ) {}

  @Get()
  async list(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Req() request: AuthRequest,
  ) {
    return this.conversations.list(actor(request.authContext), workspaceId, officeId);
  }

  @Post()
  async send(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Body(new ValidationPipe(sendOfficeMessageSchema)) body: unknown,
    @Req() request: AuthRequest,
  ) {
    const context = actor(request.authContext);
    await this.abuse.consume('office-chat', `${workspaceId}:${context.user._id}`, 60, 60_000);
    return officeMessageResponseSchema.parse(
      await this.conversations.send(context, workspaceId, officeId, body),
    );
  }
}

/** Explicit channel/peer routes; a client never supplies a trusted participant list or room name. */
@Controller('workspaces/:workspaceId/offices/:officeId')
export class ScopedConversationsController {
  constructor(
    @Inject(ConversationsService) private readonly conversations: ConversationsService,
    @Inject(AbuseService) private readonly abuse: AbuseService,
  ) {}

  @Get('channels/:channelId/messages')
  listChannel(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Param('channelId', new ValidationPipe(spaceChannelIdSchema)) channelId: 'general' | 'social',
    @Req() request: AuthRequest,
  ) {
    return this.conversations.listScoped(actor(request.authContext), workspaceId, officeId, {
      kind: 'channel',
      id: channelId,
    });
  }

  @Post('channels/:channelId/messages')
  sendChannel(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Param('channelId', new ValidationPipe(spaceChannelIdSchema)) channelId: 'general' | 'social',
    @Body(new ValidationPipe(sendOfficeMessageSchema)) body: unknown,
    @Req() request: AuthRequest,
  ) {
    return this.send(request, workspaceId, officeId, { kind: 'channel', id: channelId }, body);
  }

  @Get('direct-messages/:recipientId/messages')
  listDirect(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Param('recipientId', new ValidationPipe(idSchema)) recipientId: string,
    @Req() request: AuthRequest,
  ) {
    return this.conversations.listScoped(actor(request.authContext), workspaceId, officeId, {
      kind: 'dm',
      userId: recipientId,
    });
  }

  @Post('direct-messages/:recipientId/messages')
  sendDirect(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Param('recipientId', new ValidationPipe(idSchema)) recipientId: string,
    @Body(new ValidationPipe(sendOfficeMessageSchema)) body: unknown,
    @Req() request: AuthRequest,
  ) {
    return this.send(request, workspaceId, officeId, { kind: 'dm', userId: recipientId }, body);
  }

  private async send(
    request: AuthRequest,
    workspaceId: string,
    officeId: string,
    conversation: SpaceConversation,
    body: unknown,
  ) {
    const context = actor(request.authContext);
    await this.abuse.consume('office-chat', `${workspaceId}:${context.user._id}`, 60, 60_000);
    return this.conversations.sendScoped(context, workspaceId, officeId, conversation, body);
  }
}
