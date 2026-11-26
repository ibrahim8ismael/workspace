import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  idSchema,
  joinTicketRequestSchema,
  joinTicketResponseSchema,
  officeBootstrapResponseSchema,
  publishWorkspaceLayoutSchema,
  saveWorkspaceLayoutSchema,
  workspaceLayoutSnapshotSchema,
  takeoverReferenceRequestSchema,
  takeoverReferenceResponseSchema,
  takeoverTicketRequestSchema,
  updateWorkspaceRoomCountSchema,
} from '@gather/contracts';
import type { AuthRequest } from '../identity/security/guards.js';
import { actor } from '../identity/sessions/session.service.js';
import { ValidationPipe } from '../../platform/http/validation.pipe.js';
import { invariant } from '../../platform/http/errors.js';
import { TenancyService } from '../tenancy/tenancy.service.js';
import { trustedOfficeBootstrap } from './office-map-registry.js';
import { OfficeEpochRegistry } from './office-epoch.registry.js';
import { OfficeAdmissionService } from './office-admission.service.js';
import { OfficeRuntimeService } from './runtime/office-runtime.service.js';
import type {
  JoinTicketRequest,
  PublishWorkspaceLayoutInput,
  SaveWorkspaceLayoutInput,
  TakeoverReferenceRequest,
  TakeoverTicketRequest,
} from '@gather/contracts';

function idempotencyKey(request: AuthRequest) {
  const key = request.get('idempotency-key');
  invariant(key && /^[A-Za-z0-9_-]{16,100}$/.test(key), 400, 'idempotency_key_required');
  return key;
}

function isOfficeInUse(error: unknown) {
  if (!(error instanceof HttpException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === 'office_in_use'
  );
}

@Controller('workspaces/:workspaceId/offices/:officeId')
export class OfficeController {
  constructor(
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(OfficeAdmissionService) private readonly admission: OfficeAdmissionService,
    @Inject(OfficeRuntimeService) private readonly runtime: OfficeRuntimeService,
    @Inject(OfficeEpochRegistry) private readonly epochs: OfficeEpochRegistry,
  ) {}

  @Patch('rooms')
  async updateRooms(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Body(new ValidationPipe(updateWorkspaceRoomCountSchema))
    body: {
      roomCount: number;
      expectedRevision: number;
    },
    @Req() request: AuthRequest,
  ) {
    const key = idempotencyKey(request);
    const context = actor(request.authContext);
    await this.tenancy.assertOwnerOffice(context, workspaceId, officeId);
    return this.runtime.withOfficeReconfiguration(officeId, () =>
      this.tenancy.updateRoomCount(context, workspaceId, officeId, body, key),
    );
  }

  @Get('layout')
  async getLayout(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Req() request: AuthRequest,
  ) {
    const result = await this.tenancy.getWorkspaceLayout(
      actor(request.authContext),
      workspaceId,
      officeId,
    );
    return workspaceLayoutSnapshotSchema.parse(result);
  }

  @Patch('layout')
  async saveLayout(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Body(new ValidationPipe(saveWorkspaceLayoutSchema)) body: SaveWorkspaceLayoutInput,
    @Req() request: AuthRequest,
  ) {
    const result = await this.tenancy.saveWorkspaceLayout(
      actor(request.authContext),
      workspaceId,
      officeId,
      body,
      idempotencyKey(request),
    );
    return workspaceLayoutSnapshotSchema.parse(result);
  }

  @Post('layout/publish')
  @HttpCode(200)
  async publishLayout(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Body(new ValidationPipe(publishWorkspaceLayoutSchema)) body: PublishWorkspaceLayoutInput,
    @Req() request: AuthRequest,
  ) {
    const key = idempotencyKey(request);
    const context = actor(request.authContext);
    await this.tenancy.assertOwnerOffice(context, workspaceId, officeId);
    try {
      return await this.runtime.withOfficeReconfiguration(officeId, async () => {
        const { snapshot, mapChanged } = await this.tenancy.publishWorkspaceLayout(
          context,
          workspaceId,
          officeId,
          body,
          key,
        );
        if (mapChanged) this.epochs.rotate(officeId);
        return workspaceLayoutSnapshotSchema.parse(snapshot);
      });
    } catch (error) {
      if (isOfficeInUse(error)) {
        const replay = await this.tenancy.replayPublishedWorkspaceLayout(
          context,
          workspaceId,
          officeId,
          body,
          key,
        );
        if (replay) return workspaceLayoutSnapshotSchema.parse(replay);
      }
      throw error;
    }
  }

  @Get()
  async bootstrap(
    @Param('workspaceId', new ValidationPipe(idSchema)) workspaceId: string,
    @Param('officeId', new ValidationPipe(idSchema)) officeId: string,
    @Req() request: AuthRequest,
  ) {
    const office = await this.tenancy.getOffice(actor(request.authContext), workspaceId, officeId);
    const result = trustedOfficeBootstrap(
      office._id,
      workspaceId,
      office.mapVersion,
      office.publishedLayout,
      office.publishedPreset,
    );
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
