import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import {
  idSchema,
  joinTicketRequestSchema,
  joinTicketResponseSchema,
  officeBootstrapResponseSchema,
  takeoverReferenceRequestSchema,
  takeoverReferenceResponseSchema,
  takeoverTicketRequestSchema,
} from '@gather/contracts';
import type { AuthRequest } from '../identity/security/guards.js';
import { actor } from '../identity/sessions/session.service.js';
import { ValidationPipe } from '../../platform/http/validation.pipe.js';
import { invariant } from '../../platform/http/errors.js';
import { TenancyService } from '../tenancy/tenancy.service.js';
import { trustedOfficeBootstrap } from './commons-registry.js';
import { OfficeAdmissionService } from './office-admission.service.js';
import type {
  JoinTicketRequest,
  TakeoverReferenceRequest,
  TakeoverTicketRequest,
} from '@gather/contracts';

@Controller('workspaces/:workspaceId/offices/:officeId')
export class OfficeController {
  constructor(
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(OfficeAdmissionService) private readonly admission: OfficeAdmissionService,
  ) {}

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

  @Post('join-ticket')
  async issue(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Body(new ValidationPipe(joinTicketRequestSchema)) body: JoinTicketRequest,
    @Req() request: AuthRequest,
  ) {
    const response = await this.admission.issue(
      actor(request.authContext),
      { workspaceId, officeId },
      body,
    );
    return joinTicketResponseSchema.parse(response);
  }

  @Post('takeover-reference')
  async issueTakeoverReference(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Body(new ValidationPipe(takeoverReferenceRequestSchema)) body: TakeoverReferenceRequest,
    @Req() request: AuthRequest,
  ) {
    const response = await this.admission.issueTakeoverReference(
      actor(request.authContext),
      { workspaceId, officeId },
      body,
    );
    return takeoverReferenceResponseSchema.parse(response);
  }

  @Post('join-ticket/takeover')
  async issueTakeoverTicket(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Body(new ValidationPipe(takeoverTicketRequestSchema)) body: TakeoverTicketRequest,
    @Req() request: AuthRequest,
  ) {
    const response = await this.admission.issueTakeoverTicket(
      actor(request.authContext),
      { workspaceId, officeId },
      body,
    );
    return joinTicketResponseSchema.parse(response);
  }
}
