import 'reflect-metadata';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IndexesService } from '../dist/platform/database/indexes.service.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import type { Response as HttpResponse } from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { decryptMail } from '@gather/delivery';
import {
  accountResponseSchema,
  authenticatedResponseSchema,
  csrfResponseSchema,
  apiErrorResponseSchema,
  messageResponseSchema,
  workspaceResponseSchema,
  workspacesResponseSchema,
  membersResponseSchema,
  invitationResponseSchema,
  invitationsResponseSchema,
  sessionsResponseSchema,
  extendSessionResponseSchema,
} from '@gather/contracts';
import { IdentityModels } from '../dist/modules/identity/identity.models.js';
import { TenancyModels } from '../dist/modules/tenancy/tenancy.models.js';
import { SessionService, actor } from '../dist/modules/identity/sessions/session.service.js';
import { TenancyService } from '../dist/modules/tenancy/tenancy.service.js';
import { OutboxService } from '../dist/modules/identity/delivery/outbox.service.js';
import { PasswordService } from '../dist/modules/identity/security/password.service.js';
import { deliverOutbox } from '../../worker/dist/processors/delivery.js';
import { dispatchOutbox } from '../../worker/dist/outbox/dispatcher.js';
import type { Queue } from 'bullmq';
import { AbuseService } from '../dist/modules/identity/security/abuse.service.js';
import { digest } from '../dist/modules/identity/security/secrets.js';
import { configureHttp } from '../dist/platform/http/configure.js';

const origin = 'https://api.gather.test';
const password = 'a quartz river beneath the lantern';
const newPassword = 'a copper forest beyond the telescope';
const encryption = randomBytes(32);
let app: NestExpressApplication;
let mongo: MongoMemoryReplSet;
let identities: IdentityModels;
let tenancy: TenancyModels;
let outbox: OutboxService;

function status(response: HttpResponse, expected: number) {
  expect(response.status, response.body.error?.code).toBe(expected);
  if (response.status >= 400) apiErrorResponseSchema.parse(response.body);
}
class Client {
  cookie = '';
  csrf = '';
  capture(response: HttpResponse) {
    if (response.status < 400) {
      if (response.body.csrfToken) {
        if (response.body.account) authenticatedResponseSchema.parse(response.body);
        else csrfResponseSchema.parse(response.body);
      } else if (response.body.message) messageResponseSchema.parse(response.body);
    }
    const values = response.headers['set-cookie'];
    const cookie = (Array.isArray(values) ? values : [values]).find(
      (value: unknown) => typeof value === 'string' && value.startsWith('__Host-gather_session='),
    );
    if (cookie) this.cookie = cookie.split(';')[0]!;
    if (typeof response.body.csrfToken === 'string') this.csrf = response.body.csrfToken;
    return response;
  }
  async bootstrap() {
    const response = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', this.cookie);
    status(response, 200);
    this.capture(response);
    return response;
  }
  async send(
    method: 'post' | 'delete',
    path: string,
    body: Record<string, unknown> = {},
    key = randomUUID(),
  ) {
    const agent = request(app.getHttpServer());
    const response = await agent[method](path)
      .set('Origin', origin)
      .set('X-CSRF-Token', this.csrf)
      .set('Cookie', this.cookie)
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', key)
      .send(body);
    return this.capture(response);
  }
  get(path: string) {
    return request(app.getHttpServer()).get(path).set('Cookie', this.cookie);
  }
}
async function mailCode(
  email: string,
  kind: 'verify-email' | 'reset-password' | 'invitation',
  subjectId?: string,
) {
  const user = await identities.users.findOne({ normalizedEmail: email }).lean();
  const subject = subjectId ?? user?._id;
  if (!subject) throw new Error('Expected mail subject');
  const record = await outbox.model
    .findOne({ subjectId: subject, kind, state: 'pending' })
    .select('+payload')
    .sort({ createdAt: -1 })
    .lean();
  if (!record?.payload) throw new Error('Expected an encrypted pending mail record');
  return decryptMail(record._id, record.payload, encryption).token;
}
async function account(email = `person-${randomUUID()}@example.com`) {
  const client = new Client();
  await client.bootstrap();
  status(
    await client.send('post', '/api/auth/register', {
      email,
      password,
      displayName: 'Test Person',
    }),
    202,
  );
  const token = await mailCode(email, 'verify-email');
  status(await client.send('post', '/api/auth/verify-email', { token, password }), 200);
  const login = await client.send('post', '/api/auth/login', { email, password });
  status(login, 200);
  return { client, email, id: String(login.body.account.id) };
}
async function workspace(owner: Awaited<ReturnType<typeof account>>) {
  const response = await owner.client.send('post', '/api/workspaces', {
    name: 'Example Company',
    slug: `company-${randomUUID()}`,
  });
  status(response, 201);
  return String(response.body.workspace.id);
}
async function invite(
  owner: Awaited<ReturnType<typeof account>>,
  workspaceId: string,
  member: Awaited<ReturnType<typeof account>>,
) {
  const response = await owner.client.send('post', `/api/workspaces/${workspaceId}/invitations`, {
    email: member.email,
  });
  status(response, 201);
  return {
    id: String(response.body.invitation.id),
    token: await mailCode(member.email, 'invitation', response.body.invitation.id),
  };
}
async function join(
  owner: Awaited<ReturnType<typeof account>>,
  id: string,
  member: Awaited<ReturnType<typeof account>>,
) {
  const invitation = await invite(owner, id, member);
  status(
    await member.client.send('post', '/api/invitations/accept', { token: invitation.token }),
    200,
  );
  return invitation;
}

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['APP_ORIGIN'] = origin;
  process.env['DB_AUTO_INDEX'] = 'true';
  process.env['OUTBOX_ENCRYPTION_KEY'] = encryption.toString('base64');
  process.env['MONGOMS_DOWNLOAD_DIR'] = resolve(process.cwd(), '../../.cache/mongodb-binaries');
  mongo = await MongoMemoryReplSet.create({
    binary: { version: '8.2.6' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ args: ['--setParameter', 'ttlMonitorEnabled=false'] }],
  });
  process.env['MONGODB_URI'] = mongo.getUri('gather_auth_tests');
  const { AppModule } = await import('../dist/app.module.js');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  app.useBodyParser('json', { limit: '4kb' });
  configureHttp(app);
  await app.listen(0, '127.0.0.1');
  identities = app.get(IdentityModels);
  tenancy = app.get(TenancyModels);
  outbox = app.get(OutboxService);
}, 180000);
afterAll(async () => {
  await app?.close();
  await mongo?.stop();
});
beforeEach(async () => {
  await identities.rateLimits.deleteMany({});
});

describe('backend account authentication', () => {
  it('keeps liveness public and rejects protected routes without authentication', async () => {
    status(await request(app.getHttpServer()).get('/api/health/live'), 200);
    status(await request(app.getHttpServer()).get('/api/auth/me'), 401);
    status(await request(app.getHttpServer()).get('/api/workspaces'), 401);
  });
  it('requires a safe CSRF bootstrap and preserves an existing authenticated cookie', async () => {
    status(await request(app.getHttpServer()).get('/api/auth/csrf'), 403);
    const user = await account();
    const cookie = user.client.cookie;
    const response = await user.client.bootstrap();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(user.client.cookie === cookie).toBe(true);
    const bad = await request(app.getHttpServer())
      .get('/api/auth/csrf')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.test')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('X-Requested-With', 'XMLHttpRequest');
    status(bad, 403);
    expect(bad.headers['set-cookie']).toBeUndefined();
    status(await user.client.get('/api/auth/me'), 200);
  });
  it('registers pending accounts without returning tokens or granting authenticated access', async () => {
    const client = new Client();
    const boot = await client.bootstrap();
    const cookieHeader = String(boot.headers['set-cookie']);
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('Secure');
    expect(cookieHeader).toContain('SameSite=Lax');
    expect(cookieHeader).toContain('Path=/');
    expect(cookieHeader).not.toContain('Domain=');
    const email = `pending-${randomUUID()}@example.com`;
    const response = await client.send('post', '/api/auth/register', {
      email,
      password,
      displayName: 'Pending Person',
    });
    status(response, 202);
    expect(Object.keys(response.body)).toEqual(['message']);
    status(await client.get('/api/auth/me'), 401);
    status(await client.send('post', '/api/auth/login', { email, password }), 401);
    const record = await identities.users.findOne({ normalizedEmail: email }).lean();
    if (!record) throw new Error('Pending account missing');
    expect(record.status).toBe('pending');
    const secret = await mailCode(email, 'verify-email');
    expect(JSON.stringify(response.body).includes(secret)).toBe(false);
    const stored = await identities.tokens
      .findOne({ userId: record._id })
      .select('+tokenDigest')
      .lean();
    expect(stored?.tokenDigest === secret).toBe(false);
  });
  it('rejects role overposting, NoSQL payloads, wrong CSRF and wrong Origin', async () => {
    const client = new Client();
    await client.bootstrap();
    status(
      await client.send('post', '/api/auth/register', {
        email: 'x@example.com',
        password,
        displayName: 'Somebody',
        role: 'owner',
      }),
      400,
    );
    status(
      await client.send('post', '/api/auth/register', {
        email: { $ne: null },
        password,
        displayName: 'Somebody',
      }),
      400,
    );
    const csrf = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Cookie', client.cookie)
      .set('Origin', origin)
      .send({ email: 'x@example.com', password, displayName: 'Somebody' });
    status(csrf, 403);
    const cross = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Cookie', client.cookie)
      .set('Origin', 'https://evil.test')
      .set('X-CSRF-Token', client.csrf)
      .send({ email: 'x@example.com', password, displayName: 'Somebody' });
    status(cross, 403);
  });
  it('prevents preregistration takeover and supports legitimate pending-account recovery', async () => {
    const attacker = new Client();
    await attacker.bootstrap();
    const email = `recovery-${randomUUID()}@example.com`;
    status(
      await attacker.send('post', '/api/auth/register', {
        email,
        password,
        displayName: 'Pending Person',
      }),
      202,
    );
    const verify = await mailCode(email, 'verify-email');
    status(
      await attacker.send('post', '/api/auth/verify-email', {
        token: verify,
        password: 'a different mailbox password',
      }),
      401,
    );
    const legitimate = new Client();
    await legitimate.bootstrap();
    status(await legitimate.send('post', '/api/auth/forgot-password', { email }), 202);
    const token = await mailCode(email, 'reset-password');
    status(await legitimate.send('post', '/api/auth/reset-password', { token, newPassword }), 200);
    status(await attacker.send('post', '/api/auth/login', { email, password }), 401);
    status(await legitimate.send('post', '/api/auth/login', { email, password: newPassword }), 200);
    status(await attacker.send('post', '/api/auth/verify-email', { token: verify, password }), 400);
  });
  it('rotates sessions and CSRF on login and reauthentication and exposes no digests', async () => {
    const user = await account();
    const old = user.client.cookie;
    const oldCsrf = user.client.csrf;
    status(await user.client.send('post', '/api/auth/reauthenticate', { password }), 200);
    expect(user.client.cookie === old).toBe(false);
    expect(user.client.csrf === oldCsrf).toBe(false);
    status(await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', old), 401);
    const sessions = await user.client.get('/api/auth/sessions');
    status(sessions, 200);
    expect(JSON.stringify(sessions.body)).not.toMatch(/tokenDigest|csrfSecret|passwordHash/);
    const me = await user.client.get('/api/auth/me');
    expect(Object.keys(me.body.account).sort()).toEqual([
      'displayName',
      'email',
      'id',
      'verifiedAt',
    ]);
    expect(me.headers['cache-control']).toBe('no-store');
  });
  it('enforces idle expiry before TTL deletion', async () => {
    const user = await account();
    const raw = user.client.cookie.split('=')[1]!;
    await identities.sessions.updateOne(
      { tokenDigest: digest(raw) },
      { $set: { idleExpiresAt: new Date(Date.now() - 1000) } },
    );
    status(await user.client.get('/api/auth/me'), 401);
    expect(await identities.sessions.countDocuments({ tokenDigest: digest(raw) })).toBe(1);
  });
  it('supersedes reset tokens and commits a concurrent reset only once', async () => {
    const user = await account();
    const a = new Client(),
      b = new Client();
    await a.bootstrap();
    await b.bootstrap();
    status(await a.send('post', '/api/auth/forgot-password', { email: user.email }), 202);
    const old = await mailCode(user.email, 'reset-password');
    status(await a.send('post', '/api/auth/forgot-password', { email: user.email }), 202);
    const token = await mailCode(user.email, 'reset-password');
    status(await b.send('post', '/api/auth/reset-password', { token: old, newPassword }), 400);
    const results = await Promise.all([
      a.send('post', '/api/auth/reset-password', { token, newPassword }),
      b.send('post', '/api/auth/reset-password', { token, newPassword }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    status(await user.client.get('/api/auth/me'), 401);
    status(
      await b.send('post', '/api/auth/login', { email: user.email, password: newPassword }),
      200,
    );
  });
  it('rejects expired reset tokens before TTL cleanup', async () => {
    const user = await account();
    const browser = new Client();
    await browser.bootstrap();
    status(await browser.send('post', '/api/auth/forgot-password', { email: user.email }), 202);
    const token = await mailCode(user.email, 'reset-password');
    await identities.tokens.updateOne(
      { tokenDigest: digest(token) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    status(await browser.send('post', '/api/auth/reset-password', { token, newPassword }), 400);
    expect(await identities.tokens.countDocuments({ tokenDigest: digest(token) })).toBe(1);
  });
  it('invalidates all sessions on logout-all and password change', async () => {
    const user = await account();
    const other = new Client();
    await other.bootstrap();
    status(await other.send('post', '/api/auth/login', { email: user.email, password }), 200);
    status(await user.client.send('post', '/api/auth/logout-all'), 200);
    status(await other.get('/api/auth/me'), 401);
    await user.client.bootstrap();
    status(await user.client.send('post', '/api/auth/login', { email: user.email, password }), 200);
    status(
      await user.client.send('post', '/api/auth/change-password', {
        currentPassword: password,
        newPassword,
      }),
      200,
    );
    status(await user.client.get('/api/auth/me'), 401);
    await other.bootstrap();
    status(await other.send('post', '/api/auth/login', { email: user.email, password }), 401);
    status(
      await other.send('post', '/api/auth/login', { email: user.email, password: newPassword }),
      200,
    );
  });
  it('rate limits shared scopes without permanent account status changes', async () => {
    const abuse = app.get(AbuseService);
    await abuse.consume('bounded-test', 'same-key', 2, 60000);
    await abuse.consume('bounded-test', 'same-key', 2, 60000);
    await expect(abuse.consume('bounded-test', 'same-key', 2, 60000)).rejects.toMatchObject({
      status: 429,
    });
  });
});

describe('company roles and isolation', () => {
  it('matches strict public contracts on real account, tenant, invitation and session responses', async () => {
    const owner = await account();
    const created = await owner.client.send('post', '/api/workspaces', {
      name: 'Contract Company',
      slug: `contract-${randomUUID()}`,
    });
    status(created, 201);
    const id = workspaceResponseSchema.parse(created.body).workspace.id;
    const me = await owner.client.get('/api/auth/me');
    status(me, 200);
    accountResponseSchema.parse(me.body);
    const list = await owner.client.get('/api/workspaces');
    status(list, 200);
    workspacesResponseSchema.parse(list.body);
    const detail = await owner.client.get(`/api/workspaces/${id}`);
    status(detail, 200);
    workspaceResponseSchema.parse(detail.body);
    const members = await owner.client.get(`/api/workspaces/${id}/members`);
    status(members, 200);
    membersResponseSchema.parse(members.body);
    const invited = await owner.client.send('post', `/api/workspaces/${id}/invitations`, {
      email: 'contract-recipient@example.com',
    });
    status(invited, 201);
    invitationResponseSchema.parse(invited.body);
    const invitations = await owner.client.get(`/api/workspaces/${id}/invitations`);
    status(invitations, 200);
    invitationsResponseSchema.parse(invitations.body);
    const sessions = await owner.client.get('/api/auth/sessions');
    status(sessions, 200);
    sessionsResponseSchema.parse(sessions.body);
    const extended = await owner.client.send('post', '/api/auth/session/extend');
    status(extended, 200);
    extendSessionResponseSchema.parse(extended.body);
  });

  it('creates one owner and an office record atomically and reconciles idempotent retries', async () => {
    const owner = await account();
    const key = randomUUID();
    const body = { name: 'Idempotent Company', slug: `company-${randomUUID()}` };
    const first = await owner.client.send('post', '/api/workspaces', body, key);
    status(first, 201);
    const again = await owner.client.send('post', '/api/workspaces', body, key);
    status(again, 201);
    expect(again.body.workspace.id).toBe(first.body.workspace.id);
    expect(
      await tenancy.memberships.countDocuments({
        workspaceId: first.body.workspace.id,
        role: 'owner',
        status: 'active',
      }),
    ).toBe(1);
    expect(await tenancy.offices.countDocuments({ workspaceId: first.body.workspace.id })).toBe(1);
    const user = await identities.users.findById(owner.id).lean();
    expect(user?.ownedWorkspaceCount).toBe(1);
    status(
      await owner.client.send('post', '/api/workspaces', { ...body, name: 'Changed request' }, key),
      409,
    );
  });
  it('enforces ownership quota under concurrent creation', async () => {
    const owner = await account();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        owner.client.send('post', '/api/workspaces', {
          name: 'Quota Company',
          slug: `company-${randomUUID()}`,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await tenancy.workspaces.countDocuments({ ownerId: owner.id })).toBe(3);
    expect((await identities.users.findById(owner.id).lean())?.ownedWorkspaceCount).toBe(3);
  });
  it('binds invitations to recipients and prevents cross-company/member role escalation', async () => {
    const owner = await account(),
      member = await account(),
      stranger = await account();
    const id = await workspace(owner);
    const invitation = await invite(owner, id, member);
    status(
      await stranger.client.send('post', '/api/invitations/accept', { token: invitation.token }),
      400,
    );
    status(
      await member.client.send('post', '/api/invitations/accept', { token: invitation.token }),
      200,
    );
    status(
      await member.client.send('post', `/api/workspaces/${id}/invitations`, {
        email: stranger.email,
      }),
      403,
    );
    status(await stranger.client.get(`/api/workspaces/${id}`), 403);
    status(await member.client.get(`/api/workspaces/${id}/members`), 200);
    const otherId = await workspace(member);
    status(await member.client.get(`/api/workspaces/${otherId}/invitations`), 200);
    status(await member.client.get(`/api/workspaces/${id}/invitations`), 403);
    const list = await member.client.get('/api/workspaces');
    expect(list.body.workspaces.map((w: { role: string }) => w.role).sort()).toEqual([
      'member',
      'owner',
    ]);
  });
  it('accepts the same invitation concurrently without double-counting membership', async () => {
    const owner = await account(),
      member = await account();
    const id = await workspace(owner);
    const invitation = await invite(owner, id, member);
    const responses = await Promise.all([
      member.client.send('post', '/api/invitations/accept', { token: invitation.token }),
      member.client.send('post', '/api/invitations/accept', { token: invitation.token }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect((await tenancy.workspaces.findById(id).lean())?.memberCount).toBe(2);
    expect(
      await tenancy.memberships.countDocuments({
        workspaceId: id,
        userId: member.id,
        status: 'active',
      }),
    ).toBe(1);
  });
  it('revokes pending invitations and rejects expired invitations explicitly', async () => {
    const owner = await account(),
      member = await account();
    const id = await workspace(owner);
    const invitation = await invite(owner, id, member);
    status(
      await owner.client.send('delete', `/api/workspaces/${id}/invitations/${invitation.id}`),
      200,
    );
    status(
      await member.client.send('post', '/api/invitations/accept', { token: invitation.token }),
      400,
    );
    const next = await invite(owner, id, member);
    await tenancy.invitations.updateOne(
      { _id: next.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    status(await member.client.send('post', '/api/invitations/accept', { token: next.token }), 400);
  });
  it('atomically transfers ownership, removes old owner privileges and prevents stale policy writes', async () => {
    const owner = await account(),
      member = await account();
    const id = await workspace(owner);
    await join(owner, id, member);
    const session = app.get(SessionService);
    const stale = actor(await session.load(owner.client.cookie.split('=')[1]));
    status(
      await owner.client.send('post', `/api/workspaces/${id}/transfer-ownership`, {
        userId: member.id,
      }),
      200,
    );
    status(
      await owner.client.send('post', `/api/workspaces/${id}/invitations`, {
        email: 'new@example.com',
      }),
      403,
    );
    await expect(
      app.get(TenancyService).invite(stale, id, 'stale@example.com', randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    expect((await tenancy.workspaces.findById(id).lean())?.ownerId).toBe(member.id);
    expect(
      await tenancy.memberships.countDocuments({
        workspaceId: id,
        role: 'owner',
        status: 'active',
      }),
    ).toBe(1);
    expect((await identities.users.findById(owner.id).lean())?.ownedWorkspaceCount).toBe(0);
    expect((await identities.users.findById(member.id).lean())?.ownedWorkspaceCount).toBe(1);
  });
  it('serializes competing owner transfers and requires recent password proof', async () => {
    const owner = await account(),
      a = await account(),
      b = await account();
    const id = await workspace(owner);
    await join(owner, id, a);
    await join(owner, id, b);
    const raw = owner.client.cookie.split('=')[1]!;
    await identities.sessions.updateOne(
      { tokenDigest: digest(raw) },
      { $set: { reauthenticatedAt: new Date(Date.now() - 11 * 60000) } },
    );
    status(
      await owner.client.send('post', `/api/workspaces/${id}/transfer-ownership`, { userId: a.id }),
      403,
    );
    status(await owner.client.send('post', '/api/auth/reauthenticate', { password }), 200);
    const results = await Promise.all([
      owner.client.send('post', `/api/workspaces/${id}/transfer-ownership`, { userId: a.id }),
      owner.client.send('post', `/api/workspaces/${id}/transfer-ownership`, { userId: b.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
    expect(
      await tenancy.memberships.countDocuments({
        workspaceId: id,
        role: 'owner',
        status: 'active',
      }),
    ).toBe(1);
  });
  it('removes a member without changing independent company membership and blocks owner removal', async () => {
    const owner = await account(),
      member = await account();
    const id = await workspace(owner);
    await join(owner, id, member);
    const independent = await workspace(member);
    status(await owner.client.send('delete', `/api/workspaces/${id}/members/${owner.id}`), 409);
    status(await owner.client.send('delete', `/api/workspaces/${id}/members/${member.id}`), 200);
    status(await member.client.get(`/api/workspaces/${id}`), 403);
    status(await member.client.get(`/api/workspaces/${independent}`), 200);
    expect((await tenancy.workspaces.findById(id).lean())?.memberCount).toBe(1);
  });
  it('enforces the final membership slot under concurrent invitation acceptance', async () => {
    const owner = await account(),
      a = await account(),
      b = await account();
    const id = await workspace(owner);
    const now = new Date();
    const fillers = Array.from({ length: 28 }, () => ({
      _id: randomUUID(),
      normalizedEmail: `filler-${randomUUID()}@example.com`,
      displayName: 'Fixture Member',
      status: 'active' as const,
      verifiedAt: now,
      authVersion: 0,
      policyVersion: 0,
      ownedWorkspaceCount: 0,
      createdAt: now,
    }));
    await identities.users.insertMany(fillers);
    await tenancy.memberships.insertMany(
      fillers.map((user) => ({
        _id: randomUUID(),
        workspaceId: id,
        userId: user._id,
        role: 'member',
        status: 'active',
        policyVersion: 0,
        joinedAt: now,
      })),
    );
    await tenancy.workspaces.updateOne({ _id: id }, { $set: { memberCount: 29 } });
    const ia = await invite(owner, id, a),
      ib = await invite(owner, id, b);
    const results = await Promise.all([
      a.client.send('post', '/api/invitations/accept', { token: ia.token }),
      b.client.send('post', '/api/invitations/accept', { token: ib.token }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await tenancy.workspaces.findById(id).lean())?.memberCount).toBe(30);
    expect(await tenancy.memberships.countDocuments({ workspaceId: id, status: 'active' })).toBe(
      30,
    );
  });
});

describe('credential concurrency and durable mail', () => {
  it('cannot issue access using a password verified before a committed reset', async () => {
    const user = await account();
    const loginBrowser = new Client(),
      resetBrowser = new Client();
    await loginBrowser.bootstrap();
    await resetBrowser.bootstrap();
    status(
      await resetBrowser.send('post', '/api/auth/forgot-password', { email: user.email }),
      202,
    );
    const token = await mailCode(user.email, 'reset-password');
    const passwords = app.get(PasswordService);
    const original = passwords.verify.bind(passwords);
    let reached: () => void = () => {};
    let release: () => void = () => {};
    const checked = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(passwords, 'verify').mockImplementation(async (hash, value) => {
      const valid = await original(hash, value);
      reached();
      await hold;
      return valid;
    });
    try {
      const pending = loginBrowser.send('post', '/api/auth/login', { email: user.email, password });
      await checked;
      status(
        await resetBrowser.send('post', '/api/auth/reset-password', { token, newPassword }),
        200,
      );
      release();
      status(await pending, 401);
    } finally {
      release();
      spy.mockRestore();
    }
  });
  it('rolls account/credential/token creation back when the transactional outbox fails', async () => {
    const browser = new Client();
    await browser.bootstrap();
    const email = `rollback-${randomUUID()}@example.com`;
    const before = await identities.credentials.countDocuments();
    const spy = vi
      .spyOn(outbox, 'create')
      .mockRejectedValueOnce(new Error('injected-outbox-failure'));
    try {
      status(
        await browser.send('post', '/api/auth/register', {
          email,
          password,
          displayName: 'Rollback Test',
        }),
        503,
      );
    } finally {
      spy.mockRestore();
    }
    expect(await identities.users.countDocuments({ normalizedEmail: email })).toBe(0);
    expect(await identities.credentials.countDocuments()).toBe(before);
  });
  it('queues record IDs only and purges the encrypted payload after delivery', async () => {
    const browser = new Client();
    await browser.bootstrap();
    const email = `delivery-${randomUUID()}@example.com`;
    status(
      await browser.send('post', '/api/auth/register', {
        email,
        password,
        displayName: 'Delivery Test',
      }),
      202,
    );
    const user = await identities.users.findOne({ normalizedEmail: email }).lean();
    if (!user) throw new Error('Account missing');
    const record = await outbox.model
      .findOne({ subjectId: user._id, kind: 'verify-email', state: 'pending' })
      .lean();
    if (!record) throw new Error('Outbox missing');
    const add = vi.fn(async (name: string, payload: { outboxEventId: string }) => ({
      name,
      payload,
    }));
    const queue = { getJob: vi.fn(async () => undefined), add } as unknown as Queue;
    await dispatchOutbox(outbox.model, queue);
    const call = add.mock.calls.find((args) => args[1]?.outboxEventId === record._id);
    expect(call).toBeDefined();
    expect(Object.keys(call![1])).toEqual(['outboxEventId']);
    const send = vi.fn(async () => {});
    await deliverOutbox(record._id, outbox.model, encryption, send);
    await deliverOutbox(record._id, outbox.model, encryption, send);
    expect(send).toHaveBeenCalledTimes(1);
    const after = await outbox.model.findById(record._id).select('+payload').lean();
    expect(after?.state).toBe('delivered');
    expect(after?.payload).toBeNull();
  });
  it('discards expired delivery without contacting the mail provider', async () => {
    const browser = new Client();
    await browser.bootstrap();
    const email = `expired-mail-${randomUUID()}@example.com`;
    status(
      await browser.send('post', '/api/auth/register', {
        email,
        password,
        displayName: 'Expiry Test',
      }),
      202,
    );
    const user = await identities.users.findOne({ normalizedEmail: email }).lean();
    if (!user) throw new Error('Account missing');
    const record = await outbox.model
      .findOne({ subjectId: user._id, kind: 'verify-email', state: 'pending' })
      .lean();
    if (!record) throw new Error('Outbox missing');
    await outbox.model.updateOne(
      { _id: record._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const send = vi.fn(async () => {});
    await deliverOutbox(record._id, outbox.model, encryption, send);
    expect(send).not.toHaveBeenCalled();
    expect((await outbox.model.findById(record._id).select('+payload').lean())?.payload).toBeNull();
  });
});

describe('additional session isolation', () => {
  it('revokes only owned sessions and rejects cross-account session ID substitution', async () => {
    const user = await account(),
      other = await account();
    const list = await user.client.get('/api/auth/sessions');
    const sessionId = String(
      list.body.sessions.find((row: { current: boolean }) => row.current).id,
    );
    status(await other.client.send('delete', `/api/auth/sessions/${sessionId}`), 404);
    status(await user.client.send('delete', `/api/auth/sessions/${sessionId}`), 200);
    status(await user.client.get('/api/auth/me'), 401);
    status(await other.client.get('/api/auth/me'), 200);
  });
  it('does not lift suspension when mailbox recovery changes the password', async () => {
    const user = await account();
    await identities.users.updateOne(
      { _id: user.id },
      { $set: { status: 'suspended' }, $inc: { authVersion: 1 } },
    );
    status(await user.client.get('/api/auth/me'), 401);
    const browser = new Client();
    await browser.bootstrap();
    status(await browser.send('post', '/api/auth/forgot-password', { email: user.email }), 202);
    const token = await mailCode(user.email, 'reset-password');
    status(await browser.send('post', '/api/auth/reset-password', { token, newPassword }), 200);
    status(
      await browser.send('post', '/api/auth/login', { email: user.email, password: newPassword }),
      401,
    );
    expect((await identities.users.findById(user.id).lean())?.status).toBe('suspended');
  });
  it('rejects oversized JSON before domain processing', async () => {
    const browser = new Client();
    await browser.bootstrap();
    status(
      await browser.send('post', '/api/auth/register', {
        email: 'large@example.com',
        displayName: 'x'.repeat(5000),
        password,
      }),
      413,
    );
    expect(await identities.users.countDocuments({ normalizedEmail: 'large@example.com' })).toBe(0);
  });
});

describe('database authorization constraints', () => {
  it('rejects a compound unique email index that does not enforce unique account email', async () => {
    const config = app.get(ConfigService);
    const previous = config.get('DB_AUTO_INDEX');
    config.set('DB_AUTO_INDEX', 'false');
    try {
      await identities.users.collection.dropIndex('normalizedEmail_1');
      await identities.users.collection.createIndex(
        { normalizedEmail: 1, status: 1 },
        { unique: true, name: 'incorrect_email_constraint' },
      );
      await expect(app.get(IndexesService).onApplicationBootstrap()).rejects.toThrow(
        'Missing required unique index',
      );
    } finally {
      await identities.users.collection.dropIndex('incorrect_email_constraint');
      await identities.users.createIndexes();
      config.set('DB_AUTO_INDEX', previous);
    }
  });
});
