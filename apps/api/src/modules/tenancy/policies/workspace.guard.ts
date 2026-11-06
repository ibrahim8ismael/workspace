import { Injectable, Inject, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { idSchema } from '@gather/contracts';
import { TenancyService } from '../tenancy.service.js';
import { actor } from '../../identity/sessions/session.service.js';
import type { AuthRequest } from '../../identity/security/guards.js';
import { invariant } from '../../../platform/http/errors.js';

export const OwnerOnly = () => SetMetadata('gather:owner', true);
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const id = idSchema.safeParse(request.params['workspaceId']);
    invariant(id.success, 400, 'invalid_workspace_id');
    const owner =
      this.reflector.getAllAndOverride<boolean>('gather:owner', [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;
    await this.tenancy.access(actor(request.authContext), id.data, owner);
    return true;
  }
}
