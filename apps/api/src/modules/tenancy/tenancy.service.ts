import { Injectable, Inject } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { WorkspaceDto } from '@gather/contracts';
import { officeWorkspaceDetailResponseSchema } from '@gather/contracts';
import { TenancyModels } from './tenancy.models.js';
import type { WorkspaceRecord, MembershipRecord } from './tenancy.models.js';
import { IdentityModels } from '../identity/identity.models.js';
import { SessionService } from '../identity/sessions/session.service.js';
import type { ActorContext } from '../identity/sessions/session.service.js';
import { OutboxService } from '../identity/delivery/outbox.service.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { digest, newSecret } from '../identity/security/secrets.js';
import { invariant } from '../../platform/http/errors.js';
import { APPROVED_OFFICE_MAP_VERSION } from '../office/office-map-registry.js';

function dto(workspace: WorkspaceRecord, role: MembershipRecord['role']): WorkspaceDto {
  return {
    id: workspace._id,
    name: workspace.name,
    slug: workspace.slug,
    role,
    memberCount: workspace.memberCount,
  };
}
@Injectable()
export class TenancyService {
  constructor(
    @Inject(TenancyModels) readonly models: TenancyModels,
    @Inject(IdentityModels) private readonly identities: IdentityModels,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  async access(context: ActorContext, workspaceId: string, owner = false) {
    const member = await this.models.memberships
      .findOne({
        workspaceId,
        userId: context.user._id,
        status: 'active',
        ...(owner ? { role: 'owner' } : {}),
      })
      .read('primary')
      .readConcern('linearizable')
      .maxTimeMS(2000)
      .lean();
    invariant(member, 403, 'membership_required');
    const workspace = await this.models.workspaces
      .findOne({
        _id: workspaceId,
        status: 'active',
        ...(owner ? { ownerId: context.user._id } : {}),
      })
      .read('primary')
      .readConcern('linearizable')
      .maxTimeMS(2000)
      .lean();
    invariant(workspace, 403, 'workspace_unavailable');
    return { workspace, member };
  }
  async lockAccess(context: ActorContext, id: string, tx: ClientSession, owner = false) {
    await this.sessions.lockActor(context, tx);
    const member = await this.models.memberships
      .findOneAndUpdate(
        {
          workspaceId: id,
          userId: context.user._id,
          status: 'active',
          ...(owner ? { role: 'owner' } : {}),
        },
        { $inc: { policyVersion: 1 } },
        { session: tx, returnDocument: 'after' },
      )
      .lean();
    invariant(member, 403, 'membership_required');
    const workspace = await this.models.workspaces
      .findOneAndUpdate(
        { _id: id, status: 'active', ...(owner ? { ownerId: context.user._id } : {}) },
        { $inc: { policyVersion: 1 } },
        { session: tx, returnDocument: 'after' },
      )
      .lean();
    invariant(workspace, 403, 'workspace_unavailable');
    return { workspace, member };
  }
  private async operation<T>(
    context: ActorContext,
    scope: string,
    key: string,
    input: unknown,
    tx: ClientSession,
    work: () => Promise<T>,
  ): Promise<T> {
    const id = digest(`${context.user._id}:${scope}:${key}`);
    const fingerprint = digest(JSON.stringify(input));
    const existing = await this.models.operations.findById(id).session(tx).lean();
    if (existing) {
      invariant(existing.fingerprint === fingerprint, 409, 'idempotency_conflict');
      return existing.result as T;
    }
    const result = await work();
    await this.models.operations.create([{ _id: id, fingerprint, result, createdAt: new Date() }], {
      session: tx,
    });
    return result;
  }
  async create(context: ActorContext, input: { name: string; slug: string }, key: string) {
    return this.db.transaction(async (tx) => {
      await this.sessions.lockActor(context, tx);
      return this.operation(context, 'workspace.create', key, input, tx, async () => {
        const quota = await this.identities.users.updateOne(
          { _id: context.user._id, ownedWorkspaceCount: { $lt: 3 } },
          { $inc: { ownedWorkspaceCount: 1 } },
          { session: tx },
        );
        invariant(quota.modifiedCount === 1, 409, 'workspace_quota');
        const workspace: WorkspaceRecord = {
          _id: randomUUID(),
          name: input.name,
          slug: input.slug,
          ownerId: context.user._id,
          status: 'active',
          policyVersion: 0,
          memberCount: 1,
          createdAt: new Date(),
        };
        await this.models.workspaces.create([workspace], { session: tx });
        await this.models.memberships.create(
          [
            {
              _id: randomUUID(),
              workspaceId: workspace._id,
              userId: context.user._id,
              role: 'owner',
              status: 'active',
              policyVersion: 0,
              membershipGrantId: randomUUID(),
              joinedAt: new Date(),
            },
          ],
          { session: tx },
        );
        await this.models.offices.create(
          [
            {
              _id: randomUUID(),
              workspaceId: workspace._id,
              mapVersion: APPROVED_OFFICE_MAP_VERSION,
              createdAt: new Date(),
            },
          ],
          { session: tx },
        );
        await this.audit.record(
          context.user._id,
          'workspace.created',
          workspace._id,
          tx,
          workspace._id,
        );
        return { workspace: dto(workspace, 'owner') };
      });
    });
  }
  async list(context: ActorContext) {
    const memberships = await this.models.memberships
      .find({ userId: context.user._id, status: 'active' })
      .limit(100)
      .lean();
    const records = await this.models.workspaces
      .find({ _id: { $in: memberships.map((m) => m.workspaceId) }, status: 'active' })
      .sort({ createdAt: 1 })
      .lean();
    return {
      workspaces: records.map((w) =>
        dto(w, memberships.find((m) => m.workspaceId === w._id)!.role),
      ),
    };
  }
  async get(context: ActorContext, id: string) {
    return this.db.transaction(async (tx) => {
      const { workspace, member } = await this.lockAccess(context, id, tx);
      const office = await this.models.offices.findOne({ workspaceId: id }).session(tx).lean();
      invariant(office, 404, 'not_found');
      return officeWorkspaceDetailResponseSchema.parse({
        workspace: { ...dto(workspace, member.role), officeId: office._id },
      });
    });
  }
  async getOffice(context: ActorContext, workspaceId: string, officeId: string) {
    return this.db.transaction(async (tx) => {
      await this.lockAccess(context, workspaceId, tx);
      const office = await this.models.offices
        .findOne({ _id: officeId, workspaceId })
        .session(tx)
        .lean();
      invariant(office, 404, 'not_found');
      return office;
    });
  }
  async members(context: ActorContext, id: string) {
    return this.db.transaction(async (tx) => {
      await this.lockAccess(context, id, tx);
      const memberships = await this.models.memberships
        .find({ workspaceId: id, status: 'active' })
        .session(tx)
        .sort({ joinedAt: 1 })
        .limit(30)
        .lean();
      const users = await this.identities.users
        .find({ _id: { $in: memberships.map((m) => m.userId) } })
        .session(tx)
        .lean();
      return {
        members: memberships.map((m) => ({
          userId: m.userId,
          displayName: users.find((u) => u._id === m.userId)?.displayName ?? 'Unavailable',
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        })),
      };
    });
  }
  async invite(context: ActorContext, id: string, email: string, key: string) {
    return this.db.transaction(async (tx) => {
      await this.lockAccess(context, id, tx, true);
      return this.operation(context, `invitation.create:${id}`, key, { email }, tx, async () => {
        const user = await this.identities.users
          .findOne({ normalizedEmail: email })
          .session(tx)
          .lean();
        invariant(
          !user ||
            !(await this.models.memberships
              .exists({ workspaceId: id, userId: user._id, status: 'active' })
              .session(tx)),
          409,
          'already_member',
        );
        const pending = await this.models.invitations
          .find({
            workspaceId: id,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          })
          .session(tx)
          .lean();
        invariant(pending.length < 50, 429, 'invitation_quota');
        for (const old of pending.filter((invite) => invite.email === email)) {
          await this.models.invitations.updateOne(
            { _id: old._id },
            { $set: { revokedAt: new Date() } },
            { session: tx },
          );
          await this.outbox.expire(old._id, 'invitation', tx);
        }
        const workspace = await this.models.workspaces.findById(id).session(tx).lean();
        invariant(workspace, 403, 'workspace_unavailable');
        const raw = newSecret();
        const expiresAt = new Date(Date.now() + 7 * 86400_000);
        const invitationId = randomUUID();
        await this.models.invitations.create(
          [
            {
              _id: invitationId,
              workspaceId: id,
              email,
              tokenDigest: digest(raw),
              createdBy: context.user._id,
              expiresAt,
              consumedAt: null,
              acceptedBy: null,
              revokedAt: null,
              createdAt: new Date(),
            },
          ],
          { session: tx },
        );
        await this.outbox.create(
          invitationId,
          { recipient: email, kind: 'invitation', token: raw, companyName: workspace.name },
          expiresAt,
          tx,
        );
        await this.audit.record(context.user._id, 'invitation.created', invitationId, tx, id);
        return { invitation: { id: invitationId, email, expiresAt: expiresAt.toISOString() } };
      });
    });
  }
  async invitations(context: ActorContext, id: string) {
    return this.db.transaction(async (tx) => {
      await this.lockAccess(context, id, tx, true);
      const rows = await this.models.invitations
        .find({ workspaceId: id })
        .session(tx)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      return {
        invitations: rows.map((row) => ({
          id: row._id,
          email: row.email,
          expiresAt: row.expiresAt.toISOString(),
          status: row.revokedAt
            ? 'revoked'
            : row.consumedAt
              ? 'accepted'
              : row.expiresAt.getTime() <= Date.now()
                ? 'expired'
                : 'pending',
        })),
      };
    });
  }
  async revokeInvitation(context: ActorContext, id: string, invitationId: string, key: string) {
    return this.db.transaction(async (tx) => {
      await this.lockAccess(context, id, tx, true);
      return this.operation(
        context,
        `invitation.revoke:${id}`,
        key,
        { invitationId },
        tx,
        async () => {
          const result = await this.models.invitations.updateOne(
            { _id: invitationId, workspaceId: id, consumedAt: null },
            { $set: { revokedAt: new Date() } },
            { session: tx },
          );
          invariant(result.matchedCount, 404, 'not_found');
          await this.outbox.expire(invitationId, 'invitation', tx);
          await this.audit.record(context.user._id, 'invitation.revoked', invitationId, tx, id);
          return { message: 'Invitation revoked.' };
        },
      );
    });
  }
  async accept(context: ActorContext, token: string, key: string) {
    return this.db.transaction(async (tx) => {
      await this.sessions.lockActor(context, tx);
      return this.operation(
        context,
        'invitation.accept',
        key,
        { tokenDigest: digest(token) },
        tx,
        async () => {
          const invitation = await this.models.invitations
            .findOne({
              tokenDigest: digest(token),
              email: context.user.normalizedEmail,
              revokedAt: null,
              expiresAt: { $gt: new Date() },
            })
            .session(tx)
            .lean();
          invariant(invitation, 400, 'invalid_invitation');
          const existing = await this.models.memberships
            .findOne({ workspaceId: invitation.workspaceId, userId: context.user._id })
            .session(tx)
            .lean();
          if (invitation.consumedAt) {
            invariant(
              invitation.acceptedBy === context.user._id && existing?.status === 'active',
              400,
              'invalid_invitation',
            );
            const workspace = await this.models.workspaces
              .findOne({ _id: invitation.workspaceId, status: 'active' })
              .session(tx)
              .lean();
            invariant(workspace, 403, 'workspace_unavailable');
            return { workspace: dto(workspace, existing.role) };
          }
          const workspace = await this.models.workspaces
            .findOneAndUpdate(
              {
                _id: invitation.workspaceId,
                status: 'active',
                ...(!existing || existing.status !== 'active' ? { memberCount: { $lt: 30 } } : {}),
              },
              {
                $inc: {
                  policyVersion: 1,
                  ...(!existing || existing.status !== 'active' ? { memberCount: 1 } : {}),
                },
              },
              { session: tx, returnDocument: 'after' },
            )
            .lean();
          invariant(workspace, 409, 'workspace_full_or_unavailable');
          if (!existing || existing.status !== 'active')
            await this.models.memberships.updateOne(
              { workspaceId: workspace._id, userId: context.user._id },
              {
                $set: {
                  role: 'member',
                  status: 'active',
                  joinedAt: new Date(),
                  membershipGrantId: randomUUID(),
                },
                $inc: { policyVersion: 1 },
                $setOnInsert: { _id: randomUUID() },
              },
              { session: tx, upsert: true },
            );
          const consumed = await this.models.invitations.updateOne(
            {
              _id: invitation._id,
              consumedAt: null,
              revokedAt: null,
              expiresAt: { $gt: new Date() },
            },
            { $set: { consumedAt: new Date(), acceptedBy: context.user._id } },
            { session: tx },
          );
          invariant(consumed.modifiedCount === 1, 400, 'invalid_invitation');
          await this.outbox.expire(invitation._id, 'invitation', tx);
          await this.audit.record(
            context.user._id,
            'invitation.accepted',
            invitation._id,
            tx,
            workspace._id,
          );
          return {
            workspace: dto(workspace, existing?.status === 'active' ? existing.role : 'member'),
          };
        },
      );
    });
  }
  async remove(context: ActorContext, id: string, userId: string, key: string, leave = false) {
    return this.db.transaction(async (tx) => {
      await this.lockAccess(context, id, tx, !leave);
      return this.operation(
        context,
        `membership.remove:${id}`,
        key,
        { userId, leave },
        tx,
        async () => {
          if (leave) invariant(userId === context.user._id, 403, 'forbidden');
          const member = await this.models.memberships
            .findOne({ workspaceId: id, userId, status: 'active' })
            .session(tx)
            .lean();
          invariant(member, 404, 'not_found');
          invariant(member.role !== 'owner', 409, 'owner_transfer_required');
          await this.models.memberships.updateOne(
            { _id: member._id, status: 'active' },
            { $set: { status: 'revoked' }, $inc: { policyVersion: 1 } },
            { session: tx },
          );
          const quota = await this.models.workspaces.updateOne(
            { _id: id, memberCount: { $gt: 1 } },
            { $inc: { memberCount: -1 } },
            { session: tx },
          );
          invariant(quota.modifiedCount === 1, 409, 'membership_conflict');
          const user = await this.identities.users.findById(userId).session(tx).lean();
          if (user) {
            const invites = await this.models.invitations
              .find({
                workspaceId: id,
                email: user.normalizedEmail,
                consumedAt: null,
                revokedAt: null,
              })
              .session(tx)
              .lean();
            for (const invite of invites) {
              await this.models.invitations.updateOne(
                { _id: invite._id },
                { $set: { revokedAt: new Date() } },
                { session: tx },
              );
              await this.outbox.expire(invite._id, 'invitation', tx);
            }
          }
          await this.audit.record(context.user._id, 'membership.revoked', userId, tx, id);
          return { message: 'Membership removed.' };
        },
      );
    });
  }
  async transfer(context: ActorContext, id: string, userId: string, key: string) {
    this.sessions.recent(context);
    invariant(userId !== context.user._id, 400, 'invalid_target');
    return this.db.transaction(async (tx) => {
      this.sessions.recent(context);
      await this.lockAccess(context, id, tx, true);
      return this.operation(context, `ownership.transfer:${id}`, key, { userId }, tx, async () => {
        const member = await this.models.memberships
          .findOne({ workspaceId: id, userId, status: 'active', role: 'member' })
          .session(tx)
          .lean();
        invariant(member, 400, 'verified_member_required');
        const target = await this.identities.users
          .findOneAndUpdate(
            {
              _id: userId,
              status: 'active',
              verifiedAt: { $ne: null },
              ownedWorkspaceCount: { $lt: 3 },
            },
            { $inc: { ownedWorkspaceCount: 1, policyVersion: 1 } },
            { session: tx, returnDocument: 'after' },
          )
          .lean();
        invariant(target, 409, 'target_unavailable_or_quota');
        await this.models.memberships.updateOne(
          { workspaceId: id, userId: context.user._id, role: 'owner', status: 'active' },
          { $set: { role: 'member' }, $inc: { policyVersion: 1 } },
          { session: tx },
        );
        await this.models.memberships.updateOne(
          { _id: member._id, role: 'member', status: 'active' },
          { $set: { role: 'owner' }, $inc: { policyVersion: 1 } },
          { session: tx },
        );
        await this.models.workspaces.updateOne(
          { _id: id, ownerId: context.user._id },
          { $set: { ownerId: userId }, $inc: { policyVersion: 1 } },
          { session: tx },
        );
        await this.identities.users.updateOne(
          { _id: context.user._id, ownedWorkspaceCount: { $gt: 0 } },
          { $inc: { ownedWorkspaceCount: -1 } },
          { session: tx },
        );
        await this.audit.record(context.user._id, 'ownership.transferred', userId, tx, id);
        return { message: 'Ownership transferred.' };
      });
    });
  }
}
