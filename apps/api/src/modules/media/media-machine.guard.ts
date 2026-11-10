import { applyDecorators, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Public, MACHINE_AUTH_ROUTE } from '../identity/security/guards.js';
import type { ApiEnvironment } from '../../platform/config/environment.js';
import { invariant } from '../../platform/http/errors.js';

type RawRequest = Request & { rawBody?: Buffer };

@Injectable()
export class MediaMachineGuard implements CanActivate {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RawRequest>();
    const encodedKey = this.config.get('MEDIA_MACHINE_KEY', { infer: true });
    invariant(encodedKey, 503, 'media_unavailable');
    const key = Buffer.from(encodedKey, 'base64');
    const signature = request.get('x-cp07-signature');
    invariant(
      request.rawBody && request.rawBody.length > 0 && request.rawBody.length <= 4096,
      400,
      'validation_failed',
    );
    invariant(
      typeof signature === 'string' && /^[a-f0-9]{64}$/.test(signature),
      401,
      'unauthorized',
    );
    const expected = createHmac('sha256', key).update(request.rawBody).digest();
    const received = Buffer.from(signature, 'hex');
    invariant(timingSafeEqual(expected, received), 401, 'unauthorized');
    return true;
  }
}

export function MediaMachineRoute() {
  return applyDecorators(
    Public(),
    SetMetadata(MACHINE_AUTH_ROUTE, true),
    UseGuards(MediaMachineGuard),
  );
}
