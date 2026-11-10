import 'reflect-metadata';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IndexesService } from '../dist/platform/database/indexes.service.js';
import { DatabaseService } from '../dist/platform/database/database.service.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import type { Response as HttpResponse } from 'supertest';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { execFile as execFileCallback, spawn, type ChildProcessByStdio } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { promisify } from 'node:util';
import { decryptMail, type MailPayload } from '@gather/delivery';
import commonsManifest from '@gather/assets/manifests/commons-map.json' with { type: 'json' };
import vivoManifest from '@gather/assets/manifests/vivo-map.json' with { type: 'json' };
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
  officeWorkspaceDetailResponseSchema,
  officeBootstrapResponseSchema,
  joinTicketResponseSchema,
  officeReadySchema,
  officeCommandAckSchema,
  worldDeltaSchema,
  worldSnapshotSchema,
  takeoverReferenceResponseSchema,
  OFFICE_LIMITS,
  officeMessageSchema,
  officeMessagesResponseSchema,
  officeChatMessageEventSchema,
  OFFICE_CHAT_RETENTION_DAYS,
  conversationUpdateSchema,
  mediaPolicySnapshotSchema,
  mediaTokenResponseSchema,
} from '@gather/contracts';
import { IdentityModels } from '../dist/modules/identity/identity.models.js';
import { TenancyModels } from '../dist/modules/tenancy/tenancy.models.js';
import { SessionService, actor } from '../dist/modules/identity/sessions/session.service.js';
import { TenancyService } from '../dist/modules/tenancy/tenancy.service.js';
import { OfficeAdmissionService } from '../dist/modules/office/office-admission.service.js';
import { OfficeEpochRegistry } from '../dist/modules/office/office-epoch.registry.js';
import { OfficeJoinTicketModels } from '../dist/modules/office/join-ticket.models.js';
import { ConversationModels } from '../dist/modules/conversations/conversation.models.js';
import { OfficeRuntimeService } from '../dist/modules/office/runtime/office-runtime.service.js';
import { OutboxService } from '../dist/modules/identity/delivery/outbox.service.js';
import { AuditService } from '../dist/modules/audit/audit.service.js';
import { PasswordService } from '../dist/modules/identity/security/password.service.js';
import { deliverOutbox } from '../../worker/dist/processors/delivery.js';
import { dispatchOutbox } from '../../worker/dist/outbox/dispatcher.js';
import type { Queue } from 'bullmq';
import { AbuseService } from '../dist/modules/identity/security/abuse.service.js';
import { digest } from '../dist/modules/identity/security/secrets.js';
import { configureHttp } from '../dist/platform/http/configure.js';
import { backfillOfficeMap } from '../dist/modules/office/backfill-office-map.js';
import { migrateLegacyOfficeMapsToVivo } from '../dist/modules/office/migrate-legacy-office-maps.js';
import { OfficeSocketAdapter } from '../dist/modules/office/realtime/office-socket.adapter.js';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { TokenVerifier } from 'livekit-server-sdk';

const origin = 'https://api.gather.test';
const password = 'a quartz river beneath the lantern';
const newPassword = 'a copper forest beyond the telescope';
const encryption = randomBytes(32);
const mediaMachineKey = randomBytes(32);
const livekitApiKey = 'gather-test-key';
const livekitApiSecret = randomBytes(32).toString('base64url');
const runLiveMediaFixture = process.env['CP08_REAL_MEDIA'] === '1';
const configuredMediaEnd = process.env['CP08_MEDIA_END'] ?? 'leave';
const mediaEndScenario = runLiveMediaFixture
  ? ['opt-out', 'away', 'session-revoke', 'membership-revoke'].includes(configuredMediaEnd)
    ? configuredMediaEnd
    : 'leave'
  : 'leave';
const liveKitFixtureImage =
  'livekit/livekit-server@sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20';
const execFileAsync = promisify(execFileCallback);
let app: NestExpressApplication;
let mongo: MongoMemoryReplSet;
let identities: IdentityModels;
let tenancy: TenancyModels;
let outbox: OutboxService;
let liveMediaGuardPort: number | undefined;

async function unusedLoopbackPort() {
  const server = createServer();
  const port = await listenLoopback(server);
  await closeHttpServer(server);
  return port;
}

async function startViteMediaFixture() {
  const port = await unusedLoopbackPort();
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'development' };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const root = resolve(process.cwd(), '../..');
  const viteCli = resolve(root, 'apps/web/node_modules/vite/bin/vite.js');
  const child = spawn(
    process.execPath,
    [viteCli, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: resolve(root, 'apps/web'), env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let diagnostics = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    diagnostics += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    diagnostics += chunk;
  });
  const url = `http://127.0.0.1:${port}/test/media-fixture.html`;
  try {
    await vi.waitFor(
      async () => {
        if (child.exitCode !== null)
          throw new Error(`Vite media fixture exited: ${diagnostics.slice(-1000)}`);
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        const html = await response.text();
        if (!response.ok || !html.includes('Proximity media integration fixture'))
          throw new Error('Vite media fixture is not ready');
      },
      { timeout: 20000, interval: 100 },
    );
  } catch {
    child.kill('SIGKILL');
    throw new Error('Vite media fixture did not start');
  }
  return {
    url,
    origin: new URL(url).origin,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const stopped = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 2000))]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await stopped;
      }
    },
  };
}

async function startLiveKitFixture() {
  const context = process.env['CP07_DOCKER_CONTEXT'] ?? 'orbstack';
  const docker = async (...args: string[]) => {
    try {
      const result = await execFileAsync('docker', ['--context', context, ...args], {
        timeout: 30000,
        maxBuffer: 65536,
      });
      return result.stdout.trim();
    } catch {
      throw new Error(`LiveKit fixture Docker operation failed: ${args[0]}`);
    }
  };
  const signalingPort = await unusedLoopbackPort();
  const rtcPort = await unusedLoopbackPort();
  const config = `port: 7880\nbind_addresses: [0.0.0.0]\nrtc:\n  tcp_port: ${rtcPort}\n  node_ip: 127.0.0.1\n  use_external_ip: false\nkeys:\n  ${livekitApiKey}: ${livekitApiSecret}\n`;
  const containerId = await docker(
    'run',
    '-d',
    '--restart',
    'no',
    '--label',
    'gather.cp08.fixture=true',
    '-p',
    `127.0.0.1:${signalingPort}:7880`,
    '-p',
    `127.0.0.1:${rtcPort}:${rtcPort}`,
    '-e',
    `LIVEKIT_CONFIG=${config}`,
    liveKitFixtureImage,
  );
  try {
    await vi.waitFor(
      async () => {
        const response = await fetch(`http://127.0.0.1:${signalingPort}`, {
          signal: AbortSignal.timeout(500),
        });
        if (response.status >= 500) throw new Error('LiveKit fixture is not ready');
      },
      { timeout: 20000, interval: 250 },
    );
  } catch {
    await docker('rm', '-f', containerId).catch(() => '');
    throw new Error('Pinned LiveKit fixture did not become ready');
  }
  return {
    containerId,
    signalingPort,
    docker,
    restart: async () => {
      await docker('rm', '-f', containerId);
      return startLiveKitFixture();
    },
    stop: async () => {
      await docker('rm', '-f', containerId).catch(() => '');
    },
  };
}

type ApplicationMediaClient = {
  child: ChildProcessByStdio<Writable, Readable, Readable>;
  messages: Record<string, unknown>[];
  getStderr: () => string;
  send: (message: Record<string, unknown>) => void;
};

function startApplicationMediaClient(config: {
  fixtureUrl: string;
  grants: Array<{
    serverUrl: string;
    token: string;
    conversationVersion: number;
    generation: string;
    identity: string;
  }>;
}): ApplicationMediaClient {
  const root = resolve(process.cwd(), '../..');
  const script = resolve(root, 'spikes/media-enforcement/media-cutoff.mjs');
  const child = spawn(process.execPath, [script, '--application-grant-clients'], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const messages: Record<string, unknown>[] = [];
  let stdoutBuffer = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    let newline = stdoutBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline);
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      try {
        messages.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Ignore non-protocol diagnostics; never print grant-bearing fixture input.
      }
      newline = stdoutBuffer.indexOf('\n');
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.write(JSON.stringify(config) + '\n');
  child.stdin.on('error', () => {});
  return {
    child,
    messages,
    getStderr: () => stderr,
    send: (message) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try {
        child.stdin.write(JSON.stringify(message) + '\n');
      } catch {
        // A completed fixture may already have closed its command pipe.
      }
    },
  };
}

async function waitForApplicationMediaMessage(
  client: ApplicationMediaClient,
  predicate: (message: Record<string, unknown>) => boolean,
  label: string,
) {
  let result: Record<string, unknown> | undefined;
  await vi.waitFor(
    () => {
      if (client.child.exitCode !== null)
        throw new Error(`application media client exited before ${label}: ${client.getStderr()}`);
      result = client.messages.find(predicate);
      if (!result) throw new Error(`application media client has not emitted ${label}`);
    },
    { timeout: 65000, interval: 50 },
  );
  return result!;
}

async function stopApplicationMediaClient(client: ApplicationMediaClient) {
  if (client.child.exitCode !== null || client.child.signalCode !== null) return;
  client.send({ kind: 'stop' });
  const stopped = new Promise<void>((resolve) => client.child.once('exit', () => resolve()));
  await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (client.child.exitCode === null && client.child.signalCode === null) {
    client.child.kill('SIGKILL');
    await stopped;
  }
}

function status(response: HttpResponse, expected: number) {
  expect(response.status, response.body.error?.code).toBe(expected);
  if (response.status >= 400) apiErrorResponseSchema.parse(response.body);
}
function socketOriginUrl() {
  const address = app.getHttpServer().address() as AddressInfo;
  if (!address || typeof address === 'string') throw new Error('Expected a local API address');
  return `http://127.0.0.1:${address.port}/office`;
}
function officeSocket(
  auth: Record<string, unknown>,
  requestOrigin: string | null = origin,
): Socket {
  return io(socketOriginUrl(), {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    timeout: 5000,
    transports: ['websocket'],
    auth,
    ...(requestOrigin === null ? {} : { extraHeaders: { Origin: requestOrigin } }),
  });
}
function connectSocket(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
    socket.connect();
  });
}
function nextSocketEvent<T>(socket: Socket, event: string) {
  return new Promise<T>((resolve, reject) => {
    socket.once(event, (payload: T) => resolve(payload));
    socket.once('connect_error', (error) => reject(error));
  });
}
type GuardOutput = { kind?: string; sequence?: number; epoch?: string };
type ApplicationGuard = {
  child: ChildProcessByStdio<null, Readable, Readable>;
  messages: GuardOutput[];
  getStderr: () => string;
};

function startApplicationGuard(options: {
  apiBaseUrl: string;
  epoch: string;
  host: string;
  port: number;
  retirementDirectory: string;
  sfuUpstream: string;
  origin?: string;
}): ApplicationGuard {
  const root = resolve(process.cwd(), '../..');
  const script = resolve(root, 'spikes/media-enforcement/guard-process.mjs');
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: {
      ...process.env,
      CP07_KEY: livekitApiKey,
      CP07_SECRET: livekitApiSecret,
      CP07_ORIGIN: options.origin ?? origin,
      CP07_RETIREMENTS: options.retirementDirectory,
      CP07_GUARD_EPOCH: options.epoch,
      CP07_APPLICATION_POLICY: '1',
      CP07_POLICY_ENDPOINT: `${options.apiBaseUrl}/api/media/internal/policy/pull`,
      CP07_POLICY_ACK_ENDPOINT: `${options.apiBaseUrl}/api/media/internal/policy/ack`,
      CP07_POLICY_KEY: mediaMachineKey.toString('base64'),
      CP07_GUARD_HOST: options.host,
      CP07_GUARD_PORT: String(options.port),
      CP07_SFU_UPSTREAM: options.sfuUpstream,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const messages: GuardOutput[] = [];
  let stdoutBuffer = '';
  let stderrBuffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    let newline = stdoutBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline);
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      try {
        messages.push(JSON.parse(line) as GuardOutput);
      } catch {
        // Ignore partial/non-protocol diagnostic lines in this test-only harness.
      }
      newline = stdoutBuffer.indexOf('\n');
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderrBuffer += chunk;
  });
  return { child, messages, getStderr: () => stderrBuffer };
}

async function waitForGuardMessage(
  guard: ApplicationGuard,
  predicate: (message: GuardOutput) => boolean,
  label: string,
) {
  let result: GuardOutput | undefined;
  await vi.waitFor(
    () => {
      if (guard.child.exitCode !== null)
        throw new Error(`application guard exited before ${label}: ${guard.getStderr()}`);
      result = guard.messages.find(predicate);
      if (!result) throw new Error(`application guard has not emitted ${label}`);
    },
    { timeout: 5000, interval: 25 },
  );
  return result!;
}

async function stopApplicationGuard(guard: ApplicationGuard) {
  if (guard.child.exitCode !== null || guard.child.signalCode !== null) return;
  const stopped = new Promise<void>((resolve) => guard.child.once('exit', () => resolve()));
  guard.child.kill('SIGTERM');
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  await Promise.race([stopped, timeout]);
  if (guard.child.exitCode === null && guard.child.signalCode === null) {
    guard.child.kill('SIGKILL');
    await stopped;
  }
}

async function listenLoopback(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error('expected loopback server address');
  return address.port;
}

async function closeHttpServer(server: ReturnType<typeof createServer>) {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
class Client {
  cookie = '';
  csrf = '';
  capture(response: HttpResponse) {
    if (response.status < 400) {
      if (response.body.csrfToken) {
        if (response.body.account) authenticatedResponseSchema.parse(response.body);
        else csrfResponseSchema.parse(response.body);
      } else if (typeof response.body.message === 'string')
        messageResponseSchema.parse(response.body);
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
  process.env['MEDIA_MACHINE_KEY'] = mediaMachineKey.toString('base64');
  if (runLiveMediaFixture) {
    liveMediaGuardPort = await unusedLoopbackPort();
    process.env['LIVEKIT_URL'] = `ws://127.0.0.1:${liveMediaGuardPort}`;
  } else {
    process.env['LIVEKIT_URL'] = 'wss://livekit.gather.test';
  }
  process.env['LIVEKIT_API_KEY'] = livekitApiKey;
  process.env['LIVEKIT_API_SECRET'] = livekitApiSecret;
  process.env['MONGOMS_DOWNLOAD_DIR'] = resolve(process.cwd(), '../../.cache/mongodb-binaries');
  mongo = await MongoMemoryReplSet.create({
    binary: { version: '8.2.6' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ args: ['--setParameter', 'ttlMonitorEnabled=false'] }],
  });
  process.env['MONGODB_URI'] = mongo.getUri('gather_auth_tests');
  const { AppModule } = await import('../dist/app.module.js');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    rawBody: true,
    logger: false,
  });
  app.useBodyParser('json', { limit: '4kb' });
  configureHttp(app);
  app.useWebSocketAdapter(new OfficeSocketAdapter(app, origin));
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
    officeWorkspaceDetailResponseSchema.parse(detail.body);
    expect(detail.body.workspace.officeId).toEqual(expect.any(String));
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

  it('scopes office bootstrap to an active workspace member and an approved configured map', async () => {
    const owner = await account();
    const member = await account();
    const stranger = await account();
    const workspaceId = await workspace(owner);
    const otherWorkspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    expect(office).toBeTruthy();
    const officeId = office!._id;
    const otherOffice = await tenancy.offices.findOne({ workspaceId: otherWorkspaceId }).lean();
    const route = `/api/workspaces/${workspaceId}/offices/${officeId}`;
    const approved = vivoManifest.mapVersion;

    const detail = await owner.client.get(`/api/workspaces/${workspaceId}`);
    status(detail, 200);
    expect(officeWorkspaceDetailResponseSchema.parse(detail.body).workspace.officeId).toBe(
      officeId,
    );
    const list = await owner.client.get('/api/workspaces');
    status(list, 200);
    workspacesResponseSchema.parse(list.body);
    const unauthenticated = await request(app.getHttpServer()).get(route);
    status(unauthenticated, 401);
    status(await stranger.client.get(route), 403);
    status(await owner.client.get(`/api/workspaces/${randomUUID()}/offices/${officeId}`), 403);
    status(await owner.client.get(`/api/workspaces/${workspaceId}/offices/${randomUUID()}`), 404);
    status(
      await owner.client.get(`/api/workspaces/${workspaceId}/offices/${otherOffice!._id}`),
      404,
    );
    status(await owner.client.get(`/api/workspaces/not-a-uuid/offices/${officeId}`), 400);
    status(await owner.client.get(`/api/workspaces/${workspaceId}/offices/not-a-uuid`), 400);

    expect(office!.mapVersion).toBe(approved);
    for (const client of [owner.client, member.client]) {
      const response = await client.get(route);
      status(response, 200);
      expect(response.headers['cache-control']).toContain('no-store');
      expect(officeBootstrapResponseSchema.parse(response.body)).toMatchObject({
        officeId,
        workspaceId,
        mapVersion: approved,
        protocolVersion: 1,
        manifest: vivoManifest,
      });
    }

    await tenancy.offices.updateOne({ _id: officeId }, { $set: { mapVersion: 'pending-m0' } });
    const pending = await owner.client.get(route);
    status(pending, 409);
    expect(pending.body.error.code).toBe('office_not_ready');
    await tenancy.offices.updateOne(
      { _id: officeId },
      { $set: { mapVersion: `commons-v1-${'0'.repeat(64)}` } },
    );
    const unknown = await owner.client.get(route);
    status(unknown, 409);
    expect(unknown.body.error.code).toBe('office_not_ready');

    await tenancy.offices.updateOne({ _id: officeId }, { $set: { mapVersion: approved } });
    await tenancy.offices.updateOne(
      { _id: officeId },
      { $set: { mapVersion: commonsManifest.mapVersion } },
    );
    const legacyMap = await owner.client.get(route);
    status(legacyMap, 200);
    expect(officeBootstrapResponseSchema.parse(legacyMap.body)).toMatchObject({
      mapVersion: commonsManifest.mapVersion,
      manifest: commonsManifest,
    });
    await tenancy.offices.updateOne({ _id: officeId }, { $set: { mapVersion: approved } });
    await tenancy.workspaces.updateOne({ _id: workspaceId }, { $set: { status: 'suspended' } });
    status(await owner.client.get(route), 403);
    await tenancy.workspaces.updateOne({ _id: workspaceId }, { $set: { status: 'active' } });
  });

  it('backfills only pending office maps with an explicit repeatable apply flag', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    expect(office?.mapVersion).toBe(vivoManifest.mapVersion);
    const pendingId = randomUUID();
    const configuredId = randomUUID();
    const pendingWorkspaceId = randomUUID();
    const configuredWorkspaceId = randomUUID();
    await tenancy.offices.create([
      {
        _id: pendingId,
        workspaceId: pendingWorkspaceId,
        mapVersion: 'pending-m0',
        createdAt: new Date(),
      },
      {
        _id: configuredId,
        workspaceId: configuredWorkspaceId,
        mapVersion: `commons-v1-${'0'.repeat(64)}`,
        createdAt: new Date(),
      },
    ]);

    expect(await backfillOfficeMap(tenancy.offices)).toEqual({
      pending: 1,
      updated: 0,
      remaining: 1,
    });
    expect((await tenancy.offices.findById(pendingId).lean())?.mapVersion).toBe('pending-m0');
    expect(await backfillOfficeMap(tenancy.offices, true)).toEqual({
      pending: 1,
      updated: 1,
      remaining: 0,
    });
    expect(await backfillOfficeMap(tenancy.offices, true)).toEqual({
      pending: 0,
      updated: 0,
      remaining: 0,
    });

    const backfilled = await tenancy.offices.findById(pendingId).lean();
    const preserved = await tenancy.offices.findById(configuredId).lean();
    expect(backfilled).toMatchObject({
      _id: pendingId,
      workspaceId: pendingWorkspaceId,
      mapVersion: vivoManifest.mapVersion,
    });
    expect(preserved).toMatchObject({
      _id: configuredId,
      workspaceId: configuredWorkspaceId,
      mapVersion: `commons-v1-${'0'.repeat(64)}`,
    });
    expect((await tenancy.offices.findById(office!._id).lean())?.mapVersion).toBe(
      vivoManifest.mapVersion,
    );
  });

  it('migrates only the exact trusted Commons office version to Vivo', async () => {
    const legacyId = randomUUID();
    const legacyWorkspaceId = randomUUID();
    const pendingId = randomUUID();
    const pendingWorkspaceId = randomUUID();
    const unknownId = randomUUID();
    const unknownWorkspaceId = randomUUID();
    const unknownMapVersion = `commons-v1-${'0'.repeat(64)}`;
    await tenancy.offices.create([
      {
        _id: legacyId,
        workspaceId: legacyWorkspaceId,
        mapVersion: commonsManifest.mapVersion,
        createdAt: new Date(),
      },
      {
        _id: pendingId,
        workspaceId: pendingWorkspaceId,
        mapVersion: 'pending-m0',
        createdAt: new Date(),
      },
      {
        _id: unknownId,
        workspaceId: unknownWorkspaceId,
        mapVersion: unknownMapVersion,
        createdAt: new Date(),
      },
    ]);

    const dryRun = await migrateLegacyOfficeMapsToVivo(tenancy.offices);
    expect(dryRun).toEqual({
      fromMapVersions: [commonsManifest.mapVersion],
      toMapVersion: vivoManifest.mapVersion,
      candidates: 1,
      updated: 0,
      remaining: 1,
    });
    expect((await tenancy.offices.findById(legacyId).lean())?.mapVersion).toBe(
      commonsManifest.mapVersion,
    );

    expect(await migrateLegacyOfficeMapsToVivo(tenancy.offices, true)).toEqual({
      fromMapVersions: [commonsManifest.mapVersion],
      toMapVersion: vivoManifest.mapVersion,
      candidates: 1,
      updated: 1,
      remaining: 0,
    });
    expect(await migrateLegacyOfficeMapsToVivo(tenancy.offices, true)).toEqual({
      fromMapVersions: [commonsManifest.mapVersion],
      toMapVersion: vivoManifest.mapVersion,
      candidates: 0,
      updated: 0,
      remaining: 0,
    });
    expect(await tenancy.offices.findById(legacyId).lean()).toMatchObject({
      _id: legacyId,
      workspaceId: legacyWorkspaceId,
      mapVersion: vivoManifest.mapVersion,
    });
    expect((await tenancy.offices.findById(pendingId).lean())?.mapVersion).toBe('pending-m0');
    expect((await tenancy.offices.findById(unknownId).lean())?.mapVersion).toBe(unknownMapVersion);
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

describe('office join tickets', () => {
  it('issues one-use tickets to active owners and members and persists only their digest', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    expect(office).toBeTruthy();
    const admission = app.get(OfficeAdmissionService);
    const models = app.get(OfficeJoinTicketModels);

    for (const user of [owner, member]) {
      if (user === member) {
        await tenancy.memberships.updateOne(
          { workspaceId, userId: member.id },
          { $unset: { membershipGrantId: '' } },
        );
      }
      if (user === owner) {
        const session = await identities.sessions
          .findOne({ userId: owner.id })
          .sort({ createdAt: -1 })
          .lean();
        await identities.sessions.updateOne(
          { _id: session!._id },
          { $set: { idleExpiresAt: new Date(Date.now() + 10_000) } },
        );
      }
      const response = await user.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`,
        { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 },
      );
      status(response, 201);
      const issued = joinTicketResponseSchema.parse(response.body);
      const stored = await models.tickets
        .findOne({ ticketDigest: digest(issued.ticket) })
        .select('+ticketDigest')
        .lean();
      expect(stored).toMatchObject({
        userId: user.id,
        workspaceId,
        officeId: office!._id,
        mapVersion: vivoManifest.mapVersion,
        protocolVersion: 1,
        consumedAt: null,
      });
      expect(stored?.ticketDigest).toBe(digest(issued.ticket));
      if (user === member) {
        const membership = await tenancy.memberships
          .findOne({ workspaceId, userId: member.id })
          .lean();
        expect(stored?.membershipGrantId).toBe(membership!._id);
      }
      expect(JSON.stringify(stored)).not.toContain(issued.ticket);
      const expiresAt = Date.parse(issued.expiresAt);
      expect(expiresAt).toBeGreaterThan(Date.now());
      expect(expiresAt - Date.now()).toBeLessThanOrEqual(30_000);
      const session = await identities.sessions.findOne({ _id: stored!.sessionId }).lean();
      expect(expiresAt).toBeLessThanOrEqual(session!.absoluteExpiresAt.getTime());
      expect(expiresAt).toBeLessThanOrEqual(session!.idleExpiresAt.getTime());
      status(await user.client.get(`/api/workspaces/${workspaceId}`), 200);
      const consumed = await admission.consume(issued.ticket, {
        workspaceId,
        officeId: office!._id,
        mapVersion: vivoManifest.mapVersion,
        protocolVersion: 1,
      });
      expect(consumed).toMatchObject({ userId: user.id, workspaceId, officeId: office!._id });
    }
  });

  it('rejects malformed, stale, cross-office and unready ticket requests before issuance', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const otherWorkspaceId = await workspace(owner);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    const otherOffice = await tenancy.offices.findOne({ workspaceId: otherWorkspaceId }).lean();
    const path = `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`;
    status(await request(app.getHttpServer()).post(path).send({}), 401);
    status(
      await request(app.getHttpServer())
        .post(path)
        .set('Cookie', owner.client.cookie)
        .set('Origin', 'https://evil.test')
        .set('X-CSRF-Token', owner.client.csrf)
        .set('Content-Type', 'application/json')
        .send({ mapVersion: vivoManifest.mapVersion, protocolVersion: 1 }),
      403,
    );
    status(
      await request(app.getHttpServer())
        .post(path)
        .set('Cookie', owner.client.cookie)
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .send({ mapVersion: vivoManifest.mapVersion, protocolVersion: 1 }),
      403,
    );
    status(
      await owner.client.send(
        'post',
        `/api/workspaces/not-a-uuid/offices/${office!._id}/join-ticket`,
        { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 },
      ),
      400,
    );
    status(
      await owner.client.send('post', path, {
        mapVersion: vivoManifest.mapVersion,
        protocolVersion: 2,
      }),
      400,
    );
    status(
      await owner.client.send('post', path, {
        mapVersion: vivoManifest.mapVersion,
        protocolVersion: 1,
        extra: true,
      }),
      400,
    );
    status(
      await owner.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${otherOffice!._id}/join-ticket`,
        { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 },
      ),
      404,
    );
    status(
      await owner.client.send('post', path, {
        mapVersion: `commons-v1-${'0'.repeat(64)}`,
        protocolVersion: 1,
      }),
      409,
    );
    expect(
      (
        await owner.client.send('post', path, {
          mapVersion: `commons-v1-${'0'.repeat(64)}`,
          protocolVersion: 1,
        })
      ).body.error.code,
    ).toBe('map_version_mismatch');

    await tenancy.offices.updateOne({ _id: office!._id }, { $set: { mapVersion: 'pending-m0' } });
    const pending = await owner.client.send('post', path, {
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: 1,
    });
    status(pending, 409);
    expect(pending.body.error.code).toBe('office_not_ready');
    await tenancy.offices.updateOne(
      { _id: office!._id },
      { $set: { mapVersion: vivoManifest.mapVersion } },
    );
  });

  it('enforces actor, authorized workspace and global issue budgets without creating tickets', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    const path = `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`;
    const payload = { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 };
    const fixedNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const currentBucket = Math.floor(fixedNow / OFFICE_LIMITS.ticketWindowMs);
    const seed = async (scope: string, key: string, count: number) => {
      const id = digest(`${scope}:${key}:${currentBucket}`);
      await identities.rateLimits.updateOne(
        { _id: id },
        {
          $set: { count, expiresAt: new Date((currentBucket + 1) * OFFICE_LIMITS.ticketWindowMs) },
        },
        { upsert: true },
      );
      return id;
    };
    try {
      const before = await app.get(OfficeJoinTicketModels).tickets.countDocuments({});
      const actorKey = await seed(
        'office-ticket-actor',
        owner.id,
        OFFICE_LIMITS.ticketsPerActorPerWindow,
      );
      status(await owner.client.send('post', path, payload), 429);
      await identities.rateLimits.deleteOne({ _id: actorKey });
      const workspaceKey = await seed(
        'office-ticket-workspace',
        workspaceId,
        OFFICE_LIMITS.ticketsPerWorkspacePerWindow,
      );
      status(await owner.client.send('post', path, payload), 429);
      await identities.rateLimits.deleteOne({ _id: workspaceKey });
      const globalKey = await seed(
        'office-ticket-global',
        'global',
        OFFICE_LIMITS.ticketsGloballyPerWindow,
      );
      status(await owner.client.send('post', path, payload), 429);
      expect(await app.get(OfficeJoinTicketModels).tickets.countDocuments({})).toBe(before);
      await identities.rateLimits.deleteOne({ _id: globalKey });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('allows exactly one concurrent consume, then rejects replay and expiry before TTL cleanup', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    const response = await owner.client.send(
      'post',
      `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`,
      { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 },
    );
    status(response, 201);
    const raw = joinTicketResponseSchema.parse(response.body).ticket;
    const scope = {
      workspaceId,
      officeId: office!._id,
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: 1,
    };
    const admission = app.get(OfficeAdmissionService);
    await expect(
      admission.consume(raw, { ...scope, mapVersion: `commons-v1-${'0'.repeat(64)}` }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      admission.consume(raw, { ...scope, officeId: randomUUID() }),
    ).rejects.toMatchObject({
      status: 401,
    });
    const results = await Promise.allSettled([
      admission.consume(raw, scope),
      admission.consume(raw, scope),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(admission.consume(raw, scope)).rejects.toMatchObject({ status: 401 });

    const second = await owner.client.send(
      'post',
      `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`,
      { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 },
    );
    const expiring = joinTicketResponseSchema.parse(second.body).ticket;
    const ticketModels = app.get(OfficeJoinTicketModels);
    await ticketModels.tickets.updateOne(
      { ticketDigest: digest(expiring) },
      { $set: { expiresAt: new Date(Date.now() - 1) } },
    );
    await expect(admission.consume(expiring, scope)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects tickets after epoch rotation and membership reactivation', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    const path = `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`;
    const scope = {
      workspaceId,
      officeId: office!._id,
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: 1,
    };
    const admission = app.get(OfficeAdmissionService);
    const issue = async () => {
      const response = await member.client.send('post', path, {
        mapVersion: vivoManifest.mapVersion,
        protocolVersion: 1,
      });
      status(response, 201);
      return joinTicketResponseSchema.parse(response.body).ticket;
    };
    const epochTicket = await issue();
    const restartedAdmission = new OfficeAdmissionService(
      tenancy,
      app.get(TenancyService),
      identities,
      app.get(AbuseService),
      app.get(DatabaseService),
      app.get(OfficeJoinTicketModels),
      new OfficeEpochRegistry(),
      app.get(OfficeRuntimeService),
    );
    await expect(restartedAdmission.consume(epochTicket, scope)).rejects.toMatchObject({
      status: 409,
    });
    app.get(OfficeEpochRegistry).rotate(office!._id);
    await expect(admission.consume(epochTicket, scope)).rejects.toMatchObject({ status: 409 });

    const staleGrantTicket = await issue();
    await owner.client.send('delete', `/api/workspaces/${workspaceId}/members/${member.id}`);
    await join(owner, workspaceId, member);
    await expect(admission.consume(staleGrantTicket, scope)).rejects.toMatchObject({ status: 401 });
  });

  it('rechecks logout, account, workspace and membership policy at consumption', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    const admission = app.get(OfficeAdmissionService);
    const scope = {
      workspaceId,
      officeId: office!._id,
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: 1,
    };
    const issue = async () => {
      const response = await member.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`,
        { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 },
      );
      status(response, 201);
      return joinTicketResponseSchema.parse(response.body).ticket;
    };

    const suspendedAccountTicket = await issue();
    await identities.users.updateOne({ _id: member.id }, { $set: { status: 'suspended' } });
    await expect(admission.consume(suspendedAccountTicket, scope)).rejects.toMatchObject({
      status: 401,
    });
    await identities.users.updateOne({ _id: member.id }, { $set: { status: 'active' } });

    const suspendedWorkspaceTicket = await issue();
    await tenancy.workspaces.updateOne({ _id: workspaceId }, { $set: { status: 'suspended' } });
    await expect(admission.consume(suspendedWorkspaceTicket, scope)).rejects.toMatchObject({
      status: 403,
    });
    await tenancy.workspaces.updateOne({ _id: workspaceId }, { $set: { status: 'active' } });

    const passwordResetTicket = await issue();
    const resetBrowser = new Client();
    await resetBrowser.bootstrap();
    status(
      await resetBrowser.send('post', '/api/auth/forgot-password', { email: member.email }),
      202,
    );
    const resetToken = await mailCode(member.email, 'reset-password');
    status(
      await resetBrowser.send('post', '/api/auth/reset-password', {
        token: resetToken,
        newPassword,
      }),
      200,
    );
    await expect(admission.consume(passwordResetTicket, scope)).rejects.toMatchObject({
      status: 401,
    });

    const ownerTicketResponse = await owner.client.send(
      'post',
      `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`,
      { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 },
    );
    status(ownerTicketResponse, 201);
    const logoutTicket = joinTicketResponseSchema.parse(ownerTicketResponse.body).ticket;
    status(await owner.client.send('post', '/api/auth/logout'), 200);
    await expect(admission.consume(logoutTicket, scope)).rejects.toMatchObject({ status: 401 });
  });

  it('serializes consume against concurrent membership revocation', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    const response = await member.client.send(
      'post',
      `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`,
      { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 },
    );
    status(response, 201);
    const raw = joinTicketResponseSchema.parse(response.body).ticket;
    const admission = app.get(OfficeAdmissionService);
    const scope = {
      workspaceId,
      officeId: office!._id,
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: 1,
    };
    const [consumeResult, revokeResult] = await Promise.allSettled([
      admission.consume(raw, scope),
      owner.client.send('delete', `/api/workspaces/${workspaceId}/members/${member.id}`),
    ]);
    expect(revokeResult.status).toBe('fulfilled');
    if (revokeResult.status === 'fulfilled') status(revokeResult.value, 200);
    if (consumeResult.status === 'rejected') {
      expect(consumeResult.reason).toMatchObject({ status: 403 });
    }
    if (consumeResult.status === 'fulfilled') {
      await expect(admission.consume(raw, scope)).rejects.toMatchObject({ status: 401 });
    } else {
      await expect(admission.consume(raw, scope)).rejects.toMatchObject({ status: 403 });
    }
  });

  it('checks expiry again after current-policy writes and requires exact startup indexes', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    const path = `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`;
    const issued = await owner.client.send('post', path, {
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: 1,
    });
    status(issued, 201);
    const raw = joinTicketResponseSchema.parse(issued.body).ticket;
    const ticketModels = app.get(OfficeJoinTicketModels);
    await ticketModels.tickets.updateOne(
      { ticketDigest: digest(raw) },
      { $set: { expiresAt: new Date(Date.now() + 1000) } },
    );
    const tenancyService = app.get(TenancyService);
    const originalLock = tenancyService.lockAccess.bind(tenancyService);
    let validWhenPolicyLocked = false;
    const lockSpy = vi.spyOn(tenancyService, 'lockAccess').mockImplementation(async (...args) => {
      const result = await originalLock(...args);
      const currentTicket = await ticketModels.tickets
        .findOne({ ticketDigest: digest(raw) })
        .lean();
      validWhenPolicyLocked = Boolean(currentTicket && currentTicket.expiresAt > new Date());
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return result;
    });
    try {
      await expect(
        app.get(OfficeAdmissionService).consume(raw, {
          workspaceId,
          officeId: office!._id,
          mapVersion: vivoManifest.mapVersion,
          protocolVersion: 1,
        }),
      ).rejects.toMatchObject({ status: 401 });
      expect(validWhenPolicyLocked).toBe(true);
    } finally {
      lockSpy.mockRestore();
    }

    const config = app.get(ConfigService);
    const previous = config.get('DB_AUTO_INDEX');
    config.set('DB_AUTO_INDEX', 'false');
    const indexService = app.get(IndexesService);
    const indexes = await ticketModels.tickets.collection.indexes();
    const uniqueIndex = indexes.find((index) => index.unique && index.key['ticketDigest'] === 1);
    const ttlIndex = indexes.find(
      (index) => index.expireAfterSeconds === 0 && index.key['expiresAt'] === 1,
    );
    expect(uniqueIndex?.name).toBeTruthy();
    expect(ttlIndex?.name).toBeTruthy();
    try {
      await ticketModels.tickets.collection.dropIndex(uniqueIndex!.name!);
      await ticketModels.tickets.collection.createIndex(
        { ticketDigest: 1, workspaceId: 1 },
        { unique: true, name: 'incorrect_ticket_digest_constraint' },
      );
      await expect(indexService.onApplicationBootstrap()).rejects.toThrow(
        'office ticket digest index',
      );
      await ticketModels.tickets.collection.dropIndex('incorrect_ticket_digest_constraint');
      await ticketModels.createIndexes();
      await ticketModels.tickets.collection.dropIndex(ttlIndex!.name!);
      await expect(indexService.onApplicationBootstrap()).rejects.toThrow(
        'office ticket TTL index',
      );
    } finally {
      await ticketModels.createIndexes();
      config.set('DB_AUTO_INDEX', previous);
    }
  });
});

describe('office socket admission', () => {
  async function issueTicket(user: Awaited<ReturnType<typeof account>>, workspaceId: string) {
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    if (!office) throw new Error('Office missing');
    const response = await user.client.send(
      'post',
      `/api/workspaces/${workspaceId}/offices/${office._id}/join-ticket`,
      { mapVersion: vivoManifest.mapVersion, protocolVersion: 1 },
    );
    status(response, 201);
    return {
      office,
      ticket: joinTicketResponseSchema.parse(response.body).ticket,
    };
  }

  it('admits a valid ticket and emits a safe contract-valid ready snapshot', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { office, ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    const readyEvent = nextSocketEvent<unknown>(client, 'office:ready');
    try {
      await connectSocket(client);
      const ready = officeReadySchema.parse(await readyEvent);
      expect(ready).toMatchObject({ workspaceId, officeId: office._id, protocolVersion: 1 });
      expect(ready.snapshot.participants).toHaveLength(1);
      expect(ready.snapshot.participants[0]).toMatchObject({
        displayName: 'Test Person',
        appearance: { bodyId: 'commons-worker', paletteId: 'teal' },
        position: vivoManifest.spawn,
        seatId: null,
      });
      expect(ready.snapshot.seats.length).toBeGreaterThan(0);
      expect(ready.snapshot.seats.every((seat) => seat.occupantParticipationId === null)).toBe(
        true,
      );
      expect(Object.keys(ready.snapshot.participants[0]!)).not.toContain('userId');
      expect(Object.keys(ready.snapshot.participants[0]!)).not.toContain('sessionId');
    } finally {
      client.disconnect();
    }
  });

  it('stores office messages for 90 days, deduplicates retries, scopes history, and broadcasts to admitted members', async () => {
    const owner = await account();
    const member = await account();
    const outsider = await account();
    const workspaceId = await workspace(owner);
    const outsiderWorkspaceId = await workspace(outsider);
    await join(owner, workspaceId, member);
    const { office, ticket: ownerTicket } = await issueTicket(owner, workspaceId);
    const { ticket: memberTicket } = await issueTicket(member, workspaceId);
    const ownerSocket = officeSocket({ ticket: ownerTicket, protocolVersion: 1 });
    const memberSocket = officeSocket({ ticket: memberTicket, protocolVersion: 1 });
    const messageId = randomUUID();
    const body = { clientMessageId: messageId, text: 'Hello from the office' };
    try {
      const ownerReady = nextSocketEvent<unknown>(ownerSocket, 'office:ready');
      await connectSocket(ownerSocket);
      await ownerReady;
      const memberReady = nextSocketEvent<unknown>(memberSocket, 'office:ready');
      await connectSocket(memberSocket);
      await memberReady;

      const broadcast = nextSocketEvent<unknown>(memberSocket, 'chat:message');
      const sent = await owner.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${office._id}/messages`,
        body,
        messageId,
      );
      status(sent, 201);
      const message = officeMessageSchema.parse(sent.body.message);
      expect(message).toMatchObject({
        senderId: owner.id,
        senderName: 'Test Person',
        text: body.text,
      });
      expect(officeChatMessageEventSchema.parse(await broadcast)).toEqual(message);

      const stored = await app.get(ConversationModels).messages.findById(message.id).lean();
      expect(stored).toBeDefined();
      expect(stored!.expiresAt.getTime() - stored!.createdAt.getTime()).toBe(
        OFFICE_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      const expiredAt = new Date(Date.now() - 1000);
      await app.get(ConversationModels).messages.create({
        _id: randomUUID(),
        workspaceId,
        officeId: office._id,
        senderId: member.id,
        senderName: 'Test Person',
        clientMessageId: randomUUID(),
        text: 'Expired history is filtered before TTL cleanup',
        createdAt: new Date(expiredAt.getTime() - 91 * 24 * 60 * 60 * 1000),
        expiresAt: expiredAt,
      });

      const replay = await owner.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${office._id}/messages`,
        body,
        messageId,
      );
      status(replay, 201);
      expect(replay.body.message).toEqual(message);
      const conflict = await owner.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${office._id}/messages`,
        { ...body, text: 'Changed message with the same retry ID' },
        messageId,
      );
      status(conflict, 409);

      const history = await member.client.get(
        `/api/workspaces/${workspaceId}/offices/${office._id}/messages`,
      );
      status(history, 200);
      expect(officeMessagesResponseSchema.parse(history.body).messages).toEqual([message]);
      status(
        await outsider.client.get(`/api/workspaces/${workspaceId}/offices/${office._id}/messages`),
        403,
      );
      status(
        await owner.client.get(
          `/api/workspaces/${outsiderWorkspaceId}/offices/${office._id}/messages`,
        ),
        403,
      );
      expect(
        await app
          .get(ConversationModels)
          .messages.countDocuments({ workspaceId, officeId: office._id }),
      ).toBe(2);
    } finally {
      ownerSocket.disconnect();
      memberSocket.disconnect();
    }
  });

  it('moves only by server intent and broadcasts ordered state to another client', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const { ticket: ownerTicket } = await issueTicket(owner, workspaceId);
    const { ticket: memberTicket } = await issueTicket(member, workspaceId);
    const ownerSocket = officeSocket({ ticket: ownerTicket, protocolVersion: 1 });
    const memberSocket = officeSocket({ ticket: memberTicket, protocolVersion: 1 });
    try {
      const ownerReadyEvent = nextSocketEvent<unknown>(ownerSocket, 'office:ready');
      await connectSocket(ownerSocket);
      const ownerReady = officeReadySchema.parse(await ownerReadyEvent);
      const memberReadyEvent = nextSocketEvent<unknown>(memberSocket, 'office:ready');
      await connectSocket(memberSocket);
      const memberReady = officeReadySchema.parse(await memberReadyEvent);
      const ownerStart = ownerReady.snapshot.participants.find(
        (participant) => participant.participationId === ownerReady.participationId,
      )!.position;
      const movementDeltaEvent = nextSocketEvent<Record<string, unknown>>(
        memberSocket,
        'world:delta',
      );
      const input = {
        eventId: randomUUID(),
        officeEpoch: ownerReady.snapshot.officeEpoch,
        payload: { sequence: 1, dx: 1, dy: 0 },
      };
      const ack = await new Promise<unknown>((resolve) => {
        ownerSocket.emit('world:input', input, resolve);
      });
      expect(officeCommandAckSchema.parse(ack)).toEqual({ eventId: input.eventId, ok: true });
      const delta = await movementDeltaEvent;
      const moved = worldDeltaSchema
        .parse(delta)
        .participants.find(
          (participant) => participant.participationId === ownerReady.participationId,
        );
      expect(moved?.position.x).toBeGreaterThan(ownerStart.x);
      expect(moved?.position.y).toBe(ownerStart.y);
      expect(moved?.lastProcessedInputSequence).toBe(1);
      expect(memberReady.snapshot.participants).toHaveLength(2);

      const staleSequence = { ...input, eventId: randomUUID() };
      const staleAck = await new Promise<unknown>((resolve) => {
        ownerSocket.emit('world:input', staleSequence, resolve);
      });
      expect(officeCommandAckSchema.parse(staleAck)).toMatchObject({
        eventId: staleSequence.eventId,
        ok: false,
        error: { code: 'stale_version' },
      });

      const staleEpoch = {
        ...input,
        eventId: randomUUID(),
        officeEpoch: randomUUID(),
        payload: { sequence: 2, dx: 1, dy: 0 },
      };
      const epochAck = await new Promise<unknown>((resolve) => {
        ownerSocket.emit('world:input', staleEpoch, resolve);
      });
      expect(officeCommandAckSchema.parse(epochAck)).toMatchObject({
        eventId: staleEpoch.eventId,
        ok: false,
        error: { code: 'stale_epoch' },
      });

      for (let sequence = 2; sequence <= 28; sequence += 1) {
        const repeatedInput = {
          eventId: randomUUID(),
          officeEpoch: ownerReady.snapshot.officeEpoch,
          payload: { sequence, dx: 1, dy: 0 },
        };
        const repeatedAck = await new Promise<unknown>((resolve) => {
          ownerSocket.emit('world:input', repeatedInput, resolve);
        });
        expect(officeCommandAckSchema.parse(repeatedAck)).toMatchObject({
          eventId: repeatedInput.eventId,
          ok: true,
        });
      }
      const floodedInput = {
        eventId: randomUUID(),
        officeEpoch: ownerReady.snapshot.officeEpoch,
        payload: { sequence: 29, dx: 1, dy: 0 },
      };
      const floodedAck = await new Promise<unknown>((resolve) => {
        ownerSocket.emit('world:input', floodedInput, resolve);
      });
      expect(officeCommandAckSchema.parse(floodedAck)).toMatchObject({
        eventId: floodedInput.eventId,
        ok: false,
        error: { code: 'rate_limited' },
      });
    } finally {
      ownerSocket.disconnect();
      memberSocket.disconnect();
    }
  });

  it('applies presence and seat commands through the live socket protocol', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    try {
      const readyEvent = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      const ready = officeReadySchema.parse(await readyEvent);

      const presenceDeltaEvent = nextSocketEvent<unknown>(client, 'world:delta');
      const presence = {
        eventId: randomUUID(),
        officeEpoch: ready.snapshot.officeEpoch,
        payload: { availability: 'away' },
      };
      const presenceAck = await new Promise<unknown>((resolve) => {
        client.emit('presence:update', presence, resolve);
      });
      expect(officeCommandAckSchema.parse(presenceAck)).toEqual({
        eventId: presence.eventId,
        ok: true,
      });
      expect(worldDeltaSchema.parse(await presenceDeltaEvent)).toMatchObject({
        baseVersion: ready.snapshot.stateVersion,
        participants: [{ participationId: ready.participationId, availability: 'away' }],
      });

      const invalidSeat = {
        eventId: randomUUID(),
        officeEpoch: ready.snapshot.officeEpoch,
        payload: { seatId: 'commons-seat-that-does-not-exist' },
      };
      const sitAck = await new Promise<unknown>((resolve) => {
        client.emit('seat:sit', invalidSeat, resolve);
      });
      expect(officeCommandAckSchema.parse(sitAck)).toMatchObject({
        eventId: invalidSeat.eventId,
        ok: false,
        error: { code: 'seat_unavailable' },
      });

      const stand = {
        eventId: randomUUID(),
        officeEpoch: ready.snapshot.officeEpoch,
        payload: {},
      };
      const standAck = await new Promise<unknown>((resolve) => {
        client.emit('seat:stand', stand, resolve);
      });
      expect(officeCommandAckSchema.parse(standAck)).toMatchObject({
        eventId: stand.eventId,
        ok: false,
        error: { code: 'seat_unavailable' },
      });
    } finally {
      client.disconnect();
    }
  });

  it(
    `keeps proximity conversation state private and ends it on ${mediaEndScenario}`,
    async () => {
      const owner = await account();
      const first = await account();
      const second = await account();
      const observer = await account();
      const workspaceId = await workspace(owner);
      await join(owner, workspaceId, first);
      await join(owner, workspaceId, second);
      await join(owner, workspaceId, observer);

      const [{ ticket: firstTicket }, { ticket: secondTicket }, { ticket: observerTicket }] =
        await Promise.all([
          issueTicket(first, workspaceId),
          issueTicket(second, workspaceId),
          issueTicket(observer, workspaceId),
        ]);
      const firstSocket = officeSocket({ ticket: firstTicket, protocolVersion: 1 });
      const secondSocket = officeSocket({ ticket: secondTicket, protocolVersion: 1 });
      const observerSocket = officeSocket({ ticket: observerTicket, protocolVersion: 1 });
      const observerNotices: unknown[] = [];
      let applicationGuard: ApplicationGuard | undefined;
      let mediaUpstream: ReturnType<typeof createServer> | undefined;
      let mediaFixture: Awaited<ReturnType<typeof startViteMediaFixture>> | undefined;
      let liveKitFixture: Awaited<ReturnType<typeof startLiveKitFixture>> | undefined;
      let applicationMediaClient: ApplicationMediaClient | undefined;
      let retirementDirectory: string | undefined;
      const forwardedSignalingPaths: string[] = [];
      observerSocket.on('conversation:update', (notice: unknown) => observerNotices.push(notice));

      try {
        const firstReadyEvent = nextSocketEvent<unknown>(firstSocket, 'office:ready');
        await connectSocket(firstSocket);
        const firstReady = officeReadySchema.parse(await firstReadyEvent);
        const secondReadyEvent = nextSocketEvent<unknown>(secondSocket, 'office:ready');
        await connectSocket(secondSocket);
        const secondReady = officeReadySchema.parse(await secondReadyEvent);
        const observerReadyEvent = nextSocketEvent<unknown>(observerSocket, 'office:ready');
        await connectSocket(observerSocket);
        await observerReadyEvent;

        const firstParticipant = firstReady.snapshot.participants.find(
          (participant) => participant.participationId === firstReady.participationId,
        )!;
        const secondParticipant = secondReady.snapshot.participants.find(
          (participant) => participant.participationId === secondReady.participationId,
        )!;
        expect(
          Math.hypot(
            firstParticipant.position.x - secondParticipant.position.x,
            firstParticipant.position.y - secondParticipant.position.y,
          ) / 32,
        ).toBeLessThanOrEqual(2);

        const firstJoinNotice = nextSocketEvent<unknown>(firstSocket, 'conversation:update');
        const secondJoinNotice = nextSocketEvent<unknown>(secondSocket, 'conversation:update');
        const firstOptIn = {
          eventId: randomUUID(),
          officeEpoch: firstReady.snapshot.officeEpoch,
          payload: { enabled: true },
        };
        const firstOptInAck = await new Promise<unknown>((resolve) => {
          firstSocket.emit('proximity:set-opt-in', firstOptIn, resolve);
        });
        expect(officeCommandAckSchema.parse(firstOptInAck)).toEqual({
          eventId: firstOptIn.eventId,
          ok: true,
        });

        const secondOptIn = {
          eventId: randomUUID(),
          officeEpoch: secondReady.snapshot.officeEpoch,
          payload: { enabled: true },
        };
        const secondOptInAck = await new Promise<unknown>((resolve) => {
          secondSocket.emit('proximity:set-opt-in', secondOptIn, resolve);
        });
        expect(officeCommandAckSchema.parse(secondOptInAck)).toEqual({
          eventId: secondOptIn.eventId,
          ok: true,
        });
        const joining = conversationUpdateSchema.parse(await firstJoinNotice);
        expect(conversationUpdateSchema.parse(await secondJoinNotice)).toEqual(joining);
        expect(joining).toMatchObject({
          officeEpoch: firstReady.snapshot.officeEpoch,
          kind: 'proximity',
          state: 'joining',
          version: 1,
          mediaReady: false,
        });
        expect(joining.participants.map(({ participationId }) => participationId).sort()).toEqual(
          [firstReady.participationId, secondReady.participationId].sort(),
        );

        const challenge = {
          epoch: 'a'.repeat(64),
          nonce: randomBytes(32).toString('hex'),
        };
        const pullBody = JSON.stringify(challenge);
        const unsignedPull = await request(app.getHttpServer())
          .post('/api/media/internal/policy/pull')
          .set('Content-Type', 'application/json')
          .send(pullBody);
        status(unsignedPull, 401);

        const alteredPullBody = JSON.stringify({
          ...challenge,
          nonce: randomBytes(32).toString('hex'),
        });
        const alteredPull = await request(app.getHttpServer())
          .post('/api/media/internal/policy/pull')
          .set(
            'X-CP07-Signature',
            createHmac('sha256', mediaMachineKey).update(pullBody).digest('hex'),
          )
          .set('Content-Type', 'application/json')
          .send(alteredPullBody);
        status(alteredPull, 401);

        const signedPull = await request(app.getHttpServer())
          .post('/api/media/internal/policy/pull')
          .set(
            'X-CP07-Signature',
            createHmac('sha256', mediaMachineKey).update(pullBody).digest('hex'),
          )
          .set('Content-Type', 'application/json')
          .send(pullBody);
        status(signedPull, 200);
        const snapshot = mediaPolicySnapshotSchema.parse(JSON.parse(signedPull.text));
        expect(snapshot).toMatchObject({
          epoch: challenge.epoch,
          nonce: challenge.nonce,
          sequence: 1,
        });
        expect(snapshot.permits).toHaveLength(2);
        expect(snapshot.permits.map(({ identity }) => identity).sort()).toEqual(
          [firstReady.participationId, secondReady.participationId].sort(),
        );
        for (const permit of snapshot.permits) {
          expect(permit).toMatchObject({
            generation: joining.generation,
            room: joining.generation,
            version: 1,
            sources: ['microphone'],
          });
        }
        expect(signedPull.headers['x-cp07-signature']).toBe(
          createHmac('sha256', mediaMachineKey).update(signedPull.text).digest('hex'),
        );

        status(
          await first.client.send(
            'post',
            `/api/conversations/${joining.conversationId}/media-token`,
            {
              participationId: firstReady.participationId,
              conversationVersion: joining.version,
            },
          ),
          409,
        );

        const firstActiveNotice = nextSocketEvent<unknown>(firstSocket, 'conversation:update');
        const secondActiveNotice = nextSocketEvent<unknown>(secondSocket, 'conversation:update');
        const acknowledgement = {
          epoch: snapshot.epoch,
          nonce: snapshot.nonce,
          sequence: snapshot.sequence,
        };
        const acknowledgementBody = JSON.stringify(acknowledgement);
        const installed = await request(app.getHttpServer())
          .post('/api/media/internal/policy/ack')
          .set(
            'X-CP07-Signature',
            createHmac('sha256', mediaMachineKey).update(acknowledgementBody).digest('hex'),
          )
          .set('Content-Type', 'application/json')
          .send(acknowledgementBody);
        status(installed, 200);
        expect(installed.body).toEqual({ acknowledged: true, sequence: 1 });
        expect(installed.headers['x-cp07-signature']).toBe(
          createHmac('sha256', mediaMachineKey).update(installed.text).digest('hex'),
        );
        const active = conversationUpdateSchema.parse(await firstActiveNotice);
        expect(conversationUpdateSchema.parse(await secondActiveNotice)).toEqual(active);
        expect(active).toMatchObject({
          conversationId: joining.conversationId,
          generation: joining.generation,
          state: 'active',
          version: 2,
          mediaReady: true,
        });

        const tokenPath = `/api/conversations/${joining.conversationId}/media-token`;
        const issued = await first.client.send('post', tokenPath, {
          participationId: firstReady.participationId,
          conversationVersion: active.version,
        });
        status(issued, 200);
        const mediaGrant = mediaTokenResponseSchema.parse(issued.body);
        expect(issued.headers['cache-control']).toBe('no-store');
        expect(mediaGrant).toMatchObject({
          serverUrl: runLiveMediaFixture
            ? `ws://127.0.0.1:${liveMediaGuardPort}`
            : 'wss://livekit.gather.test',
          conversationVersion: active.version,
          generation: active.generation,
        });
        const tokenClaims = await new TokenVerifier(livekitApiKey, livekitApiSecret).verify(
          mediaGrant.token,
          0,
        );
        expect(tokenClaims.sub).toBe(firstReady.participationId);
        expect(tokenClaims.exp).toBe(Date.parse(mediaGrant.expiresAt) / 1000);
        expect(tokenClaims.video).toMatchObject({
          room: active.generation,
          roomJoin: true,
          roomAdmin: false,
          canPublish: true,
          canPublishSources: ['microphone'],
          canSubscribe: true,
          canPublishData: false,
          canUpdateOwnMetadata: false,
        });
        expect(tokenClaims.video).not.toHaveProperty('roomCreate');
        expect(tokenClaims.video).not.toHaveProperty('roomList');
        expect(tokenClaims.video).not.toHaveProperty('roomRecord');
        const applicationTokenExpiries = [tokenClaims.exp];

        if (runLiveMediaFixture) {
          liveKitFixture = await startLiveKitFixture();
          mediaFixture = await startViteMediaFixture();
        } else {
          mediaUpstream = createServer((incoming, response) => {
            forwardedSignalingPaths.push(
              new URL(incoming.url ?? '/', 'http://upstream.local').pathname,
            );
            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end('{}');
          });
        }
        const upstreamPort =
          liveKitFixture?.signalingPort ?? (await listenLoopback(mediaUpstream!));
        const guardPortProbe = liveMediaGuardPort ? undefined : createServer();
        const guardPort = liveMediaGuardPort ?? (await listenLoopback(guardPortProbe!));
        if (guardPortProbe) await closeHttpServer(guardPortProbe);
        retirementDirectory = await mkdtemp(resolve(tmpdir(), 'gather-cp08-app-guard-'));
        const apiAddress = app.getHttpServer().address() as AddressInfo;
        applicationGuard = startApplicationGuard({
          apiBaseUrl: `http://127.0.0.1:${apiAddress.port}`,
          epoch: challenge.epoch,
          host: '127.0.0.1',
          port: guardPort,
          retirementDirectory,
          sfuUpstream: `http://127.0.0.1:${upstreamPort}`,
          ...(mediaFixture ? { origin: mediaFixture.origin } : {}),
        });
        const firstGuardAck = await waitForGuardMessage(
          applicationGuard,
          (message) => message.kind === 'ack' && message.sequence! > snapshot.sequence,
          'the application-policy installation acknowledgement',
        );
        const tokenValidationUrl = new URL(`http://127.0.0.1:${guardPort}/rtc/v1/validate`);
        tokenValidationUrl.searchParams.set('access_token', mediaGrant.token);
        tokenValidationUrl.searchParams.set(
          'join_request',
          Buffer.from(JSON.stringify({ protocol: 12 })).toString('base64url'),
        );
        const validateThroughGuard = async (stage: string) => {
          try {
            return await fetch(tokenValidationUrl, {
              headers: { Origin: mediaFixture?.origin ?? origin },
            });
          } catch (error) {
            throw new Error(
              `guard validation failed at ${stage} (port=${guardPort}, exit=${applicationGuard?.child.exitCode}, stderr=${applicationGuard?.getStderr().slice(-500) ?? 'stopped'})`,
              { cause: error },
            );
          }
        };
        let secondMediaGrantToken: string | undefined;
        if (runLiveMediaFixture) {
          const secondIssued = await second.client.send('post', tokenPath, {
            participationId: secondReady.participationId,
            conversationVersion: active.version,
          });
          status(secondIssued, 200);
          const secondMediaGrant = mediaTokenResponseSchema.parse(secondIssued.body);
          secondMediaGrantToken = secondMediaGrant.token;
          const secondTokenClaims = await new TokenVerifier(livekitApiKey, livekitApiSecret).verify(
            secondMediaGrant.token,
            0,
          );
          applicationTokenExpiries.push(secondTokenClaims.exp);
          applicationMediaClient = startApplicationMediaClient({
            fixtureUrl: mediaFixture!.url,
            grants: [
              { ...mediaGrant, identity: firstReady.participationId },
              { ...secondMediaGrant, identity: secondReady.participationId },
            ],
          });
          let connected: Record<string, unknown>;
          try {
            connected = await waitForApplicationMediaMessage(
              applicationMediaClient,
              (message) => message['kind'] === 'connected',
              'two real LiveKit audio subscriptions',
            );
          } catch (error) {
            const acknowledgements = applicationGuard.messages
              .filter((message) => message.kind === 'ack')
              .slice(-5)
              .map(({ sequence, epoch }) => ({ sequence, epoch }));
            throw new Error(
              `${error instanceof Error ? error.message : 'media fixture failed'}; guard acknowledgements=${JSON.stringify(acknowledgements)}; guard stderr=${applicationGuard.getStderr().slice(-1000)}`,
              { cause: error },
            );
          }
          const observations = connected['observations'] as Array<{
            status: string;
            remoteIdentities: string[];
            activeAudioSamples: number;
          }>;
          expect(observations).toHaveLength(2);
          expect(observations[0]).toMatchObject({
            status: 'live',
            remoteIdentities: [secondReady.participationId],
          });
          expect(observations[1]).toMatchObject({
            status: 'live',
            remoteIdentities: [firstReady.participationId],
          });
          expect(observations.every(({ activeAudioSamples }) => activeAudioSamples >= 10)).toBe(
            true,
          );
          applicationMediaClient.send({ kind: 'exercise-mute-unmute' });
          const mediaControls = await waitForApplicationMediaMessage(
            applicationMediaClient,
            (message) => message['kind'] === 'media-controls',
            'real mute/unmute audio cutoff and recovery',
          );
          expect(mediaControls['muteStable']).toBe(true);
          expect(mediaControls['resumed']).toBe(true);
          expect(mediaControls['muteCutoffMs']).toEqual(expect.any(Number));
          expect(mediaControls['unmuteObservedMs']).toEqual(expect.any(Number));
          expect(mediaControls['muteCutoffMs'] as number).toBeLessThanOrEqual(8000);
          expect(mediaControls['unmuteObservedMs'] as number).toBeLessThanOrEqual(8000);
          expect(mediaControls['resumedSampleCount'] as number).toBeGreaterThan(
            (mediaControls['mutedSampleCount'] as number) + 5,
          );
          console.info(
            `CP08.5 media controls: ${JSON.stringify({
              muteCutoffMs: mediaControls['muteCutoffMs'],
              mutedSampleCount: mediaControls['mutedSampleCount'],
              unmuteObservedMs: mediaControls['unmuteObservedMs'],
              resumedSampleCount: mediaControls['resumedSampleCount'],
              muteStable: mediaControls['muteStable'],
              resumed: mediaControls['resumed'],
            })}`,
          );
        } else {
          await vi.waitFor(
            async () => {
              const guarded = await validateThroughGuard('current-application-grant');
              if (guarded.status !== 200)
                throw new Error(`current application grant was not forwarded: ${guarded.status}`);
            },
            { timeout: 5000, interval: 50 },
          );
          expect(forwardedSignalingPaths).toContain('/rtc/v1/validate');
        }
        let latestGuardSequence = firstGuardAck.sequence!;

        status(
          await observer.client.send('post', tokenPath, {
            participationId: firstReady.participationId,
            conversationVersion: active.version,
          }),
          404,
        );
        const foreignOwner = await account();
        await workspace(foreignOwner);
        status(
          await foreignOwner.client.send('post', tokenPath, {
            participationId: firstReady.participationId,
            conversationVersion: active.version,
          }),
          404,
        );

        const replayedAck = await request(app.getHttpServer())
          .post('/api/media/internal/policy/ack')
          .set(
            'X-CP07-Signature',
            createHmac('sha256', mediaMachineKey).update(acknowledgementBody).digest('hex'),
          )
          .set('Content-Type', 'application/json')
          .send(acknowledgementBody);
        status(replayedAck, 409);

        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(observerNotices).toEqual([]);

        latestGuardSequence = Math.max(
          ...applicationGuard.messages
            .filter((message) => message.kind === 'ack')
            .map((message) => message.sequence ?? 0),
        );
        const firstEndedEvent = nextSocketEvent<unknown>(firstSocket, 'conversation:update');
        const secondEndedEvent = nextSocketEvent<unknown>(secondSocket, 'conversation:update');
        if (mediaEndScenario === 'opt-out') {
          const optOut = {
            eventId: randomUUID(),
            officeEpoch: firstReady.snapshot.officeEpoch,
            payload: { enabled: false },
          };
          const optOutAck = await new Promise<unknown>((resolve) => {
            firstSocket.emit('proximity:set-opt-in', optOut, resolve);
          });
          expect(officeCommandAckSchema.parse(optOutAck)).toEqual({
            eventId: optOut.eventId,
            ok: true,
          });
        } else if (mediaEndScenario === 'away') {
          const away = {
            eventId: randomUUID(),
            officeEpoch: firstReady.snapshot.officeEpoch,
            payload: { availability: 'away' },
          };
          const awayAck = await new Promise<unknown>((resolve) => {
            firstSocket.emit('presence:update', away, resolve);
          });
          expect(officeCommandAckSchema.parse(awayAck)).toEqual({
            eventId: away.eventId,
            ok: true,
          });
        } else if (mediaEndScenario === 'session-revoke') {
          const firstAccessEndedEvent = nextSocketEvent<Record<string, unknown>>(
            firstSocket,
            'office:access-ended',
          );
          status(await first.client.send('post', '/api/auth/logout'), 200);
          await expect(firstAccessEndedEvent).resolves.toMatchObject({
            reason: 'authorization_ended',
          });
        } else if (mediaEndScenario === 'membership-revoke') {
          const firstAccessEndedEvent = nextSocketEvent<Record<string, unknown>>(
            firstSocket,
            'office:access-ended',
          );
          status(
            await owner.client.send('delete', `/api/workspaces/${workspaceId}/members/${first.id}`),
            200,
          );
          await expect(firstAccessEndedEvent).resolves.toMatchObject({
            reason: 'authorization_ended',
          });
        } else {
          const leave = {
            eventId: randomUUID(),
            officeEpoch: firstReady.snapshot.officeEpoch,
            payload: {
              conversationId: joining.conversationId,
              conversationVersion: active.version,
            },
          };
          const leaveAck = await new Promise<unknown>((resolve) => {
            firstSocket.emit('conversation:leave', leave, resolve);
          });
          expect(officeCommandAckSchema.parse(leaveAck)).toEqual({
            eventId: leave.eventId,
            ok: true,
          });
        }
        const revokedSocket =
          mediaEndScenario === 'session-revoke' || mediaEndScenario === 'membership-revoke';
        const ended = conversationUpdateSchema.parse(
          revokedSocket ? await secondEndedEvent : await firstEndedEvent,
        );
        if (!revokedSocket)
          expect(conversationUpdateSchema.parse(await secondEndedEvent)).toMatchObject({
            conversationId: joining.conversationId,
            state: 'ended',
            version: active.version + 1,
            mediaReady: false,
            participants: [],
          });
        expect(ended).toMatchObject({
          conversationId: joining.conversationId,
          state: 'ended',
          version: active.version + 1,
          mediaReady: false,
          participants: [],
        });
        const endPolicyAck = await waitForGuardMessage(
          applicationGuard,
          (message) => message.kind === 'ack' && message.sequence! > latestGuardSequence,
          'the empty policy snapshot after the pair ended',
        );
        latestGuardSequence = endPolicyAck.sequence!;
        if (runLiveMediaFixture) {
          console.info(
            `CP08.5 policy revocation: ${JSON.stringify({
              trigger: mediaEndScenario,
              emptyPolicyAckSequence: endPolicyAck.sequence,
              guardAlive: applicationGuard.child.exitCode === null,
            })}`,
          );
        }
        if (applicationMediaClient) {
          applicationMediaClient.send({ kind: 'stop' });
          const measured = await waitForApplicationMediaMessage(
            applicationMediaClient,
            (message) => message['kind'] === 'cutoff',
            'the measured real audio cutoff after conversation leave',
          );
          expect(measured['stable']).toBe(true);
          expect(measured['cutoffMs']).toEqual(expect.any(Number));
          expect(measured['cutoffMs'] as number).toBeLessThanOrEqual(8000);
          console.info(
            `CP08.4 media cutoff: ${JSON.stringify({
              cutoffMs: measured['cutoffMs'],
              activeSamples: (
                measured['observations'] as Array<{ activeAudioSamples: number }>
              ).map(({ activeAudioSamples }) => activeAudioSamples),
              stable: measured['stable'],
            })}`,
          );
        }
        const forwardedBeforeDeniedReplay = forwardedSignalingPaths.length;
        expect((await validateThroughGuard('after-policy-revoke')).status).toBe(403);
        expect(forwardedSignalingPaths).toHaveLength(forwardedBeforeDeniedReplay);
        status(
          await first.client.send('post', tokenPath, {
            participationId: firstReady.participationId,
            conversationVersion: active.version,
          }),
          mediaEndScenario === 'session-revoke' ? 401 : 409,
        );
        await new Promise((resolve) => setTimeout(resolve, 80));
        expect(observerNotices).toEqual([]);

        await stopApplicationGuard(applicationGuard);
        applicationGuard = undefined;
        await new Promise((resolve) => setTimeout(resolve, 5100));
        if (liveKitFixture) liveKitFixture = await liveKitFixture.restart();
        const restartedEpoch = randomBytes(32).toString('hex');
        applicationGuard = startApplicationGuard({
          apiBaseUrl: `http://127.0.0.1:${apiAddress.port}`,
          epoch: restartedEpoch,
          host: '127.0.0.1',
          port: guardPort,
          retirementDirectory,
          sfuUpstream: `http://127.0.0.1:${liveKitFixture?.signalingPort ?? upstreamPort}`,
          ...(mediaFixture ? { origin: mediaFixture.origin } : {}),
        });
        await waitForGuardMessage(
          applicationGuard,
          (message) => message.kind === 'ack' && message.sequence === 1,
          'the restarted guard’s fresh-epoch default-deny snapshot',
        );
        expect(
          applicationTokenExpiries.every(
            (expiresAt) => typeof expiresAt === 'number' && expiresAt > Date.now() / 1000,
          ),
        ).toBe(true);
        expect((await validateThroughGuard('after-guard-restart')).status).toBe(403);
        if (secondMediaGrantToken) {
          tokenValidationUrl.searchParams.set('access_token', secondMediaGrantToken);
          expect((await validateThroughGuard('second-token-after-guard-restart')).status).toBe(403);
        }
        expect(forwardedSignalingPaths).toHaveLength(forwardedBeforeDeniedReplay);
      } finally {
        if (applicationMediaClient) await stopApplicationMediaClient(applicationMediaClient);
        if (applicationGuard) await stopApplicationGuard(applicationGuard);
        if (mediaUpstream) await closeHttpServer(mediaUpstream);
        if (mediaFixture) await mediaFixture.stop();
        if (liveKitFixture) await liveKitFixture.stop();
        if (retirementDirectory) await rm(retirementDirectory, { recursive: true, force: true });
        firstSocket.disconnect();
        secondSocket.disconnect();
        observerSocket.disconnect();
      }
    },
    runLiveMediaFixture ? 120000 : undefined,
  );

  it('repairs a missed world delta with a current safe snapshot', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    try {
      const readyEvent = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      const ready = officeReadySchema.parse(await readyEvent);
      const deltaEvent = nextSocketEvent<unknown>(client, 'world:delta');
      const presence = {
        eventId: randomUUID(),
        officeEpoch: ready.snapshot.officeEpoch,
        payload: { availability: 'busy' },
      };
      await new Promise<void>((resolve) => client.emit('presence:update', presence, resolve));
      await deltaEvent;

      const snapshotEvent = nextSocketEvent<unknown>(client, 'world:snapshot');
      const resync = {
        eventId: randomUUID(),
        officeEpoch: ready.snapshot.officeEpoch,
        payload: { stateVersion: ready.snapshot.stateVersion },
      };
      const ack = await new Promise<unknown>((resolve) => {
        client.emit('world:resync', resync, resolve);
      });
      expect(officeCommandAckSchema.parse(ack)).toEqual({ eventId: resync.eventId, ok: true });
      const snapshot = worldSnapshotSchema.parse(await snapshotEvent);
      expect(snapshot.stateVersion).toBe(ready.snapshot.stateVersion + 1);
      expect(snapshot.participants).toContainEqual(
        expect.objectContaining({ participationId: ready.participationId, availability: 'busy' }),
      );

      const impossible = {
        ...resync,
        eventId: randomUUID(),
        payload: { stateVersion: snapshot.stateVersion + 1 },
      };
      const impossibleAck = await new Promise<unknown>((resolve) => {
        client.emit('world:resync', impossible, resolve);
      });
      expect(officeCommandAckSchema.parse(impossibleAck)).toMatchObject({
        eventId: impossible.eventId,
        ok: false,
        error: { code: 'stale_version' },
      });

      const third = { ...resync, eventId: randomUUID() };
      const thirdSnapshotEvent = nextSocketEvent<unknown>(client, 'world:snapshot');
      const thirdAck = await new Promise<unknown>((resolve) => {
        client.emit('world:resync', third, resolve);
      });
      expect(officeCommandAckSchema.parse(thirdAck)).toMatchObject({
        eventId: third.eventId,
        ok: true,
      });
      await thirdSnapshotEvent;

      const fourth = { ...resync, eventId: randomUUID() };
      const fourthAck = await new Promise<unknown>((resolve) => {
        client.emit('world:resync', fourth, resolve);
      });
      expect(officeCommandAckSchema.parse(fourthAck)).toMatchObject({
        eventId: fourth.eventId,
        ok: false,
        error: { code: 'rate_limited' },
      });
    } finally {
      client.disconnect();
    }
  });

  it('requires explicit same-session takeover and retires the old socket atomically', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const { office, ticket: ownerTicket } = await issueTicket(owner, workspaceId);
    const { ticket: memberTicket } = await issueTicket(member, workspaceId);
    const ownerSocket = officeSocket({ ticket: ownerTicket, protocolVersion: 1 });
    const memberSocket = officeSocket({ ticket: memberTicket, protocolVersion: 1 });
    let conflictSocket: Socket | undefined;
    let replacementSocket: Socket | undefined;
    try {
      const ownerReadyEvent = nextSocketEvent<unknown>(ownerSocket, 'office:ready');
      await connectSocket(ownerSocket);
      const ownerReady = officeReadySchema.parse(await ownerReadyEvent);
      const memberReadyEvent = nextSocketEvent<unknown>(memberSocket, 'office:ready');
      await connectSocket(memberSocket);
      await memberReadyEvent;

      const { ticket: conflictTicket } = await issueTicket(owner, workspaceId);
      conflictSocket = officeSocket({ ticket: conflictTicket, protocolVersion: 1 });
      const conflict = new Promise<Error>((resolve) => {
        conflictSocket!.once('connect_error', resolve);
      });
      conflictSocket.connect();
      await expect(conflict).resolves.toMatchObject({ message: 'participation_conflict' });
      expect(ownerSocket.connected).toBe(true);

      const referenceResponse = await owner.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${office._id}/takeover-reference`,
        {
          participationId: ownerReady.participationId,
          officeEpoch: ownerReady.snapshot.officeEpoch,
          mapVersion: vivoManifest.mapVersion,
          protocolVersion: 1,
        },
      );
      status(referenceResponse, 201);
      const reference = takeoverReferenceResponseSchema.parse(referenceResponse.body);
      expect(new Date(reference.expiresAt).getTime()).toBeLessThanOrEqual(
        Date.now() + OFFICE_LIMITS.takeoverReferenceLifetimeMs,
      );

      const replacementTicketResponse = await owner.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${office._id}/join-ticket/takeover`,
        {
          mapVersion: vivoManifest.mapVersion,
          protocolVersion: 1,
          takeover: {
            participationId: reference.participationId,
            officeEpoch: reference.officeEpoch,
            reference: reference.reference,
          },
        },
      );
      status(replacementTicketResponse, 201);
      const replacementTicket = joinTicketResponseSchema.parse(
        replacementTicketResponse.body,
      ).ticket;

      const replayResponse = await owner.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${office._id}/join-ticket/takeover`,
        {
          mapVersion: vivoManifest.mapVersion,
          protocolVersion: 1,
          takeover: {
            participationId: reference.participationId,
            officeEpoch: reference.officeEpoch,
            reference: reference.reference,
          },
        },
      );
      status(replayResponse, 401);

      const oldAccessEnded = nextSocketEvent<Record<string, unknown>>(
        ownerSocket,
        'office:access-ended',
      );
      const oldDisconnected = nextSocketEvent<string>(ownerSocket, 'disconnect');
      const memberDelta = nextSocketEvent<unknown>(memberSocket, 'world:delta');
      replacementSocket = officeSocket({ ticket: replacementTicket, protocolVersion: 1 });
      const replacementReadyEvent = nextSocketEvent<unknown>(replacementSocket, 'office:ready');
      await connectSocket(replacementSocket);
      const replacementReady = officeReadySchema.parse(await replacementReadyEvent);
      expect(replacementReady.participationId).not.toBe(ownerReady.participationId);
      expect(replacementReady.snapshot.participants.map((p) => p.participationId)).toContain(
        replacementReady.participationId,
      );
      expect(replacementReady.snapshot.participants.map((p) => p.participationId)).not.toContain(
        ownerReady.participationId,
      );
      await expect(oldAccessEnded).resolves.toMatchObject({
        reason: 'taken_over',
        officeEpoch: ownerReady.snapshot.officeEpoch,
      });
      await expect(oldDisconnected).resolves.toBeTruthy();
      const takeoverDelta = worldDeltaSchema.parse(await memberDelta);
      expect(takeoverDelta.removedParticipationIds).toContain(ownerReady.participationId);
      expect(takeoverDelta.participants.map((p) => p.participationId)).toContain(
        replacementReady.participationId,
      );
      expect(memberSocket.connected).toBe(true);
    } finally {
      conflictSocket?.disconnect();
      ownerSocket.disconnect();
      memberSocket.disconnect();
      replacementSocket?.disconnect();
    }
  });

  it('ends an idle socket after its authenticated session is revoked', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    try {
      const ready = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      await ready;
      const accessEnded = nextSocketEvent<Record<string, unknown>>(client, 'office:access-ended');
      const disconnected = nextSocketEvent<string>(client, 'disconnect');
      status(await owner.client.send('post', '/api/auth/logout'), 200);
      await expect(accessEnded).resolves.toMatchObject({ reason: 'authorization_ended' });
      await expect(disconnected).resolves.toBeTruthy();
    } finally {
      client.disconnect();
    }
  });

  it('removes an idle socket after its workspace membership is revoked', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const { ticket } = await issueTicket(member, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    try {
      const ready = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      await ready;
      const accessEnded = nextSocketEvent<Record<string, unknown>>(client, 'office:access-ended');
      const disconnected = nextSocketEvent<string>(client, 'disconnect');
      status(
        await owner.client.send('delete', `/api/workspaces/${workspaceId}/members/${member.id}`),
        200,
      );
      await expect(accessEnded).resolves.toMatchObject({ reason: 'authorization_ended' });
      await expect(disconnected).resolves.toBeTruthy();
    } finally {
      client.disconnect();
    }
  });

  it('ends an idle socket after authenticated session rotation', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    try {
      const ready = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      await ready;
      const accessEnded = nextSocketEvent<Record<string, unknown>>(client, 'office:access-ended');
      const disconnected = nextSocketEvent<string>(client, 'disconnect');
      status(await owner.client.send('post', '/api/auth/reauthenticate', { password }), 200);
      await expect(accessEnded).resolves.toMatchObject({ reason: 'authorization_ended' });
      await expect(disconnected).resolves.toBeTruthy();
    } finally {
      client.disconnect();
    }
  });

  it('ends an idle socket after password change revokes current sessions', async () => {
    const owner = await account();
    status(await owner.client.send('post', '/api/auth/reauthenticate', { password }), 200);
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    try {
      const ready = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      await ready;
      const accessEnded = nextSocketEvent<Record<string, unknown>>(client, 'office:access-ended');
      const disconnected = nextSocketEvent<string>(client, 'disconnect');
      status(
        await owner.client.send('post', '/api/auth/change-password', {
          currentPassword: password,
          newPassword,
        }),
        200,
      );
      await expect(accessEnded).resolves.toMatchObject({ reason: 'authorization_ended' });
      await expect(disconnected).resolves.toBeTruthy();
    } finally {
      client.disconnect();
    }
  });

  it('ends an idle socket after password reset revokes all sessions', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    try {
      const ready = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      await ready;
      const accessEnded = nextSocketEvent<Record<string, unknown>>(client, 'office:access-ended');
      const disconnected = nextSocketEvent<string>(client, 'disconnect');
      const resetBrowser = new Client();
      await resetBrowser.bootstrap();
      status(
        await resetBrowser.send('post', '/api/auth/forgot-password', { email: owner.email }),
        202,
      );
      const token = await mailCode(owner.email, 'reset-password');
      status(
        await resetBrowser.send('post', '/api/auth/reset-password', { token, newPassword }),
        200,
      );
      await expect(accessEnded).resolves.toMatchObject({ reason: 'authorization_ended' });
      await expect(disconnected).resolves.toBeTruthy();
    } finally {
      client.disconnect();
    }
  });

  it('ends an idle socket after the account is suspended', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    try {
      const ready = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      await ready;
      const accessEnded = nextSocketEvent<Record<string, unknown>>(client, 'office:access-ended');
      const disconnected = nextSocketEvent<string>(client, 'disconnect');
      await identities.users.updateOne({ _id: owner.id }, { $set: { status: 'suspended' } });
      await expect(accessEnded).resolves.toMatchObject({ reason: 'authorization_ended' });
      await expect(disconnected).resolves.toBeTruthy();
    } finally {
      client.disconnect();
    }
  });

  it('ends an idle socket after its workspace is suspended', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    try {
      const ready = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      await ready;
      const accessEnded = nextSocketEvent<Record<string, unknown>>(client, 'office:access-ended');
      const disconnected = nextSocketEvent<string>(client, 'disconnect');
      await tenancy.workspaces.updateOne({ _id: workspaceId }, { $set: { status: 'suspended' } });
      await expect(accessEnded).resolves.toMatchObject({ reason: 'authorization_ended' });
      await expect(disconnected).resolves.toBeTruthy();
    } finally {
      client.disconnect();
    }
  });

  it('expires a socket lease before a delayed policy response can renew it', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    let releaseDelayedPolicy: (() => void) | undefined;
    const admission = app.get(OfficeAdmissionService);
    try {
      const ready = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      await ready;
      const authorization = vi.spyOn(admission, 'isSocketAuthorized').mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            releaseDelayedPolicy = () => resolve(true);
          }),
      );
      try {
        const accessEnded = nextSocketEvent<Record<string, unknown>>(client, 'office:access-ended');
        const disconnected = nextSocketEvent<string>(client, 'disconnect');
        await expect(accessEnded).resolves.toMatchObject({ reason: 'server_unavailable' });
        await expect(disconnected).resolves.toBeTruthy();
        releaseDelayedPolicy?.();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(client.connected).toBe(false);
      } finally {
        authorization.mockRestore();
      }
    } finally {
      client.disconnect();
    }
  });

  it('expires a socket lease after primary-policy reads keep failing', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: 1 });
    const admission = app.get(OfficeAdmissionService);
    try {
      const ready = nextSocketEvent<unknown>(client, 'office:ready');
      await connectSocket(client);
      await ready;
      const authorization = vi
        .spyOn(admission, 'isSocketAuthorized')
        .mockRejectedValue(new Error('primary unavailable'));
      try {
        const accessEnded = nextSocketEvent<Record<string, unknown>>(client, 'office:access-ended');
        const disconnected = nextSocketEvent<string>(client, 'disconnect');
        await expect(accessEnded).resolves.toMatchObject({ reason: 'server_unavailable' });
        await expect(disconnected).resolves.toBeTruthy();
      } finally {
        authorization.mockRestore();
      }
    } finally {
      client.disconnect();
    }
  });

  it('reconnects only with a fresh one-use ticket and snapshot', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket: firstTicket } = await issueTicket(owner, workspaceId);
    const first = officeSocket({ ticket: firstTicket, protocolVersion: 1 });
    let replacement: Socket | undefined;
    try {
      const firstReadyEvent = nextSocketEvent<unknown>(first, 'office:ready');
      await connectSocket(first);
      const firstReady = officeReadySchema.parse(await firstReadyEvent);
      const firstDisconnected = nextSocketEvent<string>(first, 'disconnect');
      first.disconnect();
      await firstDisconnected;

      const { ticket: replacementTicket } = await issueTicket(owner, workspaceId);
      replacement = officeSocket({ ticket: replacementTicket, protocolVersion: 1 });
      const replacementReadyEvent = nextSocketEvent<unknown>(replacement, 'office:ready');
      await connectSocket(replacement);
      const replacementReady = officeReadySchema.parse(await replacementReadyEvent);
      expect(replacementReady.snapshot.officeEpoch).toBe(firstReady.snapshot.officeEpoch);
      expect(replacementReady.participationId).not.toBe(firstReady.participationId);
      expect(replacementReady.snapshot.participants).toHaveLength(1);
    } finally {
      first.disconnect();
      replacement?.disconnect();
    }
  });

  it('rejects missing and foreign Origins before consuming the ticket', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const invalidOrigins = [
      officeSocket({ ticket, protocolVersion: 1 }, null),
      officeSocket({ ticket, protocolVersion: 1 }, 'https://evil.example'),
    ];
    try {
      for (const client of invalidOrigins) await expect(connectSocket(client)).rejects.toBeTruthy();
      const record = await app
        .get(OfficeJoinTicketModels)
        .tickets.findOne({ ticketDigest: digest(ticket) })
        .lean();
      expect(record?.consumedAt).toBeNull();
    } finally {
      for (const client of invalidOrigins) client.disconnect();
    }
  });

  it('rejects malformed handshake auth without exposing parser details', async () => {
    const client = officeSocket({ ticket: 'invalid', protocolVersion: 1, role: 'owner' });
    try {
      await expect(connectSocket(client)).rejects.toMatchObject({ message: 'unauthorized' });
    } finally {
      client.disconnect();
    }
  });

  it('closes oversized raw handshake packets at the transport boundary', async () => {
    const client = officeSocket({
      ticket: 'a'.repeat(43),
      protocolVersion: 1,
      ignored: 'x'.repeat(5000),
    });
    try {
      const outcome = await new Promise<'connected' | 'rejected' | 'closed' | 'timeout'>(
        (resolve) => {
          const timer = setTimeout(() => resolve('timeout'), 5000);
          client.once('connect', () => {
            clearTimeout(timer);
            resolve('connected');
          });
          client.once('connect_error', () => {
            clearTimeout(timer);
            resolve('rejected');
          });
          client.io.once('error', () => {
            clearTimeout(timer);
            resolve('rejected');
          });
          client.io.once('open', () => {
            client.io.engine?.once('close', () => {
              clearTimeout(timer);
              resolve('closed');
            });
          });
          client.connect();
        },
      );
      expect(outcome).toMatch(/^(rejected|closed)$/);
    } finally {
      client.disconnect();
    }
  });

  it('rejects ticket replay and a second active participation for the same user', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket: firstTicket } = await issueTicket(owner, workspaceId);
    const { ticket: duplicateTicket } = await issueTicket(owner, workspaceId);
    const first = officeSocket({ ticket: firstTicket, protocolVersion: 1 });
    const replay = officeSocket({ ticket: firstTicket, protocolVersion: 1 });
    const duplicate = officeSocket({ ticket: duplicateTicket, protocolVersion: 1 });
    try {
      await connectSocket(first);
      await expect(connectSocket(replay)).rejects.toMatchObject({ message: 'unauthorized' });
      await expect(connectSocket(duplicate)).rejects.toMatchObject({
        message: 'participation_conflict',
      });
    } finally {
      first.disconnect();
      replay.disconnect();
      duplicate.disconnect();
    }
  });

  it('disconnects old-epoch sockets before admitting into the replacement runtime', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { office, ticket: oldTicket } = await issueTicket(owner, workspaceId);
    const oldSocket = officeSocket({ ticket: oldTicket, protocolVersion: 1 });
    const oldReadyEvent = nextSocketEvent<unknown>(oldSocket, 'office:ready');
    let newSocket: Socket | undefined;
    try {
      await connectSocket(oldSocket);
      const oldReady = officeReadySchema.parse(await oldReadyEvent);
      const accessEndedEvent = nextSocketEvent<Record<string, unknown>>(
        oldSocket,
        'office:access-ended',
      );
      const oldDisconnectEvent = nextSocketEvent<string>(oldSocket, 'disconnect');
      app.get(OfficeEpochRegistry).rotate(office._id);
      const { ticket: newTicket } = await issueTicket(owner, workspaceId);
      newSocket = officeSocket({ ticket: newTicket, protocolVersion: 1 });
      const newReadyEvent = nextSocketEvent<unknown>(newSocket, 'office:ready');
      await connectSocket(newSocket);

      const accessEnded = await accessEndedEvent;
      expect(accessEnded).toMatchObject({
        officeEpoch: oldReady.snapshot.officeEpoch,
        reason: 'server_unavailable',
      });
      await oldDisconnectEvent;
      const newReady = officeReadySchema.parse(await newReadyEvent);
      expect(newReady.snapshot.officeEpoch).not.toBe(oldReady.snapshot.officeEpoch);
      expect(newReady.snapshot.participants).toHaveLength(1);
    } finally {
      oldSocket.disconnect();
      newSocket?.disconnect();
    }
  });

  it('shows the second admitted user in snapshots and removes a disconnected user', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const { ticket: ownerTicket } = await issueTicket(owner, workspaceId);
    const { ticket: memberTicket } = await issueTicket(member, workspaceId);
    const ownerSocket = officeSocket({ ticket: ownerTicket, protocolVersion: 1 });
    const ownerReadyEvent = nextSocketEvent<unknown>(ownerSocket, 'office:ready');
    let memberSocket: Socket | undefined;
    try {
      await connectSocket(ownerSocket);
      const ownerReady = officeReadySchema.parse(await ownerReadyEvent);
      const joinedEvent = nextSocketEvent<Record<string, unknown>>(ownerSocket, 'world:delta');
      memberSocket = officeSocket({ ticket: memberTicket, protocolVersion: 1 });
      const memberReadyEvent = nextSocketEvent<unknown>(memberSocket, 'office:ready');
      await connectSocket(memberSocket);
      const memberReady = officeReadySchema.parse(await memberReadyEvent);
      expect(ownerReady.snapshot.participants).toHaveLength(1);
      expect(memberReady.snapshot.participants).toHaveLength(2);
      expect(memberReady.snapshot.participants[0]?.position).not.toEqual(
        memberReady.snapshot.participants[1]?.position,
      );
      const joined = await joinedEvent;
      expect(joined['participants']).toHaveLength(1);

      const removedEvent = nextSocketEvent<Record<string, unknown>>(ownerSocket, 'world:delta');
      memberSocket.disconnect();
      const removed = await removedEvent;
      expect(removed['removedParticipationIds']).toContain(memberReady.participationId);
    } finally {
      ownerSocket.disconnect();
      memberSocket?.disconnect();
    }
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
  it('writes a versioned audit mirror row with the audit event in the same transaction', async () => {
    const browser = new Client();
    await browser.bootstrap();
    const email = `audit-mirror-${randomUUID()}@example.com`;
    status(
      await browser.send('post', '/api/auth/register', {
        email,
        password,
        displayName: 'Audit Mirror Test',
      }),
      202,
    );
    const user = await identities.users.findOne({ normalizedEmail: email }).lean();
    if (!user) throw new Error('Account missing');
    const audit = app.get(AuditService);
    const event = await audit.model
      .findOne({ action: 'account.registered', targetId: user._id })
      .lean();
    if (!event) throw new Error('Audit event missing');
    const mirror = await audit.mirrorOutbox.findById(event._id).lean();
    if (!mirror) throw new Error('Audit mirror outbox row missing');
    expect(mirror).toMatchObject({
      _id: event._id,
      schemaVersion: 1,
      eventId: event._id,
      actorId: event.actorId,
      workspaceId: event.workspaceId,
      action: event.action,
      targetId: event.targetId,
      state: 'pending',
    });
    expect(mirror.occurredAt.getTime()).toBe(event.createdAt.getTime());
    const projection = {
      schemaVersion: 1,
      eventId: event._id,
      occurredAt: event.createdAt.toISOString(),
      actorId: event.actorId,
      workspaceId: event.workspaceId,
      action: event.action,
      targetId: event.targetId,
    };
    expect(mirror.digest).toBe(
      createHash('sha256').update(JSON.stringify(projection), 'utf8').digest('hex'),
    );
  });
  it('rolls the security mutation and audit row back when mirror-outbox insertion fails', async () => {
    const browser = new Client();
    await browser.bootstrap();
    const email = `audit-mirror-rollback-${randomUUID()}@example.com`;
    const audit = app.get(AuditService);
    const beforeAudit = await audit.model.countDocuments();
    const beforeMirror = await audit.mirrorOutbox.countDocuments();
    const beforeCredentials = await identities.credentials.countDocuments();
    const beforeTokens = await identities.tokens.countDocuments();
    const beforeMailOutbox = await outbox.model.countDocuments();
    const spy = vi
      .spyOn(audit.mirrorOutbox, 'create')
      .mockRejectedValueOnce(new Error('injected-audit-mirror-failure'));
    try {
      status(
        await browser.send('post', '/api/auth/register', {
          email,
          password,
          displayName: 'Audit Rollback Test',
        }),
        503,
      );
    } finally {
      spy.mockRestore();
    }
    expect(await identities.users.countDocuments({ normalizedEmail: email })).toBe(0);
    expect(await identities.credentials.countDocuments()).toBe(beforeCredentials);
    expect(await identities.tokens.countDocuments()).toBe(beforeTokens);
    expect(await outbox.model.countDocuments()).toBe(beforeMailOutbox);
    expect(await audit.model.countDocuments()).toBe(beforeAudit);
    expect(await audit.mirrorOutbox.countDocuments()).toBe(beforeMirror);
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
  it('expires a due outbox record during dispatch without queueing it', async () => {
    const browser = new Client();
    await browser.bootstrap();
    const email = `dispatch-expired-${randomUUID()}@example.com`;
    status(
      await browser.send('post', '/api/auth/register', {
        email,
        password,
        displayName: 'Dispatch Expiry Test',
      }),
      202,
    );
    const user = await identities.users.findOne({ normalizedEmail: email }).lean();
    if (!user) throw new Error('Account missing');
    const record = await outbox.model
      .findOne({ subjectId: user._id, kind: 'verify-email', state: 'pending' })
      .select('+payload')
      .lean();
    if (!record?.payload) throw new Error('Outbox missing encrypted payload');
    expect(decryptMail(record._id, record.payload, encryption).recipient).toBe(email);
    await outbox.model.updateOne(
      { _id: record._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const getJobIds = new Set<string>();
    const getJob = vi.fn(async (id: string) => {
      getJobIds.add(id);
      return undefined;
    });
    const addIds = new Set<string>();
    const add = vi.fn(async (name: string, payload: { outboxEventId: string }) => {
      addIds.add(payload.outboxEventId);
      return { name, payload };
    });
    const queue = { getJob, add } as unknown as Queue;
    await dispatchOutbox(outbox.model, queue);
    const expired = await outbox.model.findById(record._id).select('+payload').lean();
    expect(expired?.state).toBe('expired');
    expect(expired?.payload).toBeNull();
    expect(getJobIds.has(record._id)).toBe(false);
    expect(addIds.has(record._id)).toBe(false);
  });
  it('keeps an outbox pending through a queue outage and enqueues the same job once on recovery', async () => {
    const browser = new Client();
    await browser.bootstrap();
    const email = `queue-outage-${randomUUID()}@example.com`;
    status(
      await browser.send('post', '/api/auth/register', {
        email,
        password,
        displayName: 'Queue Outage Test',
      }),
      202,
    );
    const user = await identities.users.findOne({ normalizedEmail: email }).lean();
    if (!user) throw new Error('Account missing');
    const record = await outbox.model
      .findOne({ subjectId: user._id, kind: 'verify-email', state: 'pending' })
      .select('+payload')
      .lean();
    if (!record?.payload) throw new Error('Outbox missing encrypted payload');
    const encrypted = record.payload;
    expect(decryptMail(record._id, encrypted, encryption).recipient).toBe(email);

    const outageAdd = vi.fn(async (name: string, payload: { outboxEventId: string }) => {
      if (payload.outboxEventId === record._id) throw new Error('injected-queue-outage');
      return { name, payload };
    });
    const outageQueue = {
      getJob: vi.fn(async () => undefined),
      add: outageAdd,
    } as unknown as Queue;
    await expect(dispatchOutbox(outbox.model, outageQueue)).rejects.toThrow(
      'injected-queue-outage',
    );
    const pending = await outbox.model.findById(record._id).select('+payload').lean();
    expect(pending?.state).toBe('pending');
    expect(pending?.payload).toEqual(encrypted);
    if (!pending?.payload) throw new Error('Outbox payload missing after queue outage');
    expect(decryptMail(record._id, pending.payload, encryption).recipient).toBe(email);

    const add = vi.fn(async (name: string, payload: { outboxEventId: string }) => ({
      name,
      payload,
    }));
    const recoveredQueue = {
      getJob: vi.fn(async () => undefined),
      add,
    } as unknown as Queue;
    await dispatchOutbox(outbox.model, recoveredQueue);
    const targetAdds = add.mock.calls.filter((args) => args[1]?.outboxEventId === record._id);
    expect(targetAdds).toHaveLength(1);
    expect(add).toHaveBeenCalledWith(
      'transactional-email',
      { outboxEventId: record._id },
      expect.objectContaining({ jobId: record._id }),
    );
    const queued = await outbox.model.findById(record._id).select('+payload').lean();
    expect(queued?.state).toBe('queued');
    expect(queued?.payload).toEqual(encrypted);

    const duplicateAdd = vi.fn(async (name: string, payload: { outboxEventId: string }) => ({
      name,
      payload,
    }));
    const existingGetJob = vi.fn(async (id: string) => ({ id }));
    const existingQueue = {
      getJob: existingGetJob,
      add: duplicateAdd,
    } as unknown as Queue;
    await dispatchOutbox(outbox.model, existingQueue);
    expect(existingGetJob).toHaveBeenCalledWith(record._id);
    expect(duplicateAdd).not.toHaveBeenCalled();
    expect((await outbox.model.findById(record._id).select('+payload').lean())?.state).toBe(
      'queued',
    );
  });
  it('keeps mail retryable after a provider failure, then delivers it and ignores replay', async () => {
    const browser = new Client();
    await browser.bootstrap();
    const email = `provider-failure-${randomUUID()}@example.com`;
    status(
      await browser.send('post', '/api/auth/register', {
        email,
        password,
        displayName: 'Provider Failure Test',
      }),
      202,
    );
    const user = await identities.users.findOne({ normalizedEmail: email }).lean();
    if (!user) throw new Error('Account missing');
    const record = await outbox.model
      .findOne({ subjectId: user._id, kind: 'verify-email', state: 'pending' })
      .select('+payload')
      .lean();
    if (!record?.payload) throw new Error('Outbox missing encrypted payload');
    const encrypted = record.payload;
    expect(decryptMail(record._id, encrypted, encryption).recipient).toBe(email);

    const send = vi
      .fn(async () => {})
      .mockRejectedValueOnce(new Error('injected-provider-failure'));
    await expect(deliverOutbox(record._id, outbox.model, encryption, send)).rejects.toThrow(
      'mail_delivery_failed',
    );
    expect(send).toHaveBeenCalledTimes(1);
    const retryable = await outbox.model.findById(record._id).select('+payload').lean();
    expect(retryable?.state).toBe('pending');
    expect(retryable?.attempts).toBe(1);
    expect(retryable?.deliveredAt).toBeNull();
    expect(retryable?.payload).toEqual(encrypted);
    if (!retryable?.payload) throw new Error('Outbox payload missing after provider failure');
    expect(decryptMail(record._id, retryable.payload, encryption).recipient).toBe(email);

    send.mockResolvedValueOnce(undefined);
    await deliverOutbox(record._id, outbox.model, encryption, send);
    expect(send).toHaveBeenCalledTimes(2);
    const delivered = await outbox.model.findById(record._id).select('+payload').lean();
    expect(delivered?.state).toBe('delivered');
    expect(delivered?.attempts).toBe(2);
    expect(delivered?.payload).toBeNull();
    expect(delivered?.deliveredAt).toBeInstanceOf(Date);

    await deliverOutbox(record._id, outbox.model, encryption, send);
    expect(send).toHaveBeenCalledTimes(2);
    const replay = await outbox.model.findById(record._id).select('+payload').lean();
    expect(replay?.state).toBe('delivered');
    expect(replay?.attempts).toBe(2);
    expect(replay?.payload).toBeNull();
  });
  it('retries an acknowledgement-lost SMTP send with at-least-once delivery, not exactly-once', async () => {
    const browser = new Client();
    await browser.bootstrap();
    const email = `ack-loss-${randomUUID()}@example.com`;
    status(
      await browser.send('post', '/api/auth/register', {
        email,
        password,
        displayName: 'Acknowledgement Loss Test',
      }),
      202,
    );
    const user = await identities.users.findOne({ normalizedEmail: email }).lean();
    if (!user) throw new Error('Account missing');
    const record = await outbox.model
      .findOne({ subjectId: user._id, kind: 'verify-email', state: 'pending' })
      .select('+payload')
      .lean();
    if (!record?.payload) throw new Error('Outbox missing encrypted payload');
    const encrypted = record.payload;
    const original = decryptMail(record._id, encrypted, encryption);
    expect(original.recipient).toBe(email);

    // The provider accepts and records the first message, but its
    // acknowledgement is lost. This test proves at-least-once delivery only;
    // it does not claim exactly-once delivery from the provider.
    const delivered: MailPayload[] = [];
    const send = vi.fn(async (payload: MailPayload) => {
      delivered.push(payload);
      if (delivered.length === 1) throw new Error('injected-acknowledgement-lost');
    });
    await expect(deliverOutbox(record._id, outbox.model, encryption, send)).rejects.toThrow(
      'mail_delivery_failed',
    );
    expect(send).toHaveBeenCalledTimes(1);
    const retryable = await outbox.model.findById(record._id).select('+payload').lean();
    expect(retryable?.state).toBe('pending');
    expect(retryable?.attempts).toBe(1);
    expect(retryable?.deliveredAt).toBeNull();
    expect(retryable?.payload).toEqual(encrypted);
    if (!retryable?.payload) throw new Error('Outbox payload missing after acknowledgement loss');
    expect(decryptMail(record._id, retryable.payload, encryption).recipient).toBe(email);

    await deliverOutbox(record._id, outbox.model, encryption, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(delivered.map((message) => message.token)).toEqual([original.token, original.token]);
    expect(delivered.map((message) => message.recipient)).toEqual([email, email]);
    const deliveredRecord = await outbox.model.findById(record._id).select('+payload').lean();
    expect(deliveredRecord?.state).toBe('delivered');
    expect(deliveredRecord?.attempts).toBe(2);
    expect(deliveredRecord?.payload).toBeNull();
    expect(deliveredRecord?.deliveredAt).toBeInstanceOf(Date);

    await deliverOutbox(record._id, outbox.model, encryption, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(delivered).toHaveLength(2);
    const replay = await outbox.model.findById(record._id).select('+payload').lean();
    expect(replay?.state).toBe('delivered');
    expect(replay?.attempts).toBe(2);
    expect(replay?.payload).toBeNull();
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
