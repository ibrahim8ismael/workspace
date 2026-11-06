import { Injectable, Inject } from '@nestjs/common';
import type { ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { IdentityModels } from '../identity.models.js';
import type { SessionRecord, UserRecord } from '../identity.models.js';
import { csrfToken, digest, newSecret } from '../security/secrets.js';
import { invariant } from '../../../platform/http/errors.js';

export interface BrowserContext {
  session: SessionRecord;
  user: UserRecord | null;
}
export interface ActorContext extends BrowserContext {
  user: UserRecord;
}
export const SESSION_COOKIE = '__Host-gather_session';
export const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
export function actor(context: BrowserContext | undefined | null): ActorContext {
  invariant(context?.user && context.session.kind === 'authenticated', 401, 'unauthorized');
  return context as ActorContext;
}
@Injectable()
export class SessionService {
  constructor(@Inject(IdentityModels) private readonly models: IdentityModels) {}
  async load(raw: unknown): Promise<BrowserContext | null> {
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
    const now = new Date();
    const session = await this.models.sessions
      .findOne({
        tokenDigest: digest(raw),
        revokedAt: null,
        absoluteExpiresAt: { $gt: now },
        idleExpiresAt: { $gt: now },
      })
      .select('+csrfSecret +tokenDigest')
      .read('primary')
      .readConcern('linearizable')
      .maxTimeMS(2000)
      .lean();
    if (!session) return null;
    let user: UserRecord | null = null;
    if (session.kind === 'authenticated') {
      user = await this.models.users
        .findOne({
          _id: session.userId,
          status: 'active',
          verifiedAt: { $ne: null },
          authVersion: session.authVersion,
        })
        .read('primary')
        .readConcern('linearizable')
        .maxTimeMS(2000)
        .lean();
      if (!user) return null;
    }
    if (
      session.absoluteExpiresAt.getTime() <= Date.now() ||
      session.idleExpiresAt.getTime() <= Date.now()
    )
      return null;
    return { session, user };
  }
  draft(user?: UserRecord) {
    const raw = newSecret();
    const now = new Date();
    const duration = user ? 12 * 3600_000 : 15 * 60_000;
    const record: SessionRecord = {
      _id: randomUUID(),
      tokenDigest: digest(raw),
      csrfSecret: newSecret(),
      kind: user ? 'authenticated' : 'anonymous',
      userId: user ? user._id : null,
      authVersion: user ? user.authVersion : 0,
      version: 0,
      createdAt: now,
      absoluteExpiresAt: new Date(now.getTime() + duration),
      idleExpiresAt: new Date(now.getTime() + (user ? 3600_000 : duration)),
      revokedAt: null,
      reauthenticatedAt: user ? now : null,
    };
    return { raw, record, csrfToken: csrfToken(record.csrfSecret, record._id) };
  }
  async anonymous() {
    const draft = this.draft();
    await this.models.sessions.create([draft.record], { w: 'majority', wtimeout: 5000 });
    return draft;
  }
  async lockBrowser(context: BrowserContext, tx: ClientSession) {
    const now = new Date();
    const session = await this.models.sessions
      .findOneAndUpdate(
        {
          _id: context.session._id,
          revokedAt: null,
          absoluteExpiresAt: { $gt: now },
          idleExpiresAt: { $gt: now },
          authVersion: context.session.authVersion,
        },
        { $inc: { version: 1 } },
        { session: tx, returnDocument: 'after' },
      )
      .select('+csrfSecret +tokenDigest')
      .lean();
    invariant(session, 401, 'unauthorized');
    return session;
  }
  async lockActor(context: ActorContext, tx: ClientSession) {
    const session = await this.lockBrowser(context, tx);
    const user = await this.models.users
      .findOneAndUpdate(
        {
          _id: session.userId,
          status: 'active',
          verifiedAt: { $ne: null },
          authVersion: session.authVersion,
        },
        { $inc: { policyVersion: 1 } },
        { session: tx, returnDocument: 'after' },
      )
      .lean();
    invariant(user, 401, 'unauthorized');
    return user;
  }
  recent(context: ActorContext) {
    invariant(
      context.session.reauthenticatedAt &&
        Date.now() - context.session.reauthenticatedAt.getTime() < 10 * 60_000,
      403,
      'reauthentication_required',
    );
  }
}
