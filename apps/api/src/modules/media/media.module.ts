import { Module } from '@nestjs/common';
import { OfficeModule } from '../office/office.module.js';
import { MediaMachineGuard } from './media-machine.guard.js';
import { MediaController } from './media.controller.js';
import { MediaPolicyService } from './media-policy.service.js';

@Module({
  imports: [OfficeModule],
  controllers: [MediaController],
  providers: [MediaMachineGuard, MediaPolicyService],
  exports: [MediaPolicyService],
})
export class MediaModule {}
