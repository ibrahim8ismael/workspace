import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { mediaPolicyInstallAckSchema, mediaPolicyPullSchema } from '@gather/contracts';
import { ValidationPipe } from '../../platform/http/validation.pipe.js';
import { MediaMachineRoute } from './media-machine.guard.js';
import { MediaPolicyService } from './media-policy.service.js';

@Controller('media/internal/policy')
export class MediaController {
  constructor(private readonly policy: MediaPolicyService) {}

  @Post('pull')
  @MediaMachineRoute()
  pull(@Body(new ValidationPipe(mediaPolicyPullSchema)) body: unknown, @Res() response: Response) {
    const snapshot = this.policy.issueSnapshot(body);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-CP07-Signature', snapshot.signature);
    response.status(200).send(snapshot.body);
  }

  @Post('ack')
  @MediaMachineRoute()
  acknowledge(
    @Body(new ValidationPipe(mediaPolicyInstallAckSchema)) body: unknown,
    @Res() response: Response,
  ) {
    response.status(200).json(this.policy.acknowledgeInstallation(body));
  }
}
