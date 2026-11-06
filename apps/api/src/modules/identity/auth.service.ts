import { Injectable, Inject } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { AccountDto } from '@gather/contracts';
import { IdentityModels } from './identity.models.js';
import type { UserRecord } from './identity.models.js';
import { PasswordService } from './security/password.service.js';
import { SessionService } from './sessions/session.service.js';
import type { ActorContext, BrowserContext } from './sessions/session.service.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { OutboxService } from './delivery/outbox.service.js';
import { AuditService } from '../audit/audit.service.js';
import { digest, newSecret } from './security/secrets.js';
import { fail, invariant } from '../../platform/http/errors.js';

export const genericResponse = {
  message: 'If the request is eligible, instructions will be sent.',
};
export function accountDto(user: UserRecord): AccountDto {
  return {
    id: user._id,
    email: user.normalizedEmail,
    displayName: user.displayName,
    verifiedAt: user.verifiedAt?.toISOString() ?? '',
  };
}
@Injectable()
export class AuthService {
  constructor(
    @Inject(IdentityModels) readonly models: IdentityModels,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}
  private async issue(
    user: UserRecord,
    purpose: 'verify-email' | 'reset-password',
    tx: ClientSession,
  ) {
    const now = new Date();
    const raw = newSecret();
    const expiresAt = new Date(
      now.getTime() + (purpose === 'verify-email' ? 86400_000 : 15 * 60_000),
    );
    await this.models.tokens.updateMany(
      { userId: user._id, purpose, consumedAt: null },
      { $set: { consumedAt: now } },
      { session: tx },
    );
    await this.outbox.expire(user._id, purpose, tx);
    await this.models.tokens.create(
      [
        {
          _id: randomUUID(),
          userId: user._id,
          purpose,
          tokenDigest: digest(raw),
          authVersion: user.authVersion,
          expiresAt,
          consumedAt: null,
          createdAt: now,
        },
      ],
      { session: tx },
    );
    await this.outbox.create(
      user._id,
      { recipient: user.normalizedEmail, kind: purpose, token: raw },
      expiresAt,
      tx,
    );
  }
  async register(
    input: { email: string; displayName: string; password: string },
    browser: BrowserContext,
  ) {
    const hash = await this.passwords.hash(input.password);
    try {
      await this.db.transaction(async (tx) => {
        await this.sessions.lockBrowser(browser, tx);
        if (await this.models.users.exists({ normalizedEmail: input.email }).session(tx)) return;
        const user: UserRecord = {
          _id: randomUUID(),
          normalizedEmail: input.email,
          displayName: input.displayName,
          status: 'pending',
          verifiedAt: null,
          authVersion: 0,
          policyVersion: 0,
          ownedWorkspaceCount: 0,
          createdAt: new Date(),
        };
        await this.models.users.create([user], { session: tx });
        await this.models.credentials.create(
          [
            {
              _id: randomUUID(),
              userId: user._id,
              passwordHash: hash,
              version: 0,
              accessFence: 0,
              changedAt: new Date(),
            },
          ],
          { session: tx },
        );
        await this.issue(user, 'verify-email', tx);
        await this.audit.record(user._id, 'account.registered', user._id, tx);
      });
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000))
        throw error;
    }
    return genericResponse;
  }
  async issueRequested(
    email: string,
    purpose: 'verify-email' | 'reset-password',
    browser: BrowserContext,
  ) {
    await this.db.transaction(async (tx) => {
      await this.sessions.lockBrowser(browser, tx);
      const user = await this.models.users
        .findOneAndUpdate(
          { normalizedEmail: email, ...(purpose === 'verify-email' ? { status: 'pending' } : {}) },
          { $inc: { policyVersion: 1 } },
          { session: tx, returnDocument: 'after' },
        )
        .lean();
      if (user) await this.issue(user, purpose, tx);
    });
    return genericResponse;
  }
  private async credentialProof(userId: string, password: string) {
    const credential = await this.models.credentials
      .findOne({ userId })
      .select('+passwordHash')
      .lean();
    const valid = await this.passwords.verify(credential?.passwordHash, password);
    invariant(valid && credential, 401, 'invalid_credentials');
    return credential;
  }
  private async fenceCredential(id: string, version: number, hash: string, tx: ClientSession) {
    const result = await this.models.credentials.updateOne(
      { _id: id, version, passwordHash: hash },
      { $inc: { accessFence: 1 } },
      { session: tx },
    );
    invariant(result.modifiedCount === 1, 401, 'credentials_changed');
  }
  async verifyEmail(input: { token: string; password: string }, browser: BrowserContext) {
    const token = await this.models.tokens
      .findOne({
        tokenDigest: digest(input.token),
        purpose: 'verify-email',
        consumedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .lean();
    invariant(token, 400, 'invalid_token');
    const credential = await this.credentialProof(token.userId, input.password);
    await this.db.transaction(async (tx) => {
      await this.sessions.lockBrowser(browser, tx);
      const current = await this.models.tokens
        .findOneAndUpdate(
          { _id: token._id, consumedAt: null, expiresAt: { $gt: new Date() } },
          { $set: { consumedAt: new Date() } },
          { session: tx, returnDocument: 'after' },
        )
        .lean();
      invariant(current, 400, 'invalid_token');
      await this.fenceCredential(credential._id, credential.version, credential.passwordHash, tx);
      const user = await this.models.users
        .findOneAndUpdate(
          { _id: token.userId, status: 'pending', authVersion: token.authVersion },
          {
            $set: { status: 'active', verifiedAt: new Date() },
            $inc: { authVersion: 1, policyVersion: 1 },
          },
          { session: tx, returnDocument: 'after' },
        )
        .lean();
      invariant(user, 400, 'invalid_token');
      await this.expireTokens(user._id, tx);
      await this.audit.record(user._id, 'account.verified', user._id, tx);
    });
    return { message: 'Email verified. Sign in to continue.' };
  }
  async login(input: { email: string; password: string }, browser: BrowserContext) {
    const user = await this.models.users.findOne({ normalizedEmail: input.email }).lean();
    const credential = user
      ? await this.models.credentials.findOne({ userId: user._id }).select('+passwordHash').lean()
      : null;
    const valid = await this.passwords.verify(credential?.passwordHash, input.password);
    invariant(
      valid && user && credential && user.status === 'active' && user.verifiedAt,
      401,
      'invalid_credentials',
    );
    return this.db.transaction(async (tx) => {
      await this.sessions.lockBrowser(browser, tx);
      await this.fenceCredential(credential._id, credential.version, credential.passwordHash, tx);
      const current = await this.models.users
        .findOneAndUpdate(
          {
            _id: user._id,
            status: 'active',
            verifiedAt: { $ne: null },
            authVersion: user.authVersion,
          },
          { $inc: { policyVersion: 1 } },
          { session: tx, returnDocument: 'after' },
        )
        .lean();
      invariant(current, 401, 'invalid_credentials');
      const draft = this.sessions.draft(current);
      await this.models.sessions.updateOne(
        { _id: browser.session._id },
        { $set: { revokedAt: new Date() } },
        { session: tx },
      );
      await this.models.sessions.create([draft.record], { session: tx });
      await this.audit.record(current._id, 'session.login', draft.record._id, tx);
      return { ...draft, account: accountDto(current) };
    });
  }
  private async expireTokens(userId: string, tx: ClientSession) {
    await this.models.tokens.updateMany(
      { userId, consumedAt: null },
      { $set: { consumedAt: new Date() } },
      { session: tx },
    );
    await this.outbox.expire(userId, 'verify-email', tx);
    await this.outbox.expire(userId, 'reset-password', tx);
  }
  async resetPassword(input: { token: string; newPassword: string }, browser: BrowserContext) {
    const hash = await this.passwords.hash(input.newPassword);
    await this.db.transaction(async (tx) => {
      await this.sessions.lockBrowser(browser, tx);
      const token = await this.models.tokens
        .findOneAndUpdate(
          {
            tokenDigest: digest(input.token),
            purpose: 'reset-password',
            consumedAt: null,
            expiresAt: { $gt: new Date() },
          },
          { $set: { consumedAt: new Date() } },
          { session: tx, returnDocument: 'after' },
        )
        .lean();
      invariant(token, 400, 'invalid_token');
      const user = await this.models.users
        .findOne({ _id: token.userId, authVersion: token.authVersion })
        .session(tx)
        .lean();
      invariant(user, 400, 'invalid_token');
      const changed = await this.models.users.updateOne(
        { _id: user._id, authVersion: token.authVersion },
        {
          $set: {
            status: user.status === 'pending' ? 'active' : user.status,
            verifiedAt: user.verifiedAt ?? new Date(),
          },
          $inc: { authVersion: 1, policyVersion: 1 },
        },
        { session: tx },
      );
      invariant(changed.modifiedCount === 1, 400, 'invalid_token');
      await this.models.credentials.updateOne(
        { userId: user._id },
        { $set: { passwordHash: hash, changedAt: new Date() }, $inc: { version: 1 } },
        { session: tx },
      );
      await this.models.sessions.updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session: tx },
      );
      await this.expireTokens(user._id, tx);
      await this.audit.record(user._id, 'password.reset', user._id, tx);
    });
    return { message: 'Password changed. Sign in again.' };
  }
  async changePassword(
    context: ActorContext,
    input: { currentPassword: string; newPassword: string },
  ) {
    this.sessions.recent(context);
    const credential = await this.credentialProof(context.user._id, input.currentPassword);
    const hash = await this.passwords.hash(input.newPassword);
    await this.db.transaction(async (tx) => {
      const user = await this.sessions.lockActor(context, tx);
      await this.fenceCredential(credential._id, credential.version, credential.passwordHash, tx);
      await this.models.credentials.updateOne(
        { _id: credential._id },
        { $set: { passwordHash: hash, changedAt: new Date() }, $inc: { version: 1 } },
        { session: tx },
      );
      await this.models.users.updateOne(
        { _id: user._id },
        { $inc: { authVersion: 1 } },
        { session: tx },
      );
      await this.models.sessions.updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session: tx },
      );
      await this.expireTokens(user._id, tx);
      await this.audit.record(user._id, 'password.changed', user._id, tx);
    });
    return { message: 'Password changed. Sign in again.' };
  }
  async reauthenticate(context: ActorContext, password: string) {
    const credential = await this.credentialProof(context.user._id, password);
    return this.db.transaction(async (tx) => {
      const user = await this.sessions.lockActor(context, tx);
      await this.fenceCredential(credential._id, credential.version, credential.passwordHash, tx);
      const draft = this.sessions.draft(user);
      await this.models.sessions.updateOne(
        { _id: context.session._id },
        { $set: { revokedAt: new Date() } },
        { session: tx },
      );
      await this.models.sessions.create([draft.record], { session: tx });
      return { ...draft, account: accountDto(user) };
    });
  }
  async logout(context: ActorContext, all = false) {
    await this.db.transaction(async (tx) => {
      const user = await this.sessions.lockActor(context, tx);
      if (all) await this.expireTokens(user._id, tx);
      if (all)
        await this.models.users.updateOne(
          { _id: user._id },
          { $inc: { authVersion: 1 } },
          { session: tx },
        );
      await this.models.sessions.updateMany(
        all ? { userId: user._id, revokedAt: null } : { _id: context.session._id },
        { $set: { revokedAt: new Date() } },
        { session: tx },
      );
      await this.audit.record(
        user._id,
        all ? 'session.logout_all' : 'session.logout',
        context.session._id,
        tx,
      );
    });
    return { message: 'Signed out.' };
  }
  async listSessions(context: ActorContext) {
    const rows = await this.models.sessions
      .find({
        userId: context.user._id,
        kind: 'authenticated',
        revokedAt: null,
        absoluteExpiresAt: { $gt: new Date() },
        idleExpiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return {
      sessions: rows.map((row) => ({
        id: row._id,
        current: row._id === context.session._id,
        createdAt: row.createdAt.toISOString(),
        absoluteExpiresAt: row.absoluteExpiresAt.toISOString(),
        idleExpiresAt: row.idleExpiresAt.toISOString(),
      })),
    };
  }
  async revokeSession(context: ActorContext, id: string) {
    await this.db.transaction(async (tx) => {
      await this.sessions.lockActor(context, tx);
      const result = await this.models.sessions.updateOne(
        { _id: id, userId: context.user._id, kind: 'authenticated' },
        { $set: { revokedAt: new Date() } },
        { session: tx },
      );
      if (!result.matchedCount) fail(404, 'not_found');
      await this.audit.record(context.user._id, 'session.revoked', id, tx);
    });
    return { message: 'Session revoked.' };
  }
  async extend(context: ActorContext) {
    return this.db.transaction(async (tx) => {
      await this.sessions.lockActor(context, tx);
      const expiresAt = new Date(
        Math.min(context.session.absoluteExpiresAt.getTime(), Date.now() + 3600_000),
      );
      await this.models.sessions.updateOne(
        { _id: context.session._id },
        { $set: { idleExpiresAt: expiresAt } },
        { session: tx },
      );
      return { idleExpiresAt: expiresAt.toISOString() };
    });
  }
}
