import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module.js';
import { IdentityModels } from './identity.models.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { PasswordService } from './security/password.service.js';
import { SessionService } from './sessions/session.service.js';
import { AbuseService } from './security/abuse.service.js';
import { AuthenticationGuard, CsrfGuard, RequestBudgetGuard } from './security/guards.js';
import { OutboxService } from './delivery/outbox.service.js';

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [
    IdentityModels,
    PasswordService,
    SessionService,
    AbuseService,
    OutboxService,
    AuthService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RequestBudgetGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [IdentityModels, PasswordService, SessionService, AbuseService, OutboxService],
})
export class IdentityModule {}
