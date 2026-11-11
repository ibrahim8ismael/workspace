import { Controller, Post, Req, Res, SetMetadata } from '@nestjs/common';
import type { Request, Response } from 'express';
import { invariant } from '../../platform/http/errors.js';
import { MACHINE_AUTH_ROUTE, Public } from '../identity/security/guards.js';
import { MediaWebhookService } from './media-webhook.service.js';

type RawRequest = Request & { rawBody?: Buffer };

@Controller('internal/media/livekit')
export class MediaWebhookController {
  constructor(private readonly webhooks: MediaWebhookService) {}

  @Public()
  @SetMetadata(MACHINE_AUTH_ROUTE, true)
  @Post('webhook')
  async receive(@Req() request: RawRequest, @Res() response: Response) {
    const contentType = request.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    invariant(contentType === 'application/webhook+json', 415, 'unsupported_media_type');
    invariant(request.rawBody && Buffer.isBuffer(request.rawBody), 400, 'validation_failed');

    await this.webhooks.receive(request.rawBody, request.get('authorization'));
    response.status(204).end();
  }
}
