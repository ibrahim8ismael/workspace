import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OfficeController } from './office.controller.js';
import { OfficeJoinTicketModels } from './join-ticket.models.js';
import { OfficeAdmissionService } from './office-admission.service.js';
import { OfficeEpochRegistry } from './office-epoch.registry.js';
import { OfficeRuntimeService } from './runtime/office-runtime.service.js';
import { OfficeGateway } from './realtime/office.gateway.js';
import { OfficeRoomEventPublisher } from './office-room-event-publisher.js';

@Module({
  imports: [TenancyModule, IdentityModule],
  providers: [
    OfficeJoinTicketModels,
    OfficeAdmissionService,
    OfficeEpochRegistry,
    OfficeRuntimeService,
    OfficeGateway,
    OfficeRoomEventPublisher,
  ],
  controllers: [OfficeController],
  exports: [
    OfficeJoinTicketModels,
    OfficeAdmissionService,
    OfficeEpochRegistry,
    OfficeRuntimeService,
    OfficeRoomEventPublisher,
  ],
})
export class OfficeModule {}
