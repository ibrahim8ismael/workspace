import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { mediaPolicyInstallAckSchema, mediaPolicyPullSchema } from '@gather/contracts';
import { ValidationPipe } from '../../platform/http/validation.pipe.js';
import { OfficeRuntimeService } from '../office/runtime/office-runtime.service.js';
import { MeetingScreenShareMetricsService } from '../office/meeting-screen-share-metrics.service.js';
import { MediaMachineRoute } from './media-machine.guard.js';
import { MediaPolicyService } from './media-policy.service.js';

@Controller('media/internal')
export class MediaController {
  constructor(
    private readonly policy: MediaPolicyService,
    private readonly screenShareMetrics: MeetingScreenShareMetricsService,
    private readonly runtime: OfficeRuntimeService,
  ) {}

  @Post('policy/pull')
  @MediaMachineRoute()
  pull(@Body(new ValidationPipe(mediaPolicyPullSchema)) body: unknown, @Res() response: Response) {
    const snapshot = this.policy.issueSnapshot(body);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-CP07-Signature', snapshot.signature);
    response.status(200).send(snapshot.body);
  }

  @Post('policy/ack')
  @MediaMachineRoute()
  acknowledge(
    @Body(new ValidationPipe(mediaPolicyInstallAckSchema)) body: unknown,
    @Res() response: Response,
  ) {
    const acknowledgement = this.policy.acknowledgeInstallation(body);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-CP07-Signature', acknowledgement.signature);
    response.status(200).send(acknowledgement.body);
  }

  @Post('metrics/meeting-screen-share')
  @MediaMachineRoute()
  async meetingScreenShareMetrics(
    @Body(new ValidationPipe(z.object({}).strict())) _body: unknown,
    @Res() response: Response,
  ) {
    const snapshot = await this.screenShareMetrics.snapshot(
      this.runtime.meetingScreenShareMetricCounts(),
    );
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.status(200).send(snapshot);
  }
}
