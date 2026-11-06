import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  Inject,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  createWorkspaceSchema,
  createInvitationSchema,
  acceptInvitationSchema,
  transferOwnershipSchema,
  idSchema,
  emptyBodySchema,
} from '@gather/contracts';
import type { AuthRequest } from '../identity/security/guards.js';
import { actor } from '../identity/sessions/session.service.js';
import { AbuseService } from '../identity/security/abuse.service.js';
import { ValidationPipe } from '../../platform/http/validation.pipe.js';
import { invariant } from '../../platform/http/errors.js';
import { TenancyService } from './tenancy.service.js';
import { WorkspaceGuard, OwnerOnly } from './policies/workspace.guard.js';

function key(request: AuthRequest) {
  const value = request.get('idempotency-key');
  invariant(value && /^[A-Za-z0-9_-]{16,100}$/.test(value), 400, 'idempotency_key_required');
  return value;
}
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(AbuseService) private readonly abuse: AbuseService,
  ) {}
  @Post()
  async create(
    @Body(new ValidationPipe(createWorkspaceSchema)) body: { name: string; slug: string },
    @Req() request: AuthRequest,
  ) {
    const context = actor(request.authContext);
    await this.abuse.consume('workspace-create', context.user._id, 10, 15 * 60_000);
    return this.tenancy.create(context, body, key(request));
  }
  @Get() list(@Req() request: AuthRequest) {
    return this.tenancy.list(actor(request.authContext));
  }
}
@Controller('workspaces/:workspaceId')
@UseGuards(WorkspaceGuard)
export class WorkspaceController {
  constructor(
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(AbuseService) private readonly abuse: AbuseService,
  ) {}
  @Get() get(
    @Param('workspaceId', new ValidationPipe(idSchema)) id: string,
    @Req() request: AuthRequest,
  ) {
    return this.tenancy.get(actor(request.authContext), id);
  }
  @Get('members') members(
    @Param('workspaceId', new ValidationPipe(idSchema)) id: string,
    @Req() request: AuthRequest,
  ) {
    return this.tenancy.members(actor(request.authContext), id);
  }
  @OwnerOnly() @Get('invitations') invitations(
    @Param('workspaceId', new ValidationPipe(idSchema)) id: string,
    @Req() request: AuthRequest,
  ) {
    return this.tenancy.invitations(actor(request.authContext), id);
  }
  @OwnerOnly()
  @Post('invitations')
  async invite(
    @Param('workspaceId', new ValidationPipe(idSchema)) id: string,
    @Body(new ValidationPipe(createInvitationSchema)) body: { email: string },
    @Req() request: AuthRequest,
  ) {
    const context = actor(request.authContext);
    await this.abuse.consume('invitation-create', id, 30, 3600_000);
    return this.tenancy.invite(context, id, body.email, key(request));
  }
  @OwnerOnly()
  @Delete('invitations/:invitationId')
  revokeInvitation(
    @Param('workspaceId', new ValidationPipe(idSchema)) id: string,
    @Param('invitationId', new ValidationPipe(idSchema)) invitationId: string,
    @Req() request: AuthRequest,
  ) {
    return this.tenancy.revokeInvitation(
      actor(request.authContext),
      id,
      invitationId,
      key(request),
    );
  }
  @OwnerOnly()
  @Delete('members/:userId')
  remove(
    @Param('workspaceId', new ValidationPipe(idSchema)) id: string,
    @Param('userId', new ValidationPipe(idSchema)) userId: string,
    @Req() request: AuthRequest,
  ) {
    return this.tenancy.remove(actor(request.authContext), id, userId, key(request));
  }
  @Post('leave')
  @HttpCode(200)
  leave(
    @Param('workspaceId', new ValidationPipe(idSchema)) id: string,
    @Body(new ValidationPipe(emptyBodySchema)) _body: Record<string, never>,
    @Req() request: AuthRequest,
  ) {
    const context = actor(request.authContext);
    return this.tenancy.remove(context, id, context.user._id, key(request), true);
  }
  @OwnerOnly()
  @Post('transfer-ownership')
  @HttpCode(200)
  transfer(
    @Param('workspaceId', new ValidationPipe(idSchema)) id: string,
    @Body(new ValidationPipe(transferOwnershipSchema)) body: { userId: string },
    @Req() request: AuthRequest,
  ) {
    return this.tenancy.transfer(actor(request.authContext), id, body.userId, key(request));
  }
}
@Controller('invitations')
export class InvitationAcceptanceController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}
  @Post('accept')
  @HttpCode(200)
  accept(
    @Body(new ValidationPipe(acceptInvitationSchema)) body: { token: string },
    @Req() request: AuthRequest,
  ) {
    return this.tenancy.accept(actor(request.authContext), body.token, key(request));
  }
}
