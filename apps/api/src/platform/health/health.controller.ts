import { Controller, Get, Header } from '@nestjs/common';
import type { LivenessResponse } from '@gather/contracts';
import { Public } from '../../modules/identity/security/guards.js';

@Controller('health')
export class HealthController {
  /** Process liveness only: this does not report infrastructure readiness. */
  @Public()
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): LivenessResponse {
    return { status: 'ok', service: 'api' };
  }
}
