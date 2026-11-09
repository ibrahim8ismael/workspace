import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OFFICE_LIMITS,
  OFFICE_PROTOCOL_VERSION,
  idSchema,
  mapVersionSchema,
  protocolVersionSchema,
  secretSchema,
} from '@gather/contracts';
import type {
  JoinTicketRequest,
  JoinTicketResponse,
  TakeoverReferenceRequest,
  TakeoverReferenceResponse,
  TakeoverTicketRequest,
} from '@gather/contracts';
import { TenancyModels } from '../tenancy/tenancy.models.js';
import type { MembershipRecord, OfficeRecord } from '../tenancy/tenancy.models.js';
import { TenancyService } from '../tenancy/tenancy.service.js';
import { IdentityModels } from '../identity/identity.models.js';
import type { ActorContext } from '../identity/sessions/session.service.js';
import { AbuseService } from '../identity/security/abuse.service.js';
import { digest, newSecret } from '../identity/security/secrets.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { invariant } from '../../platform/http/errors.js';
import { APPROVED_OFFICE_MAP_VERSION } from './commons-registry.js';
import { OfficeEpochRegistry } from './office-epoch.registry.js';
import { OfficeJoinTicketModels } from './join-ticket.models.js';
import type { OfficeJoinTicketRecord } from './join-ticket.models.js';
import { OfficeRuntimeService } from './runtime/office-runtime.service.js';
import type { TakeoverReferenceBinding } from './runtime/office-runtime.service.js';

interface AdmissionScope {
  workspaceId: string;
  officeId: string;
  mapVersion: string;
  protocolVersion: number;
}
interface OfficeScope {
  workspaceId: string;
  officeId: string;
}

function checkOffice(office: OfficeRecord, request: JoinTicketRequest) {
  invariant(office.mapVersion === APPROVED_OFFICE_MAP_VERSION, 409, 'office_not_ready');
  invariant(office.mapVersion === request.mapVersion, 409, 'map_version_mismatch');
  invariant(request.protocolVersion === OFFICE_PROTOCOL_VERSION, 409, 'protocol_mismatch');
}

function grantId(member: MembershipRecord) {
  return member.membershipGrantId ?? member._id;
}

@Injectable()
export class OfficeAdmissionService {
  constructor(
    @Inject(TenancyModels) private readonly tenancyModels: TenancyModels,
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(IdentityModels) private readonly identities: IdentityModels,
    @Inject(AbuseService) private readonly abuse: AbuseService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OfficeJoinTicketModels) private readonly ticketModels: OfficeJoinTicketModels,
    @Inject(OfficeEpochRegistry) private readonly epochs: OfficeEpochRegistry,
    @Inject(OfficeRuntimeService) private readonly runtime: OfficeRuntimeService,
  ) {}

  async issue(
    context: ActorContext,
    scope: OfficeScope,
    request: JoinTicketRequest,
  ): Promise<JoinTicketResponse> {
    idSchema.parse(scope.workspaceId);
    idSchema.parse(scope.officeId);
    mapVersionSchema.parse(request.mapVersion);
    protocolVersionSchema.parse(request.protocolVersion);

    await this.db.transaction(async (tx) => {
      await this.tenancy.lockAccess(context, scope.workspaceId, tx);
      const office = await this.tenancyModels.offices
        .findOne({ _id: scope.officeId, workspaceId: scope.workspaceId })
        .session(tx)
        .lean();
      invariant(office, 404, 'not_found');
      checkOffice(office, request);
    });

    await this.abuse.consume(
      'office-ticket-actor',
      context.user._id,
      OFFICE_LIMITS.ticketsPerActorPerWindow,
      OFFICE_LIMITS.ticketWindowMs,
    );
    await this.abuse.consume(
      'office-ticket-workspace',
      scope.workspaceId,
      OFFICE_LIMITS.ticketsPerWorkspacePerWindow,
      OFFICE_LIMITS.ticketWindowMs,
    );
    await this.abuse.consume(
      'office-ticket-global',
      'global',
      OFFICE_LIMITS.ticketsGloballyPerWindow,
      OFFICE_LIMITS.ticketWindowMs,
    );

    const raw = newSecret();
    const expiresAt = await this.db.transaction(async (tx) => {
      const { member } = await this.tenancy.lockAccess(context, scope.workspaceId, tx);
      const office = await this.tenancyModels.offices
        .findOne({ _id: scope.officeId, workspaceId: scope.workspaceId })
        .session(tx)
        .lean();
      invariant(office, 404, 'not_found');
      checkOffice(office, request);
      const now = new Date();
      const session = await this.identities.sessions
        .findOne({
          _id: context.session._id,
          kind: 'authenticated',
          userId: context.user._id,
          authVersion: context.user.authVersion,
          revokedAt: null,
          absoluteExpiresAt: { $gt: now },
          idleExpiresAt: { $gt: now },
        })
        .session(tx)
        .lean();
      invariant(session, 401, 'unauthorized');
      const expiry = new Date(
        Math.min(
          now.getTime() + OFFICE_LIMITS.maxJoinTicketLifetimeMs,
          session.absoluteExpiresAt.getTime(),
          session.idleExpiresAt.getTime(),
        ),
      );
      invariant(expiry.getTime() > now.getTime(), 401, 'unauthorized');
      const officeEpoch = this.epochs.forOffice(office._id);
      const record: OfficeJoinTicketRecord = {
        _id: randomUUID(),
        ticketDigest: digest(raw),
        userId: context.user._id,
        sessionId: session._id,
        workspaceId: scope.workspaceId,
        officeId: office._id,
        membershipGrantId: grantId(member),
        officeEpoch,
        mapVersion: office.mapVersion,
        protocolVersion: request.protocolVersion,
        expiresAt: expiry,
        consumedAt: null,
        createdAt: now,
      };
      await this.ticketModels.tickets.create([record], { session: tx });
      return expiry;
    });

    return { ticket: raw, expiresAt: expiresAt.toISOString() };
  }

  async issueTakeoverReference(
    context: ActorContext,
    scope: OfficeScope,
    request: TakeoverReferenceRequest,
  ): Promise<TakeoverReferenceResponse> {
    const { binding, expiresAt } = await this.takeoverContext(context, scope, request);
    await this.consumeTicketIssuanceBudget(context.user._id, scope.workspaceId);
    const result = this.runtime.issueTakeoverReference(binding, expiresAt.getTime());
    if (typeof result === 'string') invariant(false, result === 'rate_limited' ? 429 : 409, result);
    return { ...result, expiresAt: expiresAt.toISOString() };
  }

  async issueTakeoverTicket(
    context: ActorContext,
    scope: OfficeScope,
    request: TakeoverTicketRequest,
  ): Promise<JoinTicketResponse> {
    const { binding } = await this.takeoverContext(context, scope, {
      ...request.takeover,
      mapVersion: request.mapVersion,
      protocolVersion: request.protocolVersion,
    });
    await this.consumeTicketIssuanceBudget(context.user._id, scope.workspaceId);
    const target = this.runtime.consumeTakeoverReference(request.takeover.reference, binding);
    if (typeof target === 'string') {
      const status = target === 'unauthorized' || target === 'invalid_token' ? 401 : 409;
      invariant(false, status, target);
    }

    const raw = newSecret();
    const expiresAt = await this.db.transaction(async (tx) => {
      const { member } = await this.tenancy.lockAccess(context, scope.workspaceId, tx);
      const office = await this.tenancyModels.offices
        .findOne({ _id: scope.officeId, workspaceId: scope.workspaceId })
        .session(tx)
        .lean();
      invariant(office, 404, 'not_found');
      checkOffice(office, request);
      const now = new Date();
      const session = await this.identities.sessions
        .findOne({
          _id: context.session._id,
          kind: 'authenticated',
          userId: context.user._id,
          authVersion: context.user.authVersion,
          revokedAt: null,
          absoluteExpiresAt: { $gt: now },
          idleExpiresAt: { $gt: now },
        })
        .session(tx)
        .lean();
      invariant(session, 401, 'unauthorized');
      const expiry = new Date(
        Math.min(
          now.getTime() + OFFICE_LIMITS.maxJoinTicketLifetimeMs,
          session.absoluteExpiresAt.getTime(),
          session.idleExpiresAt.getTime(),
        ),
      );
      invariant(expiry.getTime() > now.getTime(), 401, 'unauthorized');
      const officeEpoch = this.epochs.forOffice(office._id);
      invariant(officeEpoch === target.officeEpoch, 409, 'stale_epoch');
      const record: OfficeJoinTicketRecord = {
        _id: randomUUID(),
        ticketDigest: digest(raw),
        userId: context.user._id,
        sessionId: session._id,
        workspaceId: scope.workspaceId,
        officeId: office._id,
        membershipGrantId: grantId(member),
        officeEpoch,
        mapVersion: office.mapVersion,
        protocolVersion: request.protocolVersion,
        takeoverParticipationId: target.participationId,
        takeoverOfficeEpoch: target.officeEpoch,
        expiresAt: expiry,
        consumedAt: null,
        createdAt: now,
      };
      await this.ticketModels.tickets.create([record], { session: tx });
      return expiry;
    });
    return { ticket: raw, expiresAt: expiresAt.toISOString() };
  }

  private async takeoverContext(
    context: ActorContext,
    scope: OfficeScope,
    request: TakeoverReferenceRequest,
  ): Promise<{ binding: TakeoverReferenceBinding; expiresAt: Date }> {
    idSchema.parse(scope.workspaceId);
    idSchema.parse(scope.officeId);
    idSchema.parse(request.participationId);
    mapVersionSchema.parse(request.mapVersion);
    protocolVersionSchema.parse(request.protocolVersion);
    return this.db.transaction(async (tx) => {
      const { member } = await this.tenancy.lockAccess(context, scope.workspaceId, tx);
      const office = await this.tenancyModels.offices
        .findOne({ _id: scope.officeId, workspaceId: scope.workspaceId })
        .session(tx)
        .lean();
      invariant(office, 404, 'not_found');
      checkOffice(office, request);
      const now = new Date();
      const session = await this.identities.sessions
        .findOne({
          _id: context.session._id,
          kind: 'authenticated',
          userId: context.user._id,
          authVersion: context.user.authVersion,
          revokedAt: null,
          absoluteExpiresAt: { $gt: now },
          idleExpiresAt: { $gt: now },
        })
        .session(tx)
        .lean();
      invariant(session, 401, 'unauthorized');
      const officeEpoch = this.epochs.current(office._id);
      invariant(officeEpoch && officeEpoch === request.officeEpoch, 409, 'stale_epoch');
      const expiresAt = new Date(
        Math.min(
          now.getTime() + OFFICE_LIMITS.takeoverReferenceLifetimeMs,
          session.absoluteExpiresAt.getTime(),
          session.idleExpiresAt.getTime(),
        ),
      );
      invariant(expiresAt.getTime() > now.getTime(), 401, 'unauthorized');
      return {
        binding: {
          userId: context.user._id,
          sessionId: session._id,
          membershipGrantId: grantId(member),
          workspaceId: scope.workspaceId,
          officeId: scope.officeId,
          officeEpoch,
          participationId: request.participationId,
        },
        expiresAt,
      };
    });
  }

  private async consumeTicketIssuanceBudget(userId: string, workspaceId: string) {
    await this.abuse.consume(
      'office-ticket-actor',
      userId,
      OFFICE_LIMITS.ticketsPerActorPerWindow,
      OFFICE_LIMITS.ticketWindowMs,
    );
    await this.abuse.consume(
      'office-ticket-workspace',
      workspaceId,
      OFFICE_LIMITS.ticketsPerWorkspacePerWindow,
      OFFICE_LIMITS.ticketWindowMs,
    );
    await this.abuse.consume(
      'office-ticket-global',
      'global',
      OFFICE_LIMITS.ticketsGloballyPerWindow,
      OFFICE_LIMITS.ticketWindowMs,
    );
  }

  async consume(rawTicket: string, scope: AdmissionScope) {
    invariant(secretSchema.safeParse(rawTicket).success, 401, 'unauthorized');
    idSchema.parse(scope.workspaceId);
    idSchema.parse(scope.officeId);
    mapVersionSchema.parse(scope.mapVersion);
    protocolVersionSchema.parse(scope.protocolVersion);

    const ticketDigest = digest(rawTicket);
    const initial = await this.ticketModels.tickets
      .findOne({ ticketDigest })
      .select('+ticketDigest')
      .lean();
    invariant(initial, 401, 'unauthorized');
    invariant(
      initial.officeId === scope.officeId && initial.workspaceId === scope.workspaceId,
      401,
      'unauthorized',
    );
    invariant(this.epochs.current(initial.officeId) === initial.officeEpoch, 409, 'stale_epoch');

    const consumed = await this.db.transaction(async (tx) => {
      const now = new Date();
      const ticket = await this.ticketModels.tickets
        .findOne({ ticketDigest })
        .select('+ticketDigest')
        .session(tx)
        .lean();
      invariant(
        ticket && ticket.consumedAt === null && ticket.expiresAt > now,
        401,
        'unauthorized',
      );
      invariant(
        Boolean(ticket.takeoverParticipationId) === Boolean(ticket.takeoverOfficeEpoch),
        401,
        'unauthorized',
      );
      invariant(
        ticket.officeId === scope.officeId && ticket.workspaceId === scope.workspaceId,
        401,
        'unauthorized',
      );
      invariant(ticket.mapVersion === scope.mapVersion, 409, 'map_version_mismatch');
      invariant(ticket.protocolVersion === scope.protocolVersion, 409, 'protocol_mismatch');

      const session = await this.identities.sessions
        .findOne({
          _id: ticket.sessionId,
          userId: ticket.userId,
          kind: 'authenticated',
          revokedAt: null,
          absoluteExpiresAt: { $gt: now },
          idleExpiresAt: { $gt: now },
        })
        .session(tx)
        .lean();
      invariant(session, 401, 'unauthorized');
      const user = await this.identities.users
        .findOne({
          _id: ticket.userId,
          status: 'active',
          verifiedAt: { $ne: null },
          authVersion: session.authVersion,
        })
        .session(tx)
        .lean();
      invariant(user, 401, 'unauthorized');
      const context = { session, user };
      const { member } = await this.tenancy.lockAccess(context, ticket.workspaceId, tx);
      invariant(grantId(member) === ticket.membershipGrantId, 401, 'unauthorized');
      const office = await this.tenancyModels.offices
        .findOne({
          _id: ticket.officeId,
          workspaceId: ticket.workspaceId,
          mapVersion: ticket.mapVersion,
        })
        .session(tx)
        .lean();
      invariant(
        office && office.mapVersion === APPROVED_OFFICE_MAP_VERSION,
        409,
        'office_not_ready',
      );
      invariant(ticket.officeEpoch === this.epochs.current(ticket.officeId), 409, 'stale_epoch');

      const consumedAt = new Date();
      invariant(ticket.expiresAt > consumedAt, 401, 'unauthorized');
      const update = await this.ticketModels.tickets.updateOne(
        { _id: ticket._id, consumedAt: null, expiresAt: { $gt: consumedAt } },
        { $set: { consumedAt } },
        { session: tx },
      );
      invariant(update.modifiedCount === 1, 401, 'unauthorized');
      return {
        userId: ticket.userId,
        displayName: user.displayName,
        sessionId: ticket.sessionId,
        membershipGrantId: ticket.membershipGrantId,
        workspaceId: ticket.workspaceId,
        officeId: ticket.officeId,
        officeEpoch: ticket.officeEpoch,
        mapVersion: ticket.mapVersion,
        protocolVersion: ticket.protocolVersion,
        ...(ticket.takeoverParticipationId && ticket.takeoverOfficeEpoch
          ? {
              takeoverParticipationId: ticket.takeoverParticipationId,
              takeoverOfficeEpoch: ticket.takeoverOfficeEpoch,
            }
          : {}),
      };
    });

    invariant(this.epochs.current(consumed.officeId) === consumed.officeEpoch, 409, 'stale_epoch');
    return consumed;
  }

  async consumeSocketTicket(rawTicket: string, protocolVersion: number) {
    invariant(secretSchema.safeParse(rawTicket).success, 401, 'unauthorized');
    protocolVersionSchema.parse(protocolVersion);
    const ticket = await this.ticketModels.tickets
      .findOne({ ticketDigest: digest(rawTicket) })
      .select('+ticketDigest')
      .read('primary')
      .lean();
    invariant(ticket, 401, 'unauthorized');
    return this.consume(rawTicket, {
      workspaceId: ticket.workspaceId,
      officeId: ticket.officeId,
      mapVersion: ticket.mapVersion,
      protocolVersion,
    });
  }

  async isSocketAuthorized(ticket: ConsumedOfficeTicketShape): Promise<boolean> {
    if (this.epochs.current(ticket.officeId) !== ticket.officeEpoch) return false;
    const now = new Date();
    const [session, user, member, workspace, office] = await Promise.all([
      this.identities.sessions
        .findOne({
          _id: ticket.sessionId,
          userId: ticket.userId,
          kind: 'authenticated',
          revokedAt: null,
          absoluteExpiresAt: { $gt: now },
          idleExpiresAt: { $gt: now },
        })
        .read('primary')
        .readConcern('linearizable')
        .maxTimeMS(2000)
        .lean(),
      this.identities.users
        .findOne({ _id: ticket.userId, status: 'active', verifiedAt: { $ne: null } })
        .read('primary')
        .readConcern('linearizable')
        .maxTimeMS(2000)
        .lean(),
      this.tenancyModels.memberships
        .findOne({
          workspaceId: ticket.workspaceId,
          userId: ticket.userId,
          status: 'active',
        })
        .read('primary')
        .readConcern('linearizable')
        .maxTimeMS(2000)
        .lean(),
      this.tenancyModels.workspaces
        .findOne({ _id: ticket.workspaceId, status: 'active' })
        .read('primary')
        .readConcern('linearizable')
        .maxTimeMS(2000)
        .lean(),
      this.tenancyModels.offices
        .findOne({
          _id: ticket.officeId,
          workspaceId: ticket.workspaceId,
          mapVersion: ticket.mapVersion,
        })
        .read('primary')
        .readConcern('linearizable')
        .maxTimeMS(2000)
        .lean(),
    ]);
    return Boolean(
      session &&
      user &&
      user.authVersion === session.authVersion &&
      member &&
      grantId(member) === ticket.membershipGrantId &&
      workspace &&
      office &&
      office.mapVersion === APPROVED_OFFICE_MAP_VERSION &&
      this.epochs.current(ticket.officeId) === ticket.officeEpoch,
    );
  }
}

interface ConsumedOfficeTicketShape {
  userId: string;
  sessionId: string;
  workspaceId: string;
  officeId: string;
  officeEpoch: string;
  mapVersion: string;
  membershipGrantId: string;
}
