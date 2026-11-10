import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { idSchema, officeMessageResponseSchema, sendOfficeMessageSchema } from '@gather/contracts';
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
