import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { TenancyModels } from './tenancy.models.js';
import { TenancyService } from './tenancy.service.js';
import { WorkspaceGuard } from './policies/workspace.guard.js';
import {
  WorkspacesController,
  WorkspaceController,
  InvitationAcceptanceController,
} from './tenancy.controller.js';
@Module({
  imports: [IdentityModule, AuditModule],
  providers: [TenancyModels, TenancyService, WorkspaceGuard],
  controllers: [WorkspacesController, WorkspaceController, InvitationAcceptanceController],
  exports: [TenancyModels, TenancyService],
})
export class TenancyModule {}
