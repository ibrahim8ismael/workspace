import { Injectable, Inject, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { SessionService, SESSION_COOKIE, actor } from '../sessions/session.service.js';
import type { BrowserContext } from '../sessions/session.service.js';
import { AbuseService } from './abuse.service.js';
import { csrfToken, safeEqual } from './secrets.js';
import { invariant } from '../../../platform/http/errors.js';
import type { ApiEnvironment } from '../../../platform/config/environment.js';

export const PUBLIC_ROUTE = 'gather:public';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export type AuthRequest = Request & { authContext?: BrowserContext | null };
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const cookies = request.cookies as Record<string, unknown> | undefined;
    request.authContext = await this.sessions.load(cookies?.[SESSION_COOKIE]);
    if (
      !this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      actor(request.authContext);
    return true;
  }
}
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    invariant(
      request.get('origin') === this.config.get('APP_ORIGIN', { infer: true }),
      403,
      'origin_rejected',
    );
    invariant(Boolean(request.is('application/json')), 415, 'json_required');
    const token = request.get('x-csrf-token');
    const state = request.authContext;
    invariant(
      state && token && safeEqual(token, csrfToken(state.session.csrfSecret, state.session._id)),
      403,
      'csrf_rejected',
    );
    return true;
  }
}

@Injectable()
export class RequestBudgetGuard implements CanActivate {
  constructor(@Inject(AbuseService) private readonly abuse: AbuseService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.method === 'GET' && request.path === '/api/health/live') return true;
    await this.abuse.consume('http-global', 'global', 5000, 60_000);
    await this.abuse.consume(
      'http-ip',
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
      300,
      60_000,
    );
    if (request.authContext?.user)
      await this.abuse.consume('http-user', request.authContext.user._id, 300, 60_000);
    return true;
  }
}
