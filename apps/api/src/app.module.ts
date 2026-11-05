import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IdentityModule } from './modules/identity/identity.module.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';
import { OfficeModule } from './modules/office/office.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthController } from './platform/health/health.controller.js';
import { environmentSchema } from './platform/config/environment.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: (config: Record<string, unknown>) => environmentSchema.parse(config),
    }),
    IdentityModule,
    TenancyModule,
    OfficeModule,
    ConversationsModule,
    MediaModule,
    AuditModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
