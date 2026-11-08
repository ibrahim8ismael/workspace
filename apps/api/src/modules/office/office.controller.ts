import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { idSchema, officeBootstrapResponseSchema } from '@gather/contracts';
import type { AuthRequest } from '../identity/security/guards.js';
import { actor } from '../identity/sessions/session.service.js';
import { ValidationPipe } from '../../platform/http/validation.pipe.js';
import { invariant } from '../../platform/http/errors.js';
import { TenancyService } from '../tenancy/tenancy.service.js';
import { trustedOfficeBootstrap } from './commons-registry.js';

@Controller('workspaces/:workspaceId/offices/:officeId')
export class OfficeController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  @Get()
  async bootstrap(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Req() request: AuthRequest,
  ) {
    const office = await this.tenancy.getOffice(actor(request.authContext), workspaceId, officeId);
    const result = trustedOfficeBootstrap(office._id, workspaceId, office.mapVersion);
    invariant(result, 409, 'office_not_ready');
    return officeBootstrapResponseSchema.parse(result);
  }
}
