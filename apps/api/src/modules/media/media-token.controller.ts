import { Body, Controller, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { idSchema, mediaTokenRequestSchema } from '@gather/contracts';
import type { MediaTokenRequest } from '@gather/contracts';
import type { AuthRequest } from '../identity/security/guards.js';
import { actor } from '../identity/sessions/session.service.js';
import { ValidationPipe } from '../../platform/http/validation.pipe.js';
import { MediaTokenService } from './media-token.service.js';

@Controller('conversations')
export class MediaTokenController {
  constructor(@Inject(MediaTokenService) private readonly tokens: MediaTokenService) {}

  @Post(':conversationId/media-token')
  async issue(
    @Param('conversationId', new ValidationPipe(idSchema)) conversationId: string,
    @Body(new ValidationPipe(mediaTokenRequestSchema)) body: MediaTokenRequest,
    @Req() request: AuthRequest,
    @Res() response: Response,
  ) {
    const result = await this.tokens.issue(actor(request.authContext), conversationId, body);
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json(result);
  }
}
