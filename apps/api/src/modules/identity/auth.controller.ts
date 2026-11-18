import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  Res,
  Inject,
  HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  registerSchema,
  loginSchema,
  emailRequestSchema,
  verifyEmailSchema,
  resetPasswordSchema,
  changePasswordSchema,
  reauthenticateSchema,
  emptyBodySchema,
  idSchema,
} from '@gather/contracts';
import { ValidationPipe } from '../../platform/http/validation.pipe.js';
import { invariant } from '../../platform/http/errors.js';
import {
  AuthService,
  accountDto,
  PENDING_REGISTRATION_COOKIE,
  PENDING_REGISTRATION_MS,
} from './auth.service.js';
import {
  SessionService,
  SESSION_COOKIE,
  cookieOptions,
  actor,
} from './sessions/session.service.js';
import type { BrowserContext } from './sessions/session.service.js';
import { Public } from './security/guards.js';
import type { AuthRequest } from './security/guards.js';
import { csrfToken } from './security/secrets.js';
import { AbuseService } from './security/abuse.service.js';
import type { ApiEnvironment } from '../../platform/config/environment.js';
import { clientIp } from '../../platform/http/client-ip.js';

function browser(request: AuthRequest): BrowserContext {
  invariant(request.authContext, 403, 'csrf_rejected');
  return request.authContext;
}
function registrationProof(request: AuthRequest): string | undefined {
  const value = request.cookies?.[PENDING_REGISTRATION_COOKIE];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
function ip(request: AuthRequest, trustedProxyIps: string): string {
  return clientIp(request.socket.remoteAddress, request.get('x-forwarded-for'), trustedProxyIps);
}
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AbuseService) private readonly abuse: AbuseService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}
  @Public()
  @Get('csrf')
  async csrf(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    const origin = request.get('origin');
    invariant(
      request.get('sec-fetch-site') === 'same-origin' &&
        request.get('x-requested-with') === 'XMLHttpRequest' &&
        (!origin || origin === this.config.get('APP_ORIGIN', { infer: true })),
      403,
      'origin_rejected',
    );
    await this.abuse.authRequest(
      'csrf',
      ip(request, this.config.get('TRUSTED_PROXY_IPS', { infer: true })),
    );
    const current = request.authContext;
    if (current) return { csrfToken: csrfToken(current.session.csrfSecret, current.session._id) };
    const draft = await this.sessions.anonymous();
    response.cookie(SESSION_COOKIE, draft.raw, {
      ...cookieOptions,
      expires: draft.record.absoluteExpiresAt,
    });
    return { csrfToken: draft.csrfToken };
  }
  @Public()
  @Post('register')
  @HttpCode(202)
  async register(
    @Body(new ValidationPipe(registerSchema))
    body: { email: string; password: string; displayName: string },
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.abuse.authRequest(
      'register',
      ip(request, this.config.get('TRUSTED_PROXY_IPS', { infer: true })),
      body.email,
    );
    const result = await this.auth.register(body, browser(request), registrationProof(request));
    response.cookie(PENDING_REGISTRATION_COOKIE, result.registrationProof, {
      ...cookieOptions,
      expires: new Date(Date.now() + PENDING_REGISTRATION_MS),
    });
    return { message: result.message };
  }
  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verify(
    @Body(new ValidationPipe(verifyEmailSchema))
    body: { email: string; token: string },
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.abuse.authRequest(
      'verify',
      ip(request, this.config.get('TRUSTED_PROXY_IPS', { infer: true })),
      body.email,
    );
    const draft = await this.auth.verifyEmail(body, browser(request), registrationProof(request));
    response.cookie(SESSION_COOKIE, draft.raw, {
      ...cookieOptions,
      expires: draft.record.absoluteExpiresAt,
    });
    return { account: draft.account, csrfToken: draft.csrfToken };
  }
  @Public()
  @Post('resend-verification')
  @HttpCode(202)
  async resend(
    @Body(new ValidationPipe(emailRequestSchema)) body: { email: string },
    @Req() request: AuthRequest,
  ) {
    await this.abuse.authRequest(
      'resend',
      ip(request, this.config.get('TRUSTED_PROXY_IPS', { infer: true })),
      body.email,
    );
    return this.auth.issueRequested(
      body.email,
      'verify-email',
      browser(request),
      registrationProof(request),
    );
  }
  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(
    @Body(new ValidationPipe(emailRequestSchema)) body: { email: string },
    @Req() request: AuthRequest,
  ) {
    await this.abuse.authRequest(
      'recovery',
      ip(request, this.config.get('TRUSTED_PROXY_IPS', { infer: true })),
      body.email,
    );
    return this.auth.issueRequested(body.email, 'reset-password', browser(request));
  }
  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async reset(
    @Body(new ValidationPipe(resetPasswordSchema))
    body: { email: string; token: string; newPassword: string },
    @Req() request: AuthRequest,
  ) {
    await this.abuse.authRequest(
      'reset',
      ip(request, this.config.get('TRUSTED_PROXY_IPS', { infer: true })),
      body.email,
    );
    return this.auth.resetPassword(body, browser(request));
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ValidationPipe(loginSchema)) body: { email: string; password: string },
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.abuse.authRequest(
      'login',
      ip(request, this.config.get('TRUSTED_PROXY_IPS', { infer: true })),
      body.email,
    );
    const draft = await this.auth.login(body, browser(request));
    response.cookie(SESSION_COOKIE, draft.raw, {
      ...cookieOptions,
      expires: draft.record.absoluteExpiresAt,
    });
    return { account: draft.account, csrfToken: draft.csrfToken };
  }
  @Get('me') me(@Req() request: AuthRequest) {
    return { account: accountDto(actor(request.authContext).user) };
  }
  @Get('sessions') list(@Req() request: AuthRequest) {
    return this.auth.listSessions(actor(request.authContext));
  }
  @Delete('sessions/:sessionId')
  async revoke(
    @Param('sessionId', new ValidationPipe(idSchema)) id: string,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = actor(request.authContext);
    const result = await this.auth.revokeSession(context, id);
    if (id === context.session._id) response.clearCookie(SESSION_COOKIE, cookieOptions);
    return result;
  }
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Body(new ValidationPipe(emptyBodySchema)) _body: Record<string, never>,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.logout(actor(request.authContext));
    response.clearCookie(SESSION_COOKIE, cookieOptions);
    return result;
  }
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(
    @Body(new ValidationPipe(emptyBodySchema)) _body: Record<string, never>,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.logout(actor(request.authContext), true);
    response.clearCookie(SESSION_COOKIE, cookieOptions);
    return result;
  }
  @Post('change-password')
  @HttpCode(200)
  async change(
    @Body(new ValidationPipe(changePasswordSchema))
    body: { currentPassword: string; newPassword: string },
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = actor(request.authContext);
    await this.abuse.authRequest(
      'change-password',
      ip(request, this.config.get('TRUSTED_PROXY_IPS', { infer: true })),
      context.user._id,
    );
    const result = await this.auth.changePassword(context, body);
    response.clearCookie(SESSION_COOKIE, cookieOptions);
    return result;
  }
  @Post('reauthenticate')
  @HttpCode(200)
  async reauthenticate(
    @Body(new ValidationPipe(reauthenticateSchema)) body: { password: string },
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const context = actor(request.authContext);
    await this.abuse.authRequest(
      'reauthenticate',
      ip(request, this.config.get('TRUSTED_PROXY_IPS', { infer: true })),
      context.user._id,
    );
    const draft = await this.auth.reauthenticate(context, body.password);
    response.cookie(SESSION_COOKIE, draft.raw, {
      ...cookieOptions,
      expires: draft.record.absoluteExpiresAt,
    });
    return { account: draft.account, csrfToken: draft.csrfToken };
  }
  @Post('session/extend')
  @HttpCode(200)
  extend(
    @Body(new ValidationPipe(emptyBodySchema)) _body: Record<string, never>,
    @Req() request: AuthRequest,
  ) {
    return this.auth.extend(actor(request.authContext));
  }
}
