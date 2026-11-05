import { Controller, Get, Header } from '@nestjs/common';
import type { LivenessResponse } from '@gather/contracts';

@Controller('health')
export class HealthController {
  /** Process liveness only: this does not report infrastructure readiness. */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): LivenessResponse {
    return { status: 'ok', service: 'api' };
  }
}
