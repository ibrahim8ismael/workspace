import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { OfficeModule } from '../office/office.module.js';
import { MediaMachineGuard } from './media-machine.guard.js';
import { MediaController } from './media.controller.js';
import { MediaPolicyService } from './media-policy.service.js';
import { MediaTokenController } from './media-token.controller.js';
import { MediaTokenService } from './media-token.service.js';
import { MediaWebhookController } from './media-webhook.controller.js';
import { MediaWebhookModels } from './media-webhook.models.js';
import { MediaWebhookService } from './media-webhook.service.js';

@Module({
  imports: [IdentityModule, TenancyModule, OfficeModule],
  controllers: [MediaController, MediaTokenController, MediaWebhookController],
  providers: [
    MediaMachineGuard,
    MediaPolicyService,
    MediaTokenService,
    MediaWebhookModels,
    MediaWebhookService,
  ],
  exports: [MediaPolicyService, MediaWebhookModels],
})
export class MediaModule {}
