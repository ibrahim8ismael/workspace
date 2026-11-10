import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { OfficeModule } from '../office/office.module.js';
import { MediaMachineGuard } from './media-machine.guard.js';
import { MediaController } from './media.controller.js';
import { MediaPolicyService } from './media-policy.service.js';
import { MediaTokenController } from './media-token.controller.js';
import { MediaTokenService } from './media-token.service.js';

@Module({
  imports: [IdentityModule, TenancyModule, OfficeModule],
  controllers: [MediaController, MediaTokenController],
  providers: [MediaMachineGuard, MediaPolicyService, MediaTokenService],
  exports: [MediaPolicyService],
})
export class MediaModule {}
