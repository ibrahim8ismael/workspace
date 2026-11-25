import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import type { ApiEnvironment } from '../../platform/config/environment.js';
import { OfficeController } from './office.controller.js';
import { OfficeJoinTicketModels } from './join-ticket.models.js';
import { OfficeAdmissionService } from './office-admission.service.js';
import { OfficeEpochRegistry } from './office-epoch.registry.js';
import { OfficeRuntimeService } from './runtime/office-runtime.service.js';
import { OfficeGateway } from './realtime/office.gateway.js';
import { OfficeRoomEventPublisher } from './office-room-event-publisher.js';
import { MeetingScreenShareMetricsService } from './meeting-screen-share-metrics.service.js';

@Module({
  imports: [TenancyModule, IdentityModule],
  providers: [
    OfficeJoinTicketModels,
    OfficeAdmissionService,
    OfficeEpochRegistry,
    MeetingScreenShareMetricsService,
    {
      provide: OfficeRuntimeService,
      useFactory: (config: ConfigService<ApiEnvironment, true>) =>
        new OfficeRuntimeService(config.get('SCREEN_SHARE_ENABLED', { infer: true })),
      inject: [ConfigService],
    },
    OfficeGateway,
    OfficeRoomEventPublisher,
  ],
  controllers: [OfficeController],
  exports: [
    OfficeJoinTicketModels,
    OfficeAdmissionService,
    OfficeEpochRegistry,
    OfficeRuntimeService,
    MeetingScreenShareMetricsService,
    OfficeRoomEventPublisher,
  ],
})
export class OfficeModule {}
