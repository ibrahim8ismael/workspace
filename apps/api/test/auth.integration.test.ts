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
import { performance } from 'node:perf_hooks';
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
  renameWorkspaceResponseSchema,
  updateWorkspaceRoomCountResponseSchema,
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
  officeWaveSchema,
  meetingInvitationSchema,
  meetingZonesSchema,
  worldDeltaSchema,
  worldSnapshotSchema,
  takeoverReferenceResponseSchema,
  OFFICE_LIMITS,
  OFFICE_PROTOCOL_VERSION,
  officeMessageSchema,
  spaceMessageSchema,
  spaceMessagesResponseSchema,
  type SpaceMessage,
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
import { MediaWebhookModels } from '../dist/modules/media/media-webhook.models.js';
import { OfficeRuntimeService } from '../dist/modules/office/runtime/office-runtime.service.js';
import { trustedOfficeMap } from '../dist/modules/office/office-map-registry.js';
import { MediaPolicyService } from '../dist/modules/media/media-policy.service.js';
import { VIVO_GEOMETRY, canStep } from '@gather/world';
import type { WorldSnapshot } from '@gather/contracts';
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
import { clientIp, validProxyIpList } from '../dist/platform/http/client-ip.js';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { AccessToken, RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';

const origin = 'https://api.gather.test';
const password = 'a quartz river beneath the lantern';
const newPassword = 'a copper forest beyond the telescope';
const encryption = randomBytes(32);
const mediaMachineKey = randomBytes(32);
const livekitApiKey = 'gather-test-key';
const livekitApiSecret = randomBytes(32).toString('base64url');
const runLiveMediaFixture = process.env['CP08_REAL_MEDIA'] === '1';
const runMediaReconnect = process.env['CP08_MEDIA_RECONNECT'] === '1';
const runMediaTokenRefresh = process.env['CP08_MEDIA_TOKEN_REFRESH'] === '1';
const runMediaPermissionDenied = process.env['CP08_MEDIA_PERMISSION_DENIED'] === '1';
const runMediaTurnOnly = process.env['CP08_MEDIA_TURN_ONLY'] === '1';
const runMediaWeakNetwork = process.env['CP08_MEDIA_WEAK_NETWORK'] === '1';
const runMediaCrossCompany = process.env['CP08_MEDIA_CROSS_COMPANY'] === '1';
const configuredMediaEnd = process.env['CP08_MEDIA_END'] ?? 'leave';
const mediaEndScenario = runLiveMediaFixture
  ? ['opt-out', 'away', 'session-revoke', 'membership-revoke'].includes(configuredMediaEnd)
    ? configuredMediaEnd
    : 'leave'
  : 'leave';
const liveKitFixtureImage =
  'livekit/livekit-server@sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20';
const mediaNetemHelperImage =
  'alpine@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f';
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

function ipv4AddressAtOffset(subnet: string, offset: number) {
  const [address, prefixValue] = subnet.split('/');
  const octets = address?.split('.').map(Number);
  const prefix = Number(prefixValue);
  if (
    octets?.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255) ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 30
  )
    throw new Error('Docker returned an invalid IPv4 fixture subnet');
  const value = octets.reduce((current, octet) => (current * 256 + octet) >>> 0, 0);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const hostAddress = (((value & mask) >>> 0) + offset) >>> 0;
  return [24, 16, 8, 0].map((shift) => (hostAddress >>> shift) & 0xff).join('.');
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
  const turnPort = runMediaTurnOnly ? await unusedLoopbackPort() : undefined;
  const networkName = turnPort ? `gather-cp08-turn-${randomUUID()}` : undefined;
  let containerIp: string | undefined;
  let networkSubnet: string | undefined;
  if (networkName) {
    await docker('network', 'create', '--label', 'gather.cp08.fixture=true', networkName);
    try {
      const networkInfo = JSON.parse(await docker('network', 'inspect', networkName)) as Array<{
        IPAM?: { Config?: Array<{ Subnet?: string }> };
      }>;
      networkSubnet = networkInfo[0]?.IPAM?.Config?.[0]?.Subnet;
      if (!networkSubnet) throw new Error('Docker fixture network has no IPv4 subnet');
      containerIp = ipv4AddressAtOffset(networkSubnet, 2);
    } catch (error) {
      await docker('network', 'rm', networkName).catch(() => '');
      throw error;
    }
  }
  const turnConfig = turnPort
    ? `turn:\n  enabled: true\n  domain: ${containerIp}\n  udp_port: ${turnPort}\n  relay_range_start: 30000\n  relay_range_end: 30007\n  allow_restricted_peer_cidrs: [${networkSubnet}]\n`
    : '';
  const config = `port: ${turnPort ? signalingPort : 7880}\nbind_addresses: [0.0.0.0]\nrtc:\n  tcp_port: ${rtcPort}\n  node_ip: ${containerIp ?? '127.0.0.1'}\n  use_external_ip: false\nkeys:\n  ${livekitApiKey}: ${livekitApiSecret}\n${turnConfig}`;
  const networkArgs = turnPort
    ? [
        '--network',
        networkName!,
        '--ip',
        containerIp!,
        '-p',
        `127.0.0.1:${signalingPort}:${signalingPort}`,
        '-p',
        `127.0.0.1:${rtcPort}:${rtcPort}`,
      ]
    : ['-p', `127.0.0.1:${signalingPort}:7880`, '-p', `127.0.0.1:${rtcPort}:${rtcPort}`];
  const containerId = await docker(
    'run',
    '-d',
    '--restart',
    'no',
    '--label',
    'gather.cp08.fixture=true',
    ...networkArgs,
    '-e',
    `LIVEKIT_CONFIG=${config}`,
    liveKitFixtureImage,
  );
  let netemHelperId: string | undefined;
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
    applyWeakNetwork: async () => {
      if (netemHelperId) throw new Error('Network impairment is already active');
      netemHelperId = await docker(
        'run',
        '-d',
        '--network',
        `container:${containerId}`,
        '--cap-add',
        'NET_ADMIN',
        mediaNetemHelperImage,
        'sh',
        '-c',
        'apk add --no-cache iproute2 && echo ready && sleep 300',
      );
      try {
        const helperReadyDeadline = Date.now() + 30000;
        while (Date.now() < helperReadyDeadline) {
          const logs = await docker('logs', netemHelperId);
          if (logs.includes('ready')) break;
          const state = JSON.parse(
            await docker('inspect', '--format', '{{json .State}}', netemHelperId),
          ) as { Running?: boolean };
          if (!state.Running)
            throw new Error(`Packet-impairment helper exited during setup: ${logs.slice(-500)}`);
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (Date.now() >= helperReadyDeadline)
          throw new Error('Packet-impairment helper did not finish installing iproute2');
        await docker(
          'exec',
          netemHelperId,
          'tc',
          'qdisc',
          'replace',
          'dev',
          'eth0',
          'root',
          'netem',
          'delay',
          '120ms',
          '40ms',
          'distribution',
          'normal',
          'loss',
          '3%',
        );
        return await docker('exec', netemHelperId, 'tc', '-s', 'qdisc', 'show', 'dev', 'eth0');
      } catch (error) {
        await docker('rm', '-f', netemHelperId).catch(() => '');
        netemHelperId = undefined;
        throw error;
      }
    },
    readWeakNetworkStats: async () => {
      if (!netemHelperId) throw new Error('Network impairment is not active');
      return docker('exec', netemHelperId, 'tc', '-s', 'qdisc', 'show', 'dev', 'eth0');
    },
    clearWeakNetwork: async () => {
      if (!netemHelperId) return;
      await docker('exec', netemHelperId, 'tc', 'qdisc', 'del', 'dev', 'eth0', 'root').catch(
        () => '',
      );
      await docker('rm', '-f', netemHelperId).catch(() => '');
      netemHelperId = undefined;
    },
    restartInPlace: async () => {
      await docker('restart', containerId);
    },
    restart: async () => {
      await docker('rm', '-f', containerId);
      if (networkName) await docker('network', 'rm', networkName).catch(() => '');
      return startLiveKitFixture();
    },
    stop: async () => {
      if (netemHelperId) {
        await docker('exec', netemHelperId, 'tc', 'qdisc', 'del', 'dev', 'eth0', 'root').catch(
          () => '',
        );
        await docker('rm', '-f', netemHelperId).catch(() => '');
      }
      await docker('rm', '-f', containerId).catch(() => '');
      if (networkName) await docker('network', 'rm', networkName).catch(() => '');
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
  denyMicrophoneIndex?: 0 | 1;
  forceRelay?: boolean;
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
  expect(response.status, response.body?.error?.code).toBe(expected);
  if (response.status >= 400) apiErrorResponseSchema.parse(response.body);
}

async function liveKitWebhookAuthorization(body: string, sha256?: string) {
  const token = new AccessToken(livekitApiKey, livekitApiSecret, { ttl: '1m' });
  token.sha256 = sha256 ?? createHash('sha256').update(body).digest('base64');
  return token.toJwt();
}

async function postLiveKitWebhook(body: string, authorization: string) {
  return request(app.getHttpServer())
    .post('/api/internal/media/livekit/webhook')
    .set('Content-Type', 'application/webhook+json')
    .set('Authorization', authorization)
    .send(body);
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
function socketEventQueue(socket: Socket, event: string) {
  const queued: unknown[] = [];
  socket.on(event, (payload: unknown) => queued.push(payload));
  return async (predicate: (payload: unknown) => boolean) => {
    let matched: unknown;
    await vi.waitFor(
      () => {
        const index = queued.findIndex(predicate);
        if (index < 0) throw new Error(`waiting for ${event}`);
        matched = queued.splice(index, 1)[0];
      },
      { timeout: 10000, interval: 20 },
    );
    return matched;
  };
}
type GuardOutput = {
  kind?: string;
  sequence?: number;
  epoch?: string;
  generation?: string;
  durationMs?: number;
  participants?: number | string;
};
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
  try {
    await vi.waitFor(
      () => {
        if (guard.child.exitCode !== null)
          throw new Error(`application guard exited before ${label}: ${guard.getStderr()}`);
        result = guard.messages.find(predicate);
        if (!result) throw new Error(`application guard has not emitted ${label}`);
      },
      { timeout: 5000, interval: 25 },
    );
  } catch (error) {
    const trace = guard.messages.map(
      ({ kind, sequence, generation, durationMs, participants }) => ({
        kind,
        sequence,
        generation,
        durationMs,
        participants,
      }),
    );
    throw new Error(`${String(error)}; safe guard trace=${JSON.stringify(trace)}`, {
      cause: error,
    });
  }
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
      } else if (typeof response.body.message === 'string') {
        if ('name' in response.body) renameWorkspaceResponseSchema.parse(response.body);
        else if ('roomCount' in response.body)
          updateWorkspaceRoomCountResponseSchema.parse(response.body);
        else messageResponseSchema.parse(response.body);
      }
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
    const agent = request(app.getHttpServer())
      .get('/api/auth/csrf')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', this.cookie);
    const response = await agent;
    status(response, 200);
    this.capture(response);
    return response;
  }
  async send(
    method: 'post' | 'patch' | 'delete',
    path: string,
    body: Record<string, unknown> = {},
    key = randomUUID(),
    forwardedFor?: string,
  ) {
    const agent = request(app.getHttpServer());
    const call = agent[method](path)
      .set('Origin', origin)
      .set('X-CSRF-Token', this.csrf)
      .set('Cookie', this.cookie)
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', key);
    if (forwardedFor) call.set('X-Forwarded-For', forwardedFor);
    const response = await call.send(body);
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
  status(await client.send('post', '/api/auth/verify-email', { email, token, password }), 200);
  const login = await client.send('post', '/api/auth/login', { email, password });
  status(login, 200);
  return { client, email, id: String(login.body.account.id) };
}
async function workspace(owner: Awaited<ReturnType<typeof account>>, roomCount?: number) {
  const response = await owner.client.send('post', '/api/workspaces', {
    name: 'Example Company',
    slug: `company-${randomUUID()}`,
    ...(roomCount === undefined ? {} : { roomCount }),
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
  process.env['TRUSTED_PROXY_IPS'] = '127.0.0.1,::1';
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
  app.useBodyParser('raw', { type: 'application/webhook+json', limit: '64kb' });
  app.useBodyParser('json', { limit: '4kb' });
  configureHttp(app);
  app.useWebSocketAdapter(new OfficeSocketAdapter(app, origin, process.env['TRUSTED_PROXY_IPS']));
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

describe('trusted proxy client IP resolution', () => {
  it('uses forwarded IP only from an exact trusted proxy and rejects ambiguous chains', () => {
    expect(clientIp('172.26.0.4', '198.51.100.24', '172.26.0.4')).toBe('198.51.100.24');
    expect(clientIp('172.26.0.5', '198.51.100.24', '172.26.0.4')).toBe('172.26.0.5');
    expect(clientIp('172.26.0.4', '198.51.100.24, 203.0.113.8', '172.26.0.4')).toBe('172.26.0.4');
    expect(clientIp('::ffff:172.26.0.4', '2001:db8::8', '172.26.0.4')).toBe('2001:db8::8');
    expect(validProxyIpList('172.26.0.4,2001:db8::4')).toBe(true);
    expect(validProxyIpList('172.26.0.0/16')).toBe(false);
    expect(validProxyIpList('172.26.0.4,')).toBe(false);
  });
});

describe('LiveKit webhook observations', () => {
  it('verifies signed raw bodies, deduplicates event IDs, and ignores late events', async () => {
    const roomName = randomUUID();
    const firstEventId = randomUUID();
    const baseTime = Math.floor(Date.now() / 1000) - 5;
    const firstBody = JSON.stringify({
      id: firstEventId,
      event: 'room_started',
      createdAt: String(baseTime),
      room: { name: roomName },
    });
    const firstAuthorization = await liveKitWebhookAuthorization(firstBody);

    status(await postLiveKitWebhook(firstBody, firstAuthorization), 204);
    status(await postLiveKitWebhook(firstBody, firstAuthorization), 204);

    const models = app.get(MediaWebhookModels);
    expect(await models.events.countDocuments({ _id: firstEventId })).toBe(1);
    expect(await models.roomCursors.findById(roomName).lean()).toMatchObject({
      eventId: firstEventId,
      eventName: 'room_started',
    });

    const sameTimeEventId = randomUUID();
    const sameTimeBody = JSON.stringify({
      id: sameTimeEventId,
      event: 'participant_joined',
      createdAt: String(baseTime),
      room: { name: roomName },
      participant: { identity: randomUUID() },
    });
    status(
      await postLiveKitWebhook(sameTimeBody, await liveKitWebhookAuthorization(sameTimeBody)),
      204,
    );
    expect(await models.events.findById(sameTimeEventId).lean()).toMatchObject({
      disposition: 'same_time',
      roomName,
    });
    expect(await models.roomCursors.findById(roomName).lean()).toMatchObject({
      eventId: firstEventId,
      eventName: 'room_started',
    });

    const lateEventId = randomUUID();
    const lateBody = JSON.stringify({
      id: lateEventId,
      event: 'participant_left',
      createdAt: String(baseTime - 10),
      room: { name: roomName },
      participant: { identity: randomUUID() },
    });
    status(await postLiveKitWebhook(lateBody, await liveKitWebhookAuthorization(lateBody)), 204);
    expect(await models.events.findById(lateEventId).lean()).toMatchObject({
      disposition: 'late',
      roomName,
    });
    expect(await models.roomCursors.findById(roomName).lean()).toMatchObject({
      eventId: firstEventId,
      eventName: 'room_started',
    });
  });

  it('rejects invalid webhook signatures and non-webhook content types', async () => {
    const body = JSON.stringify({
      id: randomUUID(),
      event: 'room_started',
      createdAt: String(Math.floor(Date.now() / 1000)),
      room: { name: randomUUID() },
    });
    const invalidAuthorization = await liveKitWebhookAuthorization(body, 'not-the-body-digest');
    status(await postLiveKitWebhook(body, invalidAuthorization), 401);

    const wrongContentType = await request(app.getHttpServer())
      .post('/api/internal/media/livekit/webhook')
      .set('Content-Type', 'text/plain')
      .send(body);
    status(wrongContentType, 415);
  });
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
        email,
        token: verify,
        password: 'a different mailbox password',
      }),
      401,
    );
    const legitimate = new Client();
    await legitimate.bootstrap();
    status(await legitimate.send('post', '/api/auth/forgot-password', { email }), 202);
    const token = await mailCode(email, 'reset-password');
    status(
      await legitimate.send('post', '/api/auth/reset-password', { email, token, newPassword }),
      200,
    );
    status(await attacker.send('post', '/api/auth/login', { email, password }), 401);
    status(await legitimate.send('post', '/api/auth/login', { email, password: newPassword }), 200);
    status(
      await attacker.send('post', '/api/auth/verify-email', { email, token: verify, password }),
      400,
    );
  });
  it('accepts six-digit codes including leading zeroes with account-scoped digest lookup', async () => {
    const firstEmail = `code-first-${randomUUID()}@example.com`;
    const secondEmail = `code-second-${randomUUID()}@example.com`;
    const first = new Client();
    const second = new Client();
    await Promise.all([first.bootstrap(), second.bootstrap()]);
    for (const [client, email] of [
      [first, firstEmail],
      [second, secondEmail],
    ] as const)
      status(
        await client.send('post', '/api/auth/register', {
          email,
          password,
          displayName: 'Code Person',
        }),
        202,
      );
    const firstUser = await identities.users.findOne({ normalizedEmail: firstEmail }).lean();
    const secondUser = await identities.users.findOne({ normalizedEmail: secondEmail }).lean();
    expect(firstUser && secondUser).toBeTruthy();
    const code = '038291';
    for (const user of [firstUser!, secondUser!])
      await identities.tokens.updateOne(
        { userId: user._id, purpose: 'verify-email', consumedAt: null },
        { $set: { tokenDigest: digest(`${user._id}:verify-email:${code}`) } },
      );
    status(
      await first.send('post', '/api/auth/verify-email', {
        email: firstEmail,
        token: code,
        password,
      }),
      200,
    );
    status(
      await second.send('post', '/api/auth/verify-email', {
        email: secondEmail,
        token: code,
        password,
      }),
      200,
    );
  });
  it('limits incorrect verification attempts per account and keeps legacy long codes valid through expiry', async () => {
    const email = `guess-${randomUUID()}@example.com`;
    const client = new Client();
    await client.bootstrap();
    status(
      await client.send('post', '/api/auth/register', {
        email,
        password,
        displayName: 'Guess Person',
      }),
      202,
    );
    const issuedCode = await mailCode(email, 'verify-email');
    const wrongCode = issuedCode === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 10; attempt += 1)
      status(
        await client.send('post', '/api/auth/verify-email', { email, token: wrongCode, password }),
        400,
      );
    status(
      await client.send('post', '/api/auth/verify-email', { email, token: wrongCode, password }),
      429,
    );

    const legacyEmail = `legacy-${randomUUID()}@example.com`;
    const legacy = new Client();
    await legacy.bootstrap();
    status(
      await legacy.send('post', '/api/auth/register', {
        email: legacyEmail,
        password,
        displayName: 'Legacy Person',
      }),
      202,
    );
    const user = await identities.users.findOne({ normalizedEmail: legacyEmail }).lean();
    const legacyToken = 'A'.repeat(43);
    await identities.tokens.updateOne(
      { userId: user!._id, purpose: 'verify-email', consumedAt: null },
      { $set: { tokenDigest: digest(legacyToken) } },
    );
    status(
      await legacy.send('post', '/api/auth/verify-email', {
        email: legacyEmail,
        token: legacyToken,
        password,
      }),
      200,
    );
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
    expect(await mailCode(user.email, 'reset-password')).toBe(old);
    // Simulate the client waiting through the resend cooldown before issuing another code.
    await identities.tokens.updateOne(
      { tokenDigest: digest(`${user.id}:reset-password:${old}`) },
      { $set: { createdAt: new Date(Date.now() - 61_000) } },
    );
    status(await a.send('post', '/api/auth/forgot-password', { email: user.email }), 202);
    const token = await mailCode(user.email, 'reset-password');
    status(
      await b.send('post', '/api/auth/reset-password', {
        email: user.email,
        token: old,
        newPassword,
      }),
      400,
    );
    const results = await Promise.all([
      a.send('post', '/api/auth/reset-password', { email: user.email, token, newPassword }),
      b.send('post', '/api/auth/reset-password', { email: user.email, token, newPassword }),
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
      { tokenDigest: digest(`${user.id}:reset-password:${token}`) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    status(
      await browser.send('post', '/api/auth/reset-password', {
        email: user.email,
        token,
        newPassword,
      }),
      400,
    );
    expect(
      await identities.tokens.countDocuments({
        tokenDigest: digest(`${user.id}:reset-password:${token}`),
      }),
    ).toBe(1);
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
    const key = `test-${randomUUID()}`;
    const windowMs = 24 * 60 * 60_000;
    await abuse.consume('bounded-test', key, 2, windowMs);
    await abuse.consume('bounded-test', key, 2, windowMs);
    await expect(abuse.consume('bounded-test', key, 2, windowMs)).rejects.toMatchObject({
      status: 429,
    });
  });
  it('does not let anonymous login failures from other addresses lock a victim account', async () => {
    const user = await account();
    for (const forwardedFor of [
      '198.51.100.10',
      '198.51.100.11',
      '198.51.100.12',
      '198.51.100.13',
      '198.51.100.14',
    ]) {
      const attacker = new Client();
      await attacker.bootstrap();
      status(
        await attacker.send(
          'post',
          '/api/auth/login',
          { email: user.email.toUpperCase(), password: 'incorrect password' },
          randomUUID(),
          forwardedFor,
        ),
        401,
      );
    }

    const repeatedAttacker = new Client();
    await repeatedAttacker.bootstrap();
    for (let attempt = 0; attempt < 5; attempt += 1)
      status(
        await repeatedAttacker.send(
          'post',
          '/api/auth/login',
          { email: user.email, password: 'incorrect password' },
          randomUUID(),
          '198.51.100.20',
        ),
        401,
      );
    status(
      await repeatedAttacker.send(
        'post',
        '/api/auth/login',
        { email: user.email, password: 'incorrect password' },
        randomUUID(),
        '198.51.100.20',
      ),
      429,
    );

    const legitimate = new Client();
    await legitimate.bootstrap();
    status(
      await legitimate.send(
        'post',
        '/api/auth/login',
        { email: user.email, password },
        randomUUID(),
        '203.0.113.30',
      ),
      200,
    );
  });
  it('limits reauthentication password guesses across sessions and recovers after the window', async () => {
    const user = await account();
    const secondSession = new Client();
    await secondSession.bootstrap();
    status(
      await secondSession.send('post', '/api/auth/login', { email: user.email, password }),
      200,
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const client = attempt < 3 ? user.client : secondSession;
      status(
        await client.send('post', '/api/auth/reauthenticate', { password: 'incorrect password' }),
        401,
      );
    }
    status(await secondSession.send('post', '/api/auth/reauthenticate', { password }), 429);

    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60_000);
    try {
      status(await secondSession.send('post', '/api/auth/reauthenticate', { password }), 200);
    } finally {
      dateNow.mockRestore();
    }
  });
  it('limits current-password guesses on change-password', async () => {
    const user = await account();
    status(await user.client.send('post', '/api/auth/reauthenticate', { password }), 200);
    for (let attempt = 0; attempt < 5; attempt += 1)
      status(
        await user.client.send('post', '/api/auth/change-password', {
          currentPassword: 'incorrect password',
          newPassword,
        }),
        401,
      );
    status(
      await user.client.send('post', '/api/auth/change-password', {
        currentPassword: password,
        newPassword,
      }),
      429,
    );
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

  it('creates versioned room-count layouts and applies owner-only revision-safe space settings', async () => {
    const owner = await account();
    const member = await account();
    const stranger = await account();
    const workspaceId = await workspace(owner, 20);
    const office = await tenancy.offices.findOne({ workspaceId }).lean();
    expect(office).toBeTruthy();
    const officeId = office!._id;
    const path = `/api/workspaces/${workspaceId}`;
    const officePath = `${path}/offices/${officeId}`;

    let detail = await owner.client.get(path);
    status(detail, 200);
    expect(officeWorkspaceDetailResponseSchema.parse(detail.body).workspace).toMatchObject({
      roomCount: 20,
      revision: 0,
    });
    const initialMap = await owner.client.get(officePath);
    status(initialMap, 200);
    expect(officeBootstrapResponseSchema.parse(initialMap.body)).toMatchObject({
      manifest: { mapId: 'workspace', roomCount: 20 },
      geometry: {
        zones: expect.arrayContaining([expect.objectContaining({ zoneId: 'workspace-room-020' })]),
      },
    });
    expect(initialMap.body.geometry.zones).toHaveLength(20);

    await join(owner, workspaceId, member);
    status(
      await member.client.send('patch', path, { name: 'Forbidden', expectedRevision: 0 }),
      403,
    );
    status(
      await member.client.send('patch', `${officePath}/rooms`, {
        roomCount: 3,
        expectedRevision: 0,
      }),
      403,
    );
    status(
      await stranger.client.send('patch', path, { name: 'Foreign', expectedRevision: 0 }),
      403,
    );

    const renameKey = randomUUID();
    const renamed = await owner.client.send(
      'patch',
      path,
      { name: 'New display name', expectedRevision: 0 },
      renameKey,
    );
    status(renamed, 200);
    expect(renamed.body).toMatchObject({ name: 'New display name', revision: 1 });
    expect(
      await owner.client.send(
        'patch',
        path,
        { name: 'New display name', expectedRevision: 0 },
        renameKey,
      ),
    ).toMatchObject({ body: renamed.body });
    const conflict = await owner.client.send('patch', path, {
      name: 'Stale overwrite',
      expectedRevision: 0,
    });
    status(conflict, 409);
    expect(conflict.body.error.code).toBe('revision_conflict');

    const membership = await tenancy.memberships
      .findOne({ workspaceId, userId: member.id, status: 'active' })
      .lean();
    const session = await identities.sessions
      .findOne({ userId: member.id, kind: 'authenticated', revokedAt: null })
      .lean();
    expect(membership).toBeTruthy();
    expect(session).toBeTruthy();
    const runtime = app.get(OfficeRuntimeService);
    const socketId = `room-count-test-${randomUUID()}`;
    const reservation = runtime.reserve(
      {
        userId: member.id,
        displayName: 'Member',
        sessionId: session!._id,
        membershipGrantId: membership!.membershipGrantId!,
        workspaceId,
        officeId,
        officeEpoch: app.get(OfficeEpochRegistry).forOffice(officeId),
        mapVersion: office!.mapVersion,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      },
      socketId,
    );
    const occupiedUpdate = await owner.client.send('patch', `${officePath}/rooms`, {
      roomCount: 25,
      expectedRevision: 1,
    });
    status(occupiedUpdate, 409);
    expect(occupiedUpdate.body.error.code).toBe('office_in_use');
    runtime.release(officeId, workspaceId, member.id, socketId, reservation.participationId);

    const roomKey = randomUUID();
    const changedRooms = await owner.client.send(
      'patch',
      `${officePath}/rooms`,
      { roomCount: 25, expectedRevision: 1 },
      roomKey,
    );
    status(changedRooms, 200);
    expect(changedRooms.body).toMatchObject({ roomCount: 25, revision: 2 });
    expect(
      await owner.client.send(
        'patch',
        `${officePath}/rooms`,
        { roomCount: 25, expectedRevision: 1 },
        roomKey,
      ),
    ).toMatchObject({ body: changedRooms.body });
    detail = await owner.client.get(path);
    expect(officeWorkspaceDetailResponseSchema.parse(detail.body).workspace).toMatchObject({
      name: 'New display name',
      roomCount: 25,
      revision: 2,
    });
    const updatedMap = await owner.client.get(officePath);
    status(updatedMap, 200);
    expect(officeBootstrapResponseSchema.parse(updatedMap.body)).toMatchObject({
      manifest: { mapId: 'workspace', roomCount: 25 },
    });
    expect(updatedMap.body.geometry.zones).toHaveLength(25);
    expect(updatedMap.body.geometry.zones[19]).toMatchObject({
      zoneId: 'workspace-room-020',
      bounds: initialMap.body.geometry.zones[19].bounds,
    });
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
    const approved = office!.mapVersion;
    const approvedManifest = trustedOfficeMap(approved)!.manifest;

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
        protocolVersion: OFFICE_PROTOCOL_VERSION,
        manifest: approvedManifest,
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
    expect(trustedOfficeMap(office?.mapVersion ?? '')?.manifest).toMatchObject({
      mapId: 'vivo',
    });
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
    expect(
      trustedOfficeMap((await tenancy.offices.findById(office!._id).lean())?.mapVersion ?? '')
        ?.manifest.mapId,
    ).toBe('vivo');
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
      await member.client.send('post', '/api/invitations/accept', {
        token: `${invitation.token.slice(0, 4).toLowerCase()} ${invitation.token.slice(4).toLowerCase()}`,
      }),
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
  it('continues to accept an already-issued long invitation token until its original expiry', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    const invitation = await invite(owner, workspaceId, member);
    const legacyToken = 'I'.repeat(43);
    await tenancy.invitations.updateOne(
      { _id: invitation.id },
      { $set: { tokenDigest: digest(legacyToken) } },
    );
    status(
      await member.client.send('post', '/api/invitations/accept', { token: legacyToken }),
      200,
    );
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
        { mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION },
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
        protocolVersion: OFFICE_PROTOCOL_VERSION,
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
        protocolVersion: OFFICE_PROTOCOL_VERSION,
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
        .send({ mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION }),
      403,
    );
    status(
      await request(app.getHttpServer())
        .post(path)
        .set('Cookie', owner.client.cookie)
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .send({ mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION }),
      403,
    );
    status(
      await owner.client.send(
        'post',
        `/api/workspaces/not-a-uuid/offices/${office!._id}/join-ticket`,
        { mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION },
      ),
      400,
    );
    status(
      await owner.client.send('post', path, {
        mapVersion: vivoManifest.mapVersion,
        protocolVersion: 1,
      }),
      400,
    );
    status(
      await owner.client.send('post', path, {
        mapVersion: vivoManifest.mapVersion,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
        extra: true,
      }),
      400,
    );
    status(
      await owner.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${otherOffice!._id}/join-ticket`,
        { mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION },
      ),
      404,
    );
    status(
      await owner.client.send('post', path, {
        mapVersion: `commons-v1-${'0'.repeat(64)}`,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      }),
      409,
    );
    expect(
      (
        await owner.client.send('post', path, {
          mapVersion: `commons-v1-${'0'.repeat(64)}`,
          protocolVersion: OFFICE_PROTOCOL_VERSION,
        })
      ).body.error.code,
    ).toBe('map_version_mismatch');

    await tenancy.offices.updateOne({ _id: office!._id }, { $set: { mapVersion: 'pending-m0' } });
    const pending = await owner.client.send('post', path, {
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
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
    const payload = {
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    };
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
      { mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION },
    );
    status(response, 201);
    const raw = joinTicketResponseSchema.parse(response.body).ticket;
    const scope = {
      workspaceId,
      officeId: office!._id,
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
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
      { mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION },
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
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    };
    const admission = app.get(OfficeAdmissionService);
    const issue = async () => {
      const response = await member.client.send('post', path, {
        mapVersion: vivoManifest.mapVersion,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
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
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    };
    const issue = async () => {
      const response = await member.client.send(
        'post',
        `/api/workspaces/${workspaceId}/offices/${office!._id}/join-ticket`,
        { mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION },
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
        email: member.email,
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
      { mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION },
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
      { mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION },
    );
    status(response, 201);
    const raw = joinTicketResponseSchema.parse(response.body).ticket;
    const admission = app.get(OfficeAdmissionService);
    const scope = {
      workspaceId,
      officeId: office!._id,
      mapVersion: vivoManifest.mapVersion,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
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
      protocolVersion: OFFICE_PROTOCOL_VERSION,
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
          protocolVersion: OFFICE_PROTOCOL_VERSION,
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

async function issueTicket(user: Awaited<ReturnType<typeof account>>, workspaceId: string) {
  const office = await tenancy.offices.findOne({ workspaceId }).lean();
  if (!office) throw new Error('Office missing');
  const response = await user.client.send(
    'post',
    `/api/workspaces/${workspaceId}/offices/${office._id}/join-ticket`,
    { mapVersion: vivoManifest.mapVersion, protocolVersion: OFFICE_PROTOCOL_VERSION },
  );
  status(response, 201);
  return {
    office,
    ticket: joinTicketResponseSchema.parse(response.body).ticket,
  };
}

describe('office socket admission', () => {
  it('admits a valid ticket and emits a safe contract-valid ready snapshot', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { office, ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
    const readyEvent = nextSocketEvent<unknown>(client, 'office:ready');
    try {
      await connectSocket(client);
      const ready = officeReadySchema.parse(await readyEvent);
      expect(ready).toMatchObject({
        workspaceId,
        officeId: office._id,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      });
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
      expect(ready.snapshot.participants[0]?.userId).toBe(owner.id);
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
    const ownerSocket = officeSocket({
      ticket: ownerTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
    const memberSocket = officeSocket({
      ticket: memberTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
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

  it('refuses to serve scoped chat without exact uniqueness, history and retention indexes', async () => {
    const models = app.get(ConversationModels);
    const config = app.get(ConfigService);
    const previous = config.get('DB_AUTO_INDEX');
    config.set('DB_AUTO_INDEX', 'false');
    const service = app.get(IndexesService);
    const indexes = await models.scopedMessages.collection.indexes();
    const unique = indexes.find((index) => index.unique && index.key['conversationKey'] === 1)!;
    const ttl = indexes.find((index) => index.expireAfterSeconds === 0)!;
    const history = indexes.find((index) => index.key['createdAt'] === -1)!;
    try {
      await models.scopedMessages.collection.dropIndex(unique.name!);
      await expect(service.onApplicationBootstrap()).rejects.toThrow(
        'space message idempotency index',
      );
      await models.createIndexes();
      await models.scopedMessages.collection.dropIndex(history.name!);
      await expect(service.onApplicationBootstrap()).rejects.toThrow('space message history index');
      await models.createIndexes();
      await models.scopedMessages.collection.dropIndex(ttl.name!);
      await expect(service.onApplicationBootstrap()).rejects.toThrow('space message TTL index');
    } finally {
      await models.createIndexes();
      config.set('DB_AUTO_INDEX', previous);
    }
  });

  it('isolates General, Social and private DMs, preserves legacy history and denies revoked members', async () => {
    const owner = await account();
    const member = await account();
    const bystander = await account();
    const outsider = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    await join(owner, workspaceId, bystander);
    const { office, ticket } = await issueTicket(owner, workspaceId);
    const memberTicket = (await issueTicket(member, workspaceId)).ticket;
    const bystanderTicket = (await issueTicket(bystander, workspaceId)).ticket;
    const sockets = [ticket, memberTicket, bystanderTicket].map((ticket) =>
      officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION }),
    );
    const received: SpaceMessage[][] = [[], [], []];
    const base = `/api/workspaces/${workspaceId}/offices/${office._id}`;
    const general = `${base}/channels/general/messages`;
    const social = `${base}/channels/social/messages`;
    const dm = (userId: string) => `${base}/direct-messages/${userId}/messages`;
    const send = async (
      client: typeof owner.client,
      path: string,
      text: string,
      clientMessageId = randomUUID(),
    ) => {
      const result = await client.send('post', path, { text, clientMessageId });
      status(result, 201);
      return spaceMessageSchema.parse(result.body.message);
    };
    try {
      for (const [index, socket] of sockets.entries()) {
        socket.on('space:message', (payload) =>
          received[index]!.push(spaceMessageSchema.parse(payload)),
        );
        const ready = nextSocketEvent<unknown>(socket, 'office:ready');
        await connectSocket(socket);
        await ready;
      }
      const legacy = await owner.client.send('post', `${base}/messages`, {
        clientMessageId: randomUUID(),
        text: 'Existing office history',
      });
      status(legacy, 201);
      const migrated = spaceMessagesResponseSchema.parse(
        (await member.client.get(general)).body,
      ).messages;
      expect(migrated).toEqual([
        { ...legacy.body.message, scope: { kind: 'channel', id: 'general' } },
      ]);

      const socialEvent = nextSocketEvent<unknown>(sockets[1]!, 'space:message');
      const retryId = randomUUID();
      const socialMessage = await send(owner.client, social, 'Social only', retryId);
      expect(await socialEvent).toEqual(socialMessage);
      expect(await send(owner.client, social, 'Social only', retryId)).toEqual(socialMessage);
      status(
        await owner.client.send('post', social, { clientMessageId: retryId, text: 'Changed' }),
        409,
      );
      const generalMessage = await send(owner.client, general, 'General only', retryId);
      expect(generalMessage.id).not.toBe(socialMessage.id);
      expect(
        spaceMessagesResponseSchema.parse((await member.client.get(social)).body).messages,
      ).toEqual([socialMessage]);
      expect(
        spaceMessagesResponseSchema.parse((await owner.client.get(general)).body).messages,
      ).not.toContainEqual(socialMessage);

      const privateEvent = nextSocketEvent<unknown>(sockets[1]!, 'space:message');
      const privateMessage = await send(owner.client, dm(member.id), 'Only the two of us', retryId);
      expect(await privateEvent).toEqual(privateMessage);
      expect(privateMessage.scope).toEqual({ kind: 'dm', userIds: [owner.id, member.id].sort() });
      expect(await send(owner.client, dm(member.id), 'Only the two of us', retryId)).toEqual(
        privateMessage,
      );
      status(
        await owner.client.send('post', dm(member.id), {
          clientMessageId: retryId,
          text: 'Changed private message',
        }),
        409,
      );
      const reply = await send(member.client, dm(owner.id), 'A private reply');
      for (const [client, peerId] of [
        [owner.client, member.id],
        [member.client, owner.id],
      ] as const) {
        expect(
          spaceMessagesResponseSchema.parse((await client.get(dm(peerId))).body).messages,
        ).toEqual([privateMessage, reply]);
      }
      expect(
        spaceMessagesResponseSchema.parse((await bystander.client.get(dm(member.id))).body)
          .messages,
      ).toEqual([]);
      expect(received[2]!.filter((message) => message.scope.kind === 'dm')).toEqual([]);
      status(await outsider.client.get(dm(owner.id)), 403);
      status(await owner.client.get(dm(outsider.id)), 404);
      status(
        await owner.client.send('post', dm(outsider.id), {
          clientMessageId: randomUUID(),
          text: 'Cross-space',
        }),
        404,
      );
      status(
        await owner.client.send('post', dm(member.id), {
          clientMessageId: randomUUID(),
          text: 'Forged',
          userIds: [owner.id, bystander.id],
        }),
        400,
      );
      status(await owner.client.get(`${base}/channels/unknown/messages`), 400);
      status(await owner.client.get(dm(owner.id)), 400);
      const stored = await app
        .get(ConversationModels)
        .scopedMessages.findById(privateMessage.id)
        .lean();
      expect(stored!.expiresAt.getTime() - stored!.createdAt.getTime()).toBe(
        90 * 24 * 60 * 60 * 1000,
      );
      await app.get(ConversationModels).scopedMessages.create({
        ...stored!,
        _id: randomUUID(),
        clientMessageId: randomUUID(),
        text: 'Expired',
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(
        spaceMessagesResponseSchema.parse((await owner.client.get(dm(member.id))).body).messages,
      ).toEqual([privateMessage, reply]);

      status(
        await owner.client.send('delete', `/api/workspaces/${workspaceId}/members/${member.id}`),
        200,
      );
      status(await member.client.get(general), 403);
      status(await member.client.get(social), 403);
      status(await member.client.get(dm(owner.id)), 403);
      status(
        await member.client.send('post', dm(owner.id), {
          clientMessageId: randomUUID(),
          text: 'After removal',
        }),
        403,
      );
      status(await owner.client.get(dm(member.id)), 404);
      status(
        await owner.client.send('post', dm(member.id), {
          clientMessageId: randomUUID(),
          text: 'Removed recipient',
        }),
        404,
      );
      const afterRevocation = nextSocketEvent<unknown>(sockets[2]!, 'space:message');
      const after = await send(owner.client, social, 'After removal');
      expect(await afterRevocation).toEqual(after);
      expect(received[1]!.some((message) => message.id === after.id)).toBe(false);
    } finally {
      for (const socket of sockets) socket.disconnect();
    }
  });

  it('moves only by server intent and broadcasts ordered state to another client', async () => {
    const owner = await account();
    const member = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    const { ticket: ownerTicket } = await issueTicket(owner, workspaceId);
    const { ticket: memberTicket } = await issueTicket(member, workspaceId);
    const ownerSocket = officeSocket({
      ticket: ownerTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
    const memberSocket = officeSocket({
      ticket: memberTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
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
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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

  it('routes live waves within the current office and allows repeated greetings with bounded bursts', async () => {
    const owner = await account();
    const member = await account();
    const observer = await account();
    const otherOwner = await account();
    const workspaceId = await workspace(owner);
    const otherWorkspaceId = await workspace(otherOwner);
    await join(owner, workspaceId, member);
    await join(owner, workspaceId, observer);
    const [{ ticket: ownerTicket }, { ticket: memberTicket }, { ticket: observerTicket }] =
      await Promise.all([
        issueTicket(owner, workspaceId),
        issueTicket(member, workspaceId),
        issueTicket(observer, workspaceId),
      ]);
    const { ticket: otherTicket } = await issueTicket(otherOwner, otherWorkspaceId);
    const ownerSocket = officeSocket({
      ticket: ownerTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
    const memberSocket = officeSocket({
      ticket: memberTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
    const observerSocket = officeSocket({
      ticket: observerTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
    const otherSocket = officeSocket({
      ticket: otherTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
    const received: unknown[] = [];
    ownerSocket.on('office:wave', (event) => received.push(event));
    memberSocket.on('office:wave', (event) => received.push(event));
    observerSocket.on('office:wave', (event) => received.push(event));
    try {
      // Keep the monotonic clock past the replay window while sockets connect and wave commands race.
      const lateNow = performance.now() + 90_000;
      const lateClock = vi.spyOn(performance, 'now').mockReturnValue(lateNow);
      const ownerReadyEvent = nextSocketEvent<unknown>(ownerSocket, 'office:ready');
      await connectSocket(ownerSocket);
      const ownerReady = officeReadySchema.parse(await ownerReadyEvent);
      const memberReadyEvent = nextSocketEvent<unknown>(memberSocket, 'office:ready');
      await connectSocket(memberSocket);
      const memberReady = officeReadySchema.parse(await memberReadyEvent);
      const observerReadyEvent = nextSocketEvent<unknown>(observerSocket, 'office:ready');
      await connectSocket(observerSocket);
      const observerReady = officeReadySchema.parse(await observerReadyEvent);
      const otherReadyEvent = nextSocketEvent<unknown>(otherSocket, 'office:ready');
      await connectSocket(otherSocket);
      const otherReady = officeReadySchema.parse(await otherReadyEvent);

      const command = {
        eventId: randomUUID(),
        officeEpoch: ownerReady.snapshot.officeEpoch,
        payload: { targetParticipationId: memberReady.participationId },
      };
      const waveEvent = nextSocketEvent<unknown>(memberSocket, 'office:wave');
      const firstAck = new Promise<unknown>((resolve) =>
        ownerSocket.emit('office:wave', command, resolve),
      );
      const replayAck = new Promise<unknown>((resolve) =>
        ownerSocket.emit('office:wave', command, resolve),
      );
      const notice = officeWaveSchema.parse(await waveEvent);
      expect(notice).toMatchObject({
        eventId: command.eventId,
        senderParticipationId: ownerReady.participationId,
        senderName: 'Test Person',
        recipientParticipationId: memberReady.participationId,
      });
      expect(officeCommandAckSchema.parse(await firstAck)).toMatchObject({
        eventId: command.eventId,
        ok: true,
      });
      expect(officeCommandAckSchema.parse(await replayAck)).toMatchObject({
        eventId: command.eventId,
        ok: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(received).toHaveLength(3);

      const spam = {
        eventId: randomUUID(),
        officeEpoch: ownerReady.snapshot.officeEpoch,
        payload: { targetParticipationId: memberReady.participationId },
      };
      const spamAck = await new Promise<unknown>((resolve) =>
        ownerSocket.emit('office:wave', spam, resolve),
      );
      expect(officeCommandAckSchema.parse(spamAck)).toMatchObject({
        eventId: spam.eventId,
        ok: true,
      });

      // A fresh sender can send multiple greetings concurrently; replay protection stays atomic.
      const ownerWave = nextSocketEvent<unknown>(ownerSocket, 'office:wave');
      const burst = [randomUUID(), randomUUID()].map((eventId) => ({
        eventId,
        officeEpoch: ownerReady.snapshot.officeEpoch,
        payload: { targetParticipationId: ownerReady.participationId },
      }));
      const burstAcks = await Promise.all(
        burst.map(
          (event) =>
            new Promise<unknown>((resolve) => observerSocket.emit('office:wave', event, resolve)),
        ),
      );
      const parsedAcks = burstAcks.map((ack) => officeCommandAckSchema.parse(ack));
      expect(
        parsedAcks.filter((ack) => ack.ok),
        JSON.stringify(parsedAcks),
      ).toHaveLength(2);
      expect(parsedAcks.filter((ack) => !ack.ok && ack.error.code === 'rate_limited')).toHaveLength(
        0,
      );
      expect(officeWaveSchema.parse(await ownerWave)).toMatchObject({
        senderParticipationId: observerReady.participationId,
        recipientParticipationId: ownerReady.participationId,
      });
      const floodAcks = await Promise.all(
        Array.from(
          { length: 10 },
          () =>
            new Promise<unknown>((resolve) =>
              observerSocket.emit(
                'office:wave',
                {
                  ...burst[0],
                  eventId: randomUUID(),
                },
                resolve,
              ),
            ),
        ),
      );
      const flood = floodAcks.map((ack) => officeCommandAckSchema.parse(ack));
      expect(flood.filter((ack) => ack.ok)).toHaveLength(6);
      expect(flood.filter((ack) => !ack.ok && ack.error.code === 'rate_limited')).toHaveLength(4);
      lateClock.mockReturnValue(lateNow + 1001);
      const recovered = await new Promise<unknown>((resolve) =>
        observerSocket.emit(
          'office:wave',
          {
            ...burst[0],
            eventId: randomUUID(),
          },
          resolve,
        ),
      );
      expect(officeCommandAckSchema.parse(recovered).ok).toBe(true);
      lateClock.mockRestore();

      const offlineId = memberReady.participationId;
      const memberRemoved = nextSocketEvent<unknown>(ownerSocket, 'world:delta');
      memberSocket.disconnect();
      await memberRemoved;
      const offline = {
        eventId: randomUUID(),
        officeEpoch: ownerReady.snapshot.officeEpoch,
        payload: { targetParticipationId: offlineId },
      };
      const offlineAck = await new Promise<unknown>((resolve) =>
        ownerSocket.emit('office:wave', offline, resolve),
      );
      expect(officeCommandAckSchema.parse(offlineAck)).toMatchObject({
        eventId: offline.eventId,
        ok: false,
        error: { code: 'conflict' },
      });
      const crossOffice = {
        eventId: randomUUID(),
        officeEpoch: ownerReady.snapshot.officeEpoch,
        payload: { targetParticipationId: otherReady.participationId },
      };
      const crossOfficeAck = await new Promise<unknown>((resolve) =>
        ownerSocket.emit('office:wave', crossOffice, resolve),
      );
      expect(officeCommandAckSchema.parse(crossOfficeAck)).toMatchObject({
        eventId: crossOffice.eventId,
        ok: false,
        error: { code: 'conflict' },
      });
    } finally {
      ownerSocket.disconnect();
      memberSocket.disconnect();
      observerSocket.disconnect();
      otherSocket.disconnect();
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
      const firstSocket = officeSocket({
        ticket: firstTicket,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      });
      const secondSocket = officeSocket({
        ticket: secondTicket,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      });
      const observerSocket = officeSocket({
        ticket: observerTicket,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      });
      const observerNotices: unknown[] = [];
      let applicationGuard: ApplicationGuard | undefined;
      let mediaUpstream: ReturnType<typeof createServer> | undefined;
      let mediaFixture: Awaited<ReturnType<typeof startViteMediaFixture>> | undefined;
      let liveKitFixture: Awaited<ReturnType<typeof startLiveKitFixture>> | undefined;
      let applicationMediaClient: ApplicationMediaClient | undefined;
      let crossCompanyMediaClient: ApplicationMediaClient | undefined;
      let retirementDirectory: string | undefined;
      let crossCompanyOwner: Awaited<ReturnType<typeof account>> | undefined;
      let crossCompanyMember: Awaited<ReturnType<typeof account>> | undefined;
      let crossCompanyWorkspaceId: string | undefined;
      let crossCompanyOwnerSocket: Socket | undefined;
      let crossCompanyMemberSocket: Socket | undefined;
      let crossCompanyOwnerReady: ReturnType<typeof officeReadySchema.parse> | undefined;
      let crossCompanyMemberReady: ReturnType<typeof officeReadySchema.parse> | undefined;
      let crossCompanyJoining: ReturnType<typeof conversationUpdateSchema.parse> | undefined;
      let crossCompanyActive: ReturnType<typeof conversationUpdateSchema.parse> | undefined;
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

        if (runMediaCrossCompany) {
          crossCompanyOwner = await account();
          crossCompanyMember = await account();
          crossCompanyWorkspaceId = await workspace(crossCompanyOwner);
          await join(crossCompanyOwner, crossCompanyWorkspaceId, crossCompanyMember);
          const [ownerTicket, memberTicket] = await Promise.all([
            issueTicket(crossCompanyOwner, crossCompanyWorkspaceId),
            issueTicket(crossCompanyMember, crossCompanyWorkspaceId),
          ]);
          crossCompanyOwnerSocket = officeSocket({
            ticket: ownerTicket.ticket,
            protocolVersion: OFFICE_PROTOCOL_VERSION,
          });
          crossCompanyMemberSocket = officeSocket({
            ticket: memberTicket.ticket,
            protocolVersion: OFFICE_PROTOCOL_VERSION,
          });
          const crossOwnerReadyEvent = nextSocketEvent<unknown>(
            crossCompanyOwnerSocket,
            'office:ready',
          );
          await connectSocket(crossCompanyOwnerSocket);
          crossCompanyOwnerReady = officeReadySchema.parse(await crossOwnerReadyEvent);
          const crossMemberReadyEvent = nextSocketEvent<unknown>(
            crossCompanyMemberSocket,
            'office:ready',
          );
          await connectSocket(crossCompanyMemberSocket);
          crossCompanyMemberReady = officeReadySchema.parse(await crossMemberReadyEvent);
        }

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
        const crossCompanyOwnerJoinNotice = crossCompanyOwnerSocket
          ? nextSocketEvent<unknown>(crossCompanyOwnerSocket, 'conversation:update')
          : undefined;
        const crossCompanyMemberJoinNotice = crossCompanyMemberSocket
          ? nextSocketEvent<unknown>(crossCompanyMemberSocket, 'conversation:update')
          : undefined;
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
        if (
          crossCompanyOwnerSocket &&
          crossCompanyMemberSocket &&
          crossCompanyOwnerReady &&
          crossCompanyMemberReady &&
          crossCompanyOwnerJoinNotice &&
          crossCompanyMemberJoinNotice
        ) {
          const ownerOptIn = {
            eventId: randomUUID(),
            officeEpoch: crossCompanyOwnerReady.snapshot.officeEpoch,
            payload: { enabled: true },
          };
          const ownerOptInAck = await new Promise<unknown>((resolve) => {
            crossCompanyOwnerSocket!.emit('proximity:set-opt-in', ownerOptIn, resolve);
          });
          expect(officeCommandAckSchema.parse(ownerOptInAck)).toMatchObject({ ok: true });
          const memberOptIn = {
            eventId: randomUUID(),
            officeEpoch: crossCompanyMemberReady.snapshot.officeEpoch,
            payload: { enabled: true },
          };
          const memberOptInAck = await new Promise<unknown>((resolve) => {
            crossCompanyMemberSocket!.emit('proximity:set-opt-in', memberOptIn, resolve);
          });
          expect(officeCommandAckSchema.parse(memberOptInAck)).toMatchObject({ ok: true });
          crossCompanyJoining = conversationUpdateSchema.parse(await crossCompanyOwnerJoinNotice);
          expect(conversationUpdateSchema.parse(await crossCompanyMemberJoinNotice)).toEqual(
            crossCompanyJoining,
          );
          expect(crossCompanyJoining).toMatchObject({
            kind: 'proximity',
            state: 'joining',
            version: 1,
            mediaReady: false,
          });
        }
        const joining = conversationUpdateSchema.parse(await firstJoinNotice);
        expect(conversationUpdateSchema.parse(await secondJoinNotice)).toEqual(joining);
        if (crossCompanyJoining)
          expect(crossCompanyJoining.conversationId).not.toBe(joining.conversationId);
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
        const expectedPermitIdentities = [
          firstReady.participationId,
          secondReady.participationId,
          ...(crossCompanyOwnerReady ? [crossCompanyOwnerReady.participationId] : []),
          ...(crossCompanyMemberReady ? [crossCompanyMemberReady.participationId] : []),
        ];
        expect(snapshot.permits).toHaveLength(expectedPermitIdentities.length);
        expect(snapshot.permits.map(({ identity }) => identity).sort()).toEqual(
          expectedPermitIdentities.sort(),
        );
        const expectedGenerations = new Set([
          joining.generation,
          ...(crossCompanyJoining ? [crossCompanyJoining.generation] : []),
        ]);
        for (const permit of snapshot.permits) {
          expect(expectedGenerations.has(permit.generation)).toBe(true);
          expect(permit.room).toBe(permit.generation);
          expect(permit.version).toBe(1);
          expect(permit.sources).toEqual(['microphone']);
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
        const crossCompanyOwnerActiveNotice = crossCompanyOwnerSocket
          ? nextSocketEvent<unknown>(crossCompanyOwnerSocket, 'conversation:update')
          : undefined;
        const crossCompanyMemberActiveNotice = crossCompanyMemberSocket
          ? nextSocketEvent<unknown>(crossCompanyMemberSocket, 'conversation:update')
          : undefined;
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
        if (crossCompanyOwnerActiveNotice && crossCompanyMemberActiveNotice) {
          crossCompanyActive = conversationUpdateSchema.parse(await crossCompanyOwnerActiveNotice);
          expect(conversationUpdateSchema.parse(await crossCompanyMemberActiveNotice)).toEqual(
            crossCompanyActive,
          );
          expect(crossCompanyActive).toMatchObject({
            conversationId: crossCompanyJoining?.conversationId,
            generation: crossCompanyJoining?.generation,
            kind: 'proximity',
            state: 'active',
            version: 2,
            mediaReady: true,
          });
          expect(crossCompanyActive.generation).not.toBe(active.generation);
        }

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
        const crossCompanyMediaGrants: Array<{
          serverUrl: string;
          token: string;
          conversationVersion: number;
          generation: string;
          identity: string;
        }> = [];
        if (
          crossCompanyActive &&
          crossCompanyOwner &&
          crossCompanyMember &&
          crossCompanyOwnerReady &&
          crossCompanyMemberReady
        ) {
          for (const [companyAccount, ready] of [
            [crossCompanyOwner, crossCompanyOwnerReady],
            [crossCompanyMember, crossCompanyMemberReady],
          ] as const) {
            const crossIssued = await companyAccount.client.send(
              'post',
              `/api/conversations/${crossCompanyActive.conversationId}/media-token`,
              {
                participationId: ready.participationId,
                conversationVersion: crossCompanyActive.version,
              },
            );
            status(crossIssued, 200);
            const crossGrant = mediaTokenResponseSchema.parse(crossIssued.body);
            const crossClaims = await new TokenVerifier(livekitApiKey, livekitApiSecret).verify(
              crossGrant.token,
              0,
            );
            expect(crossClaims.sub).toBe(ready.participationId);
            expect(crossClaims.video?.room).toBe(crossCompanyActive.generation);
            applicationTokenExpiries.push(crossClaims.exp);
            crossCompanyMediaGrants.push({ ...crossGrant, identity: ready.participationId });
          }
        }

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
        let latestGuardSequence = firstGuardAck.sequence!;
        const tokenValidationUrl = new URL(`http://127.0.0.1:${guardPort}/rtc/v1/validate`);
        tokenValidationUrl.searchParams.set('access_token', mediaGrant.token);
        tokenValidationUrl.searchParams.set(
          'join_request',
          Buffer.from(JSON.stringify({ protocol: 12 })).toString('base64url'),
        );
        const validateTokenThroughGuard = async (token: string, stage: string) => {
          try {
            const validationUrl = new URL(tokenValidationUrl);
            validationUrl.searchParams.set('access_token', token);
            return await fetch(validationUrl, {
              headers: { Origin: mediaFixture?.origin ?? origin },
            });
          } catch (error) {
            throw new Error(
              `guard validation failed at ${stage} (port=${guardPort}, exit=${applicationGuard?.child.exitCode}, stderr=${applicationGuard?.getStderr().slice(-500) ?? 'stopped'})`,
              { cause: error },
            );
          }
        };
        const validateThroughGuard = (stage: string) =>
          validateTokenThroughGuard(mediaGrant.token, stage);
        let secondMediaGrantToken: string | undefined;
        let refreshedMediaGrantToken: string | undefined;
        let permissionScenarioRoomService: RoomServiceClient | undefined;
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
            ...(runMediaPermissionDenied ? { denyMicrophoneIndex: 1 } : {}),
            forceRelay: runMediaTurnOnly,
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
            error: string;
            remoteIdentities: string[];
            activeAudioSamples: number;
            gatheredCandidateTypes: string[];
            iceStates: string[];
          }>;
          expect(observations).toHaveLength(2);
          if (runMediaTurnOnly) {
            expect(
              observations.every(
                ({ gatheredCandidateTypes, iceStates }) =>
                  gatheredCandidateTypes.length > 0 &&
                  gatheredCandidateTypes.every((type) => type === 'relay') &&
                  iceStates.includes('connection:connected'),
              ),
            ).toBe(true);
            console.info(
              `CP08.7 TURN-only media: ${JSON.stringify({
                clients: observations.map(
                  ({ gatheredCandidateTypes, iceStates, activeAudioSamples }) => ({
                    candidateTypes: gatheredCandidateTypes,
                    iceConnected: iceStates.includes('connection:connected'),
                    decodedAudioSamples: activeAudioSamples,
                  }),
                ),
              })}`,
            );
          }
          if (runMediaPermissionDenied) {
            permissionScenarioRoomService = new RoomServiceClient(
              `http://127.0.0.1:${liveKitFixture!.signalingPort}`,
              livekitApiKey,
              livekitApiSecret,
            );
            await vi.waitFor(
              async () => {
                const participants = await permissionScenarioRoomService!.listParticipants(
                  active.generation,
                );
                expect(participants.map(({ identity }) => identity)).toEqual([
                  firstReady.participationId,
                ]);
              },
              { timeout: 5000, interval: 50 },
            );
            expect(observations[0]?.status).toBe('live');
            expect(observations[1]?.status).toBe('muted');
            expect(observations[1]?.error).toContain('Microphone access was denied');
            expect(observations[0]?.remoteIdentities).not.toContain(secondReady.participationId);
            console.info(
              `CP08.5 microphone permission denial: ${JSON.stringify({
                allowedParticipantLive: observations[0]?.status === 'live',
                deniedParticipantStatus: observations[1]?.status,
                denialMappedToRecoveryMessage: observations[1]?.error.includes(
                  'Microphone access was denied',
                ),
                deniedParticipantAbsentFromPeerRemoteTracks:
                  !observations[0]?.remoteIdentities.includes(secondReady.participationId),
                sfuParticipants: [firstReady.participationId],
                officeSocketStillConnected: secondSocket.connected,
              })}`,
            );
          } else {
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
            if (runMediaWeakNetwork) {
              const initialQdisc = await liveKitFixture!.applyWeakNetwork();
              expect(initialQdisc).toContain('qdisc netem');
              try {
                applicationMediaClient.send({ kind: 'exercise-weak-network' });
                const weakNetwork = await waitForApplicationMediaMessage(
                  applicationMediaClient,
                  (message) => message['kind'] === 'weak-network',
                  'real audio to stay connected during delayed and dropped SFU egress',
                );
                const networkStats = await liveKitFixture!.readWeakNetworkStats();
                const droppedPackets = Number(networkStats.match(/dropped\s+(\d+)/)?.[1] ?? 0);
                expect(droppedPackets).toBeGreaterThan(0);
                expect(weakNetwork['clients']).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({
                      status: 'live',
                      connected: true,
                      peerPresent: true,
                      sawReconnect: false,
                    }),
                    expect.objectContaining({
                      status: 'live',
                      connected: true,
                      peerPresent: true,
                      sawReconnect: false,
                    }),
                  ]),
                );
                console.info(
                  `CP08.7 weak-network media: ${JSON.stringify({
                    configured: '120ms delay ±40ms jitter, 3% SFU egress loss',
                    actualDroppedPackets: droppedPackets,
                    clients: weakNetwork['clients'],
                  })}`,
                );
              } finally {
                await liveKitFixture!.clearWeakNetwork();
              }
            }
            if (
              runMediaCrossCompany &&
              crossCompanyActive &&
              crossCompanyOwnerReady &&
              crossCompanyMemberReady &&
              crossCompanyOwnerSocket &&
              crossCompanyMemberSocket &&
              crossCompanyMediaGrants.length === 2
            ) {
              crossCompanyMediaClient = startApplicationMediaClient({
                fixtureUrl: mediaFixture!.url,
                grants: crossCompanyMediaGrants,
              });
              const crossConnected = await waitForApplicationMediaMessage(
                crossCompanyMediaClient,
                (message) => message['kind'] === 'connected',
                'two real audio subscriptions from the second company',
              );
              const crossObservations = crossConnected['observations'] as Array<{
                status: string;
                remoteIdentities: string[];
                activeAudioSamples: number;
              }>;
              expect(crossObservations).toHaveLength(2);
              expect(crossObservations[0]).toMatchObject({
                status: 'live',
                remoteIdentities: [crossCompanyMemberReady.participationId],
              });
              expect(crossObservations[1]).toMatchObject({
                status: 'live',
                remoteIdentities: [crossCompanyOwnerReady.participationId],
              });
              expect(
                crossObservations.every(({ activeAudioSamples }) => activeAudioSamples >= 10),
              ).toBe(true);
              const companyAIdentities = new Set([
                firstReady.participationId,
                secondReady.participationId,
              ]);
              const companyBIdentities = new Set([
                crossCompanyOwnerReady.participationId,
                crossCompanyMemberReady.participationId,
              ]);
              expect(
                observations.every(({ remoteIdentities }) =>
                  remoteIdentities.every((identity) => !companyBIdentities.has(identity)),
                ),
              ).toBe(true);
              expect(
                crossObservations.every(({ remoteIdentities }) =>
                  remoteIdentities.every((identity) => !companyAIdentities.has(identity)),
                ),
              ).toBe(true);
              const roomService = new RoomServiceClient(
                `http://127.0.0.1:${liveKitFixture!.signalingPort}`,
                livekitApiKey,
                livekitApiSecret,
              );
              await vi.waitFor(
                async () => {
                  const [companyAParticipants, companyBParticipants] = await Promise.all([
                    roomService.listParticipants(active.generation),
                    roomService.listParticipants(crossCompanyActive!.generation),
                  ]);
                  expect(companyAParticipants.map(({ identity }) => identity).sort()).toEqual(
                    [...companyAIdentities].sort(),
                  );
                  expect(companyBParticipants.map(({ identity }) => identity).sort()).toEqual(
                    [...companyBIdentities].sort(),
                  );
                },
                { timeout: 5000, interval: 50 },
              );
              const companyBOwnerEnded = nextSocketEvent<unknown>(
                crossCompanyOwnerSocket,
                'conversation:update',
              );
              const companyBMemberEnded = nextSocketEvent<unknown>(
                crossCompanyMemberSocket,
                'conversation:update',
              );
              const companyBLeave = {
                eventId: randomUUID(),
                officeEpoch: crossCompanyOwnerReady.snapshot.officeEpoch,
                payload: {
                  conversationId: crossCompanyActive.conversationId,
                  conversationVersion: crossCompanyActive.version,
                },
              };
              const companyBLeaveAck = await new Promise<unknown>((resolve) => {
                crossCompanyOwnerSocket!.emit('conversation:leave', companyBLeave, resolve);
              });
              expect(officeCommandAckSchema.parse(companyBLeaveAck)).toMatchObject({ ok: true });
              const companyBEnded = conversationUpdateSchema.parse(await companyBOwnerEnded);
              expect(conversationUpdateSchema.parse(await companyBMemberEnded)).toEqual(
                companyBEnded,
              );
              expect(companyBEnded).toMatchObject({
                conversationId: crossCompanyActive.conversationId,
                state: 'ended',
                mediaReady: false,
                participants: [],
              });
              const companyBPolicyAck = await waitForGuardMessage(
                applicationGuard,
                (message) => message.kind === 'ack' && message.sequence! > latestGuardSequence,
                'company B media permits to be removed while company A remains active',
              );
              latestGuardSequence = companyBPolicyAck.sequence!;
              crossCompanyMediaClient.send({ kind: 'stop' });
              const companyBCutoff = await waitForApplicationMediaMessage(
                crossCompanyMediaClient,
                (message) => message['kind'] === 'cutoff',
                'company B media to stop after its conversation ended',
              );
              expect(companyBCutoff['stable']).toBe(true);
              const remainingCompanyAParticipants = await roomService.listParticipants(
                active.generation,
              );
              expect(remainingCompanyAParticipants.map(({ identity }) => identity).sort()).toEqual(
                [...companyAIdentities].sort(),
              );
              await stopApplicationMediaClient(crossCompanyMediaClient);
              crossCompanyMediaClient = undefined;
              console.info(
                `CP08.7 cross-company media isolation: ${JSON.stringify({
                  companyARoomParticipants: remainingCompanyAParticipants.length,
                  companyBRoomParticipantsBeforeLeave: companyBIdentities.size,
                  crossCompanyRemoteTracks: 0,
                  companyAStayedLiveAfterCompanyBEnded: true,
                  companyBMediaCutoffStable: companyBCutoff['stable'],
                })}`,
              );
            }
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
            if (runMediaTokenRefresh) {
              applicationMediaClient.send({ kind: 'token-refresh-count' });
              const refreshBaselineMessage = await waitForApplicationMediaMessage(
                applicationMediaClient,
                (message) => message['kind'] === 'token-refresh-count',
                'the current SDK token-refresh event count',
              );
              const refreshBaseline = refreshBaselineMessage['count'] as number;
              const roomService = new RoomServiceClient(
                `http://127.0.0.1:${liveKitFixture!.signalingPort}`,
                livekitApiKey,
                livekitApiSecret,
              );
              await roomService.updateParticipant(active.generation, secondReady.participationId, {
                metadata: JSON.stringify({ refresh: randomUUID() }),
              });
              applicationMediaClient.send({
                kind: 'read-refreshed-token',
                afterCount: refreshBaseline,
              });
              const tokenMessage = await waitForApplicationMediaMessage(
                applicationMediaClient,
                (message) => message['kind'] === 'refreshed-token',
                'the SFU-refreshed production SDK token',
              );
              refreshedMediaGrantToken = tokenMessage['token'] as string;
              expect(typeof refreshedMediaGrantToken).toBe('string');
              expect(refreshedMediaGrantToken !== secondMediaGrantToken).toBe(true);
              expect(tokenMessage['count'] as number).toBeGreaterThan(refreshBaseline);
              const refreshedClaims = await new TokenVerifier(
                livekitApiKey,
                livekitApiSecret,
              ).verify(refreshedMediaGrantToken, 0);
              expect(refreshedClaims.sub).toBe(secondReady.participationId);
              expect(refreshedClaims.exp).toBeGreaterThan(Date.now() / 1000);
              expect(refreshedClaims.video).toMatchObject({
                room: active.generation,
                roomJoin: true,
                canPublish: true,
                canPublishSources: ['microphone'],
                canSubscribe: true,
                canPublishData: false,
                canUpdateOwnMetadata: false,
              });
              expect(refreshedClaims.video?.roomAdmin ?? false).toBe(false);
              applicationMediaClient.send({
                kind: 'exercise-token-reconnect',
                token: refreshedMediaGrantToken,
              });
              const refreshedReconnect = await waitForApplicationMediaMessage(
                applicationMediaClient,
                (message) => message['kind'] === 'token-reconnect',
                'a production LiveKit session reconnecting with the refreshed token',
              );
              expect(refreshedReconnect['live']).toBe(true);
              expect(refreshedReconnect['remoteIdentityPresent']).toBe(true);
              expect(refreshedReconnect['resumedSamples'] as number).toBeGreaterThan(5);
              console.info(
                `CP08.5 SFU token refresh: ${JSON.stringify({
                  originalExp: (
                    await new TokenVerifier(livekitApiKey, livekitApiSecret).verify(
                      secondMediaGrantToken!,
                      0,
                    )
                  ).exp,
                  refreshedExp: refreshedClaims.exp,
                  acceptedByGuardAndSfu: refreshedReconnect['live'] === true,
                  resumedSamples: refreshedReconnect['resumedSamples'],
                  roomAndMicrophoneGrantsPreserved: true,
                })}`,
              );
            }
            if (runMediaReconnect) {
              applicationMediaClient.send({ kind: 'exercise-reconnect' });
              await waitForApplicationMediaMessage(
                applicationMediaClient,
                (message) => message['kind'] === 'reconnect-armed',
                'the LiveKit reconnect observer',
              );
              const restartRequestedAt = Date.now();
              await liveKitFixture!.restartInPlace();
              const reconnect = await waitForApplicationMediaMessage(
                applicationMediaClient,
                (message) => message['kind'] === 'media-reconnect',
                'both production media sessions to reconnect and resume audio',
              );
              console.info(
                `CP08.5 SFU reconnect: ${JSON.stringify({
                  restartToRecoveredAudioMs: Date.now() - restartRequestedAt,
                  reconnecting: reconnect['reconnecting'],
                  live: reconnect['live'],
                  activeAudioSamples: reconnect['activeAudioSamples'],
                  statuses: reconnect['statuses'],
                })}`,
              );
              expect(reconnect['reconnecting']).toBe(true);
              expect(reconnect['live']).toBe(true);
            }
          }
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
        status(
          await observer.client.send('post', tokenPath, {
            participationId: firstReady.participationId,
            conversationVersion: active.version,
          }),
          404,
        );
        const foreignOwner = crossCompanyOwner ?? (await account());
        if (!crossCompanyOwner) await workspace(foreignOwner);
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
        const mediaRevocationStartedAt = Date.now();
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
          applicationMediaClient.send({
            kind: 'expect-server-cutoff',
            startedAt: mediaRevocationStartedAt,
          });
          const measured = await waitForApplicationMediaMessage(
            applicationMediaClient,
            (message) => message['kind'] === 'server-cutoff',
            'the measured real audio cutoff after conversation leave',
          );
          expect(measured['stable']).toBe(true);
          if (runMediaPermissionDenied) {
            expect(
              (measured['observations'] as Array<{ status: string }>).every(
                ({ status: mediaStatus }) => mediaStatus === 'off',
              ),
            ).toBe(true);
            const participants = await permissionScenarioRoomService!.listParticipants(
              active.generation,
            );
            expect(participants).toHaveLength(0);
            console.info(
              `CP08.5 denied-media cleanup: ${JSON.stringify({
                bothSessionsStopped: true,
                remainingSfuParticipants: participants.length,
              })}`,
            );
          } else {
            expect(measured['cutoffMs']).toEqual(expect.any(Number));
            expect(measured['cutoffMs'] as number).toBeLessThanOrEqual(2000);
            const roomService = new RoomServiceClient(
              `http://127.0.0.1:${liveKitFixture!.signalingPort}`,
              livekitApiKey,
              livekitApiSecret,
            );
            const retiredParticipants = await roomService
              .listParticipants(active.generation)
              .catch(() => []);
            expect(retiredParticipants).toHaveLength(0);
            console.info(
              `CP08.4 media cutoff: ${JSON.stringify({
                trigger: mediaEndScenario,
                cutoffMs: measured['cutoffMs'],
                activeSamples: (
                  measured['observations'] as Array<{ activeAudioSamples: number }>
                ).map(({ activeAudioSamples }) => activeAudioSamples),
                remoteTracks: measured['remoteTracks'],
                serverParticipantsAfterRevocation: retiredParticipants.length,
                stable: measured['stable'],
              })}`,
            );
          }
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
        if (refreshedMediaGrantToken) {
          const refreshedClaims = await new TokenVerifier(livekitApiKey, livekitApiSecret).verify(
            refreshedMediaGrantToken,
            0,
          );
          expect(refreshedClaims.exp).toEqual(expect.any(Number));
          expect(refreshedClaims.exp!).toBeGreaterThan(Date.now() / 1000);
        }
        const restartedGuardResponse = await vi.waitFor(
          async () => {
            const response = await validateThroughGuard('after-guard-restart');
            expect(response.status).toBe(403);
            return response;
          },
          { timeout: 5000, interval: 50 },
        );
        expect(restartedGuardResponse.status).toBe(403);
        if (runMediaTokenRefresh && refreshedMediaGrantToken) {
          const refreshedAfterRestart = await validateTokenThroughGuard(
            refreshedMediaGrantToken,
            'refreshed-token-after-guard-restart',
          );
          expect(refreshedAfterRestart.status).toBe(403);
          expect(forwardedSignalingPaths).toHaveLength(forwardedBeforeDeniedReplay);
        }
        if (secondMediaGrantToken) {
          expect(
            (
              await validateTokenThroughGuard(
                secondMediaGrantToken,
                'second-token-after-guard-restart',
              )
            ).status,
          ).toBe(403);
        }
        expect(forwardedSignalingPaths).toHaveLength(forwardedBeforeDeniedReplay);
      } finally {
        if (crossCompanyMediaClient) await stopApplicationMediaClient(crossCompanyMediaClient);
        if (applicationMediaClient) await stopApplicationMediaClient(applicationMediaClient);
        if (applicationGuard) await stopApplicationGuard(applicationGuard);
        if (mediaUpstream) await closeHttpServer(mediaUpstream);
        if (mediaFixture) await mediaFixture.stop();
        if (liveKitFixture) await liveKitFixture.stop();
        if (retirementDirectory) await rm(retirementDirectory, { recursive: true, force: true });
        firstSocket.disconnect();
        secondSocket.disconnect();
        observerSocket.disconnect();
        crossCompanyOwnerSocket?.disconnect();
        crossCompanyMemberSocket?.disconnect();
      }
    },
    runLiveMediaFixture ? 120000 : undefined,
  );

  it.skipIf(!runLiveMediaFixture)(
    'moves an established pair into a three-person LiveKit group and retires old generations safely',
    async () => {
      const owner = await account();
      const first = await account();
      const second = await account();
      const third = await account();
      const workspaceId = await workspace(owner);
      await join(owner, workspaceId, first);
      await join(owner, workspaceId, second);
      await join(owner, workspaceId, third);

      const tickets = await Promise.all(
        [first, second, third].map((member) => issueTicket(member, workspaceId)),
      );
      const sockets = tickets.map(({ ticket }) =>
        officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION }),
      );
      const [firstSocket, secondSocket, thirdSocket] = sockets as [Socket, Socket, Socket];
      const takeFirstUpdate = socketEventQueue(firstSocket, 'conversation:update');
      const takeSecondUpdate = socketEventQueue(secondSocket, 'conversation:update');
      const takeThirdUpdate = socketEventQueue(thirdSocket, 'conversation:update');
      let mediaFixture: Awaited<ReturnType<typeof startViteMediaFixture>> | undefined;
      let liveKitFixture: Awaited<ReturnType<typeof startLiveKitFixture>> | undefined;
      let applicationGuard: ApplicationGuard | undefined;
      let pairMediaClient: ApplicationMediaClient | undefined;
      let groupMediaClient: ApplicationMediaClient | undefined;
      let survivorMediaClient: ApplicationMediaClient | undefined;
      let retirementDirectory: string | undefined;

      const setOptIn = async (
        socket: Socket,
        ready: ReturnType<typeof officeReadySchema.parse>,
      ) => {
        const command = {
          eventId: randomUUID(),
          officeEpoch: ready.snapshot.officeEpoch,
          payload: { enabled: true },
        };
        const acknowledgement = await new Promise<unknown>((resolve) => {
          socket.emit('proximity:set-opt-in', command, resolve);
        });
        expect(officeCommandAckSchema.parse(acknowledgement)).toEqual({
          eventId: command.eventId,
          ok: true,
        });
      };
      const waitForUpdate = (
        take: (predicate: (payload: unknown) => boolean) => Promise<unknown>,
        predicate: (update: ReturnType<typeof conversationUpdateSchema.parse>) => boolean,
      ) =>
        take((raw) => {
          const parsed = conversationUpdateSchema.safeParse(raw);
          return parsed.success && predicate(parsed.data);
        }).then((raw) => conversationUpdateSchema.parse(raw));
      const issueMediaGrant = async (
        member: Awaited<ReturnType<typeof account>>,
        ready: ReturnType<typeof officeReadySchema.parse>,
        conversation: ReturnType<typeof conversationUpdateSchema.parse>,
      ) => {
        const response = await member.client.send(
          'post',
          `/api/conversations/${conversation.conversationId}/media-token`,
          {
            participationId: ready.participationId,
            conversationVersion: conversation.version,
          },
        );
        status(response, 200);
        const grant = mediaTokenResponseSchema.parse(response.body);
        const claims = await new TokenVerifier(livekitApiKey, livekitApiSecret).verify(
          grant.token,
          0,
        );
        expect(claims.sub).toBe(ready.participationId);
        expect(claims.video).toMatchObject({
          room: conversation.generation,
          roomJoin: true,
          canPublish: true,
          canPublishSources: ['microphone'],
          canSubscribe: true,
          canPublishData: false,
          canUpdateOwnMetadata: false,
        });
        return { ...grant, identity: ready.participationId };
      };
      const expectRemoteGroupAudio = async (
        mediaClient: ApplicationMediaClient,
        identities: readonly string[],
      ) => {
        const connected = await waitForApplicationMediaMessage(
          mediaClient,
          (message) => message['kind'] === 'connected',
          'all authorized group members to receive LiveKit audio',
        );
        const observations = connected['observations'] as Array<{
          status: string;
          remoteIdentities: string[];
          remoteTrackIdentities: string[];
          activeAudioSamples: number;
          decodedAudioSamples: number;
          iceStates: string[];
        }>;
        expect(observations).toHaveLength(identities.length);
        observations.forEach((observation, index) => {
          const expectedPeers = identities.filter((_, peerIndex) => peerIndex !== index).sort();
          expect(observation.status).toBe('live');
          expect(observation.remoteIdentities.slice().sort()).toEqual(expectedPeers);
          expect(observation.remoteTrackIdentities.slice().sort()).toEqual(expectedPeers);
          expect(observation.remoteTrackIdentities).toHaveLength(identities.length - 1);
          expect(observation.activeAudioSamples).toBeGreaterThanOrEqual(10);
          expect(observation.decodedAudioSamples).toBeGreaterThan(0);
          expect(observation.iceStates).toContain('connection:connected');
        });
        mediaClient.send({ kind: 'expect-audio-advancing' });
        const audioAdvancing = await waitForApplicationMediaMessage(
          mediaClient,
          (message) => message['kind'] === 'audio-advancing',
          'decoded audio samples to keep advancing for every group member',
        );
        const decodedAudioSampleDeltas = audioAdvancing['decodedAudioSampleDeltas'] as number[];
        expect(decodedAudioSampleDeltas).toHaveLength(identities.length);
        expect(decodedAudioSampleDeltas.every((delta) => delta > 0)).toBe(true);
        return observations;
      };

      try {
        const readyEvents = sockets.map((socket) =>
          nextSocketEvent<unknown>(socket, 'office:ready'),
        );
        await Promise.all(sockets.map((socket) => connectSocket(socket)));
        const ready = await Promise.all(
          readyEvents.map((event) => event.then((value) => officeReadySchema.parse(value))),
        );
        const identities = ready.map(({ participationId }) => participationId);
        const positions = ready.map(
          (member) =>
            member.snapshot.participants.find(
              (participant) => participant.participationId === member.participationId,
            )!.position,
        );
        expect(
          positions.every(
            (position) =>
              Math.hypot(position.x - positions[0]!.x, position.y - positions[0]!.y) / 32 <= 2,
          ),
        ).toBe(true);

        const firstPairNotice = waitForUpdate(
          takeFirstUpdate,
          (update) => update.state === 'joining' && update.participants.length === 2,
        );
        const secondPairNotice = waitForUpdate(
          takeSecondUpdate,
          (update) => update.state === 'joining' && update.participants.length === 2,
        );
        await setOptIn(firstSocket, ready[0]!);
        await setOptIn(secondSocket, ready[1]!);
        const pairJoining = await firstPairNotice;
        expect(await secondPairNotice).toEqual(pairJoining);
        expect(
          pairJoining.participants.map(({ participationId }) => participationId).sort(),
        ).toEqual(identities.slice(0, 2).sort());

        liveKitFixture = await startLiveKitFixture();
        mediaFixture = await startViteMediaFixture();
        if (!liveMediaGuardPort) throw new Error('real media guard port is unavailable');
        retirementDirectory = await mkdtemp(resolve(tmpdir(), 'gather-cp08-group-guard-'));
        const apiAddress = app.getHttpServer().address() as AddressInfo;
        applicationGuard = startApplicationGuard({
          apiBaseUrl: `http://127.0.0.1:${apiAddress.port}`,
          epoch: randomBytes(32).toString('hex'),
          host: '127.0.0.1',
          port: liveMediaGuardPort,
          retirementDirectory,
          sfuUpstream: `http://127.0.0.1:${liveKitFixture.signalingPort}`,
          origin: mediaFixture.origin,
        });
        const pairActiveEvent = waitForUpdate(
          takeFirstUpdate,
          (update) => update.state === 'active' && update.generation === pairJoining.generation,
        );
        const secondPairActiveEvent = waitForUpdate(
          takeSecondUpdate,
          (update) => update.state === 'active' && update.generation === pairJoining.generation,
        );
        await waitForGuardMessage(
          applicationGuard,
          (message) => message.kind === 'ack',
          'the installed two-person policy',
        );
        const pairActive = await pairActiveEvent;
        expect(await secondPairActiveEvent).toEqual(pairActive);
        const pairGrants = await Promise.all([
          issueMediaGrant(first, ready[0]!, pairActive),
          issueMediaGrant(second, ready[1]!, pairActive),
        ]);
        expect(new Set(pairGrants.map(({ generation }) => generation))).toEqual(
          new Set([pairActive.generation]),
        );
        pairMediaClient = startApplicationMediaClient({
          fixtureUrl: mediaFixture.url,
          grants: pairGrants,
        });
        await expectRemoteGroupAudio(pairMediaClient, identities.slice(0, 2));
        const roomService = new RoomServiceClient(
          `http://127.0.0.1:${liveKitFixture.signalingPort}`,
          livekitApiKey,
          livekitApiSecret,
        );
        await vi.waitFor(
          async () => {
            const participants = await roomService.listParticipants(pairActive.generation);
            expect(participants.map(({ identity }) => identity).sort()).toEqual(
              identities.slice(0, 2).sort(),
            );
          },
          { timeout: 5000, interval: 50 },
        );

        pairMediaClient.send({ kind: 'expect-server-cutoff' });
        const groupJoinStartedAt = Date.now();
        const firstGroupJoiningEvent = waitForUpdate(
          takeFirstUpdate,
          (update) => update.state === 'joining' && update.participants.length === 3,
        );
        const secondGroupJoiningEvent = waitForUpdate(
          takeSecondUpdate,
          (update) => update.state === 'joining' && update.participants.length === 3,
        );
        const thirdGroupJoiningEvent = waitForUpdate(
          takeThirdUpdate,
          (update) => update.state === 'joining' && update.participants.length === 3,
        );
        await setOptIn(thirdSocket, ready[2]!);
        const groupJoining = await firstGroupJoiningEvent;
        expect(await secondGroupJoiningEvent).toEqual(groupJoining);
        expect(await thirdGroupJoiningEvent).toEqual(groupJoining);
        expect(groupJoining).toMatchObject({
          conversationId: pairJoining.conversationId,
          state: 'joining',
          version: pairActive.version + 1,
          mediaReady: false,
        });
        expect(groupJoining.generation).not.toBe(pairActive.generation);
        expect(
          groupJoining.participants.map(({ participationId }) => participationId).sort(),
        ).toEqual(identities.slice().sort());

        const groupActiveEvents = [
          waitForUpdate(
            takeFirstUpdate,
            (update) => update.state === 'active' && update.generation === groupJoining.generation,
          ),
          waitForUpdate(
            takeSecondUpdate,
            (update) => update.state === 'active' && update.generation === groupJoining.generation,
          ),
          waitForUpdate(
            takeThirdUpdate,
            (update) => update.state === 'active' && update.generation === groupJoining.generation,
          ),
        ];
        const pairRetirement = await waitForGuardMessage(
          applicationGuard,
          (message) => message.kind === 'retired' && message.generation === pairActive.generation,
          'the old two-person generation forwarding cutoff',
        );
        const retiredPairRooms = await roomService.listRooms([pairActive.generation]);
        expect(retiredPairRooms.every((room) => Number(room.numParticipants) === 0)).toBe(true);
        expect(await roomService.listParticipants(pairActive.generation).catch(() => [])).toEqual(
          [],
        );
        const pairCutoff = await waitForApplicationMediaMessage(
          pairMediaClient,
          (message) => message['kind'] === 'server-cutoff',
          'existing pair audio to stop when its generation is retired',
        );
        if (pairCutoff['stable'] !== true)
          throw new Error(
            `pair decoded audio cutoff did not settle: ${JSON.stringify(pairCutoff)}`,
          );
        expect(pairCutoff['remoteAudioDecodedSamples']).toHaveLength(2);
        expect(pairCutoff['cutoffMs']).toBeLessThanOrEqual(8000);
        const groupActive = (await Promise.all(groupActiveEvents))[0]!;
        expect(groupActive).toMatchObject({
          conversationId: pairActive.conversationId,
          state: 'active',
          generation: groupJoining.generation,
          version: groupJoining.version + 1,
          mediaReady: true,
        });
        const groupJoinLatencyMs = Date.now() - groupJoinStartedAt;
        expect(groupJoinLatencyMs).toBeGreaterThan(0);

        const groupGrants = await Promise.all(
          ready.map((member, index) =>
            issueMediaGrant([first, second, third][index]!, member, groupActive),
          ),
        );
        expect(new Set(groupGrants.map(({ identity }) => identity))).toEqual(new Set(identities));
        expect(new Set(groupGrants.map(({ generation }) => generation))).toEqual(
          new Set([groupActive.generation]),
        );
        groupMediaClient = startApplicationMediaClient({
          fixtureUrl: mediaFixture.url,
          grants: groupGrants,
        });
        await expectRemoteGroupAudio(groupMediaClient, identities);
        await vi.waitFor(
          async () => {
            const participants = await roomService.listParticipants(groupActive.generation);
            expect(participants.map(({ identity }) => identity).sort()).toEqual(
              identities.slice().sort(),
            );
          },
          { timeout: 5000, interval: 50 },
        );

        groupMediaClient.send({ kind: 'expect-server-cutoff' });
        const leave = {
          eventId: randomUUID(),
          officeEpoch: ready[2]!.snapshot.officeEpoch,
          payload: {
            conversationId: groupActive.conversationId,
            conversationVersion: groupActive.version,
          },
        };
        const firstSurvivorJoiningEvent = waitForUpdate(
          takeFirstUpdate,
          (update) => update.state === 'joining' && update.participants.length === 2,
        );
        const secondSurvivorJoiningEvent = waitForUpdate(
          takeSecondUpdate,
          (update) => update.state === 'joining' && update.participants.length === 2,
        );
        const thirdEndedEvent = waitForUpdate(
          takeThirdUpdate,
          (update) => update.state === 'ended',
        );
        const leaveAck = await new Promise<unknown>((resolve) => {
          thirdSocket.emit('conversation:leave', leave, resolve);
        });
        expect(officeCommandAckSchema.parse(leaveAck)).toEqual({
          eventId: leave.eventId,
          ok: true,
        });
        const survivorJoining = await firstSurvivorJoiningEvent;
        expect(await secondSurvivorJoiningEvent).toEqual(survivorJoining);
        const thirdEnded = await thirdEndedEvent;
        expect(survivorJoining).toMatchObject({
          conversationId: groupActive.conversationId,
          state: 'joining',
          mediaReady: false,
          participants: expect.arrayContaining([
            expect.objectContaining({ participationId: identities[0] }),
            expect.objectContaining({ participationId: identities[1] }),
          ]),
        });
        expect(survivorJoining.generation).not.toBe(groupActive.generation);
        expect(thirdEnded).toMatchObject({
          conversationId: groupActive.conversationId,
          state: 'ended',
          participants: [],
          mediaReady: false,
        });

        const groupCutoff = await waitForApplicationMediaMessage(
          groupMediaClient,
          (message) => message['kind'] === 'server-cutoff',
          'the removed user and survivors to lose all old-generation audio',
        );
        if (groupCutoff['stable'] !== true)
          throw new Error(
            `group decoded audio cutoff did not settle: ${JSON.stringify(groupCutoff)}`,
          );
        expect(groupCutoff['remoteAudioDecodedSamples']).toHaveLength(3);
        expect(groupCutoff['cutoffMs']).toBeLessThanOrEqual(8000);
        const groupRetirement = await waitForGuardMessage(
          applicationGuard,
          (message) => message.kind === 'retired' && message.generation === groupActive.generation,
          'the old three-person generation forwarding cutoff',
        );
        expect(await roomService.listRooms([groupActive.generation])).toEqual([]);
        expect(await roomService.listParticipants(groupActive.generation).catch(() => [])).toEqual(
          [],
        );

        const removedTokenUrl = new URL(`http://127.0.0.1:${liveMediaGuardPort}/rtc/v1/validate`);
        removedTokenUrl.searchParams.set('access_token', groupGrants[2]!.token);
        removedTokenUrl.searchParams.set(
          'join_request',
          Buffer.from(JSON.stringify({ protocol: 12 })).toString('base64url'),
        );
        expect(
          (
            await fetch(removedTokenUrl, {
              headers: { Origin: mediaFixture.origin },
            })
          ).status,
        ).toBe(403);
        status(
          await third.client.send(
            'post',
            `/api/conversations/${groupActive.conversationId}/media-token`,
            {
              participationId: ready[2]!.participationId,
              conversationVersion: groupActive.version,
            },
          ),
          409,
        );

        const survivorActiveEvents = [
          waitForUpdate(
            takeFirstUpdate,
            (update) =>
              update.state === 'active' && update.generation === survivorJoining.generation,
          ),
          waitForUpdate(
            takeSecondUpdate,
            (update) =>
              update.state === 'active' && update.generation === survivorJoining.generation,
          ),
        ];
        const survivorActive = (await Promise.all(survivorActiveEvents))[0]!;
        expect(survivorActive).toMatchObject({
          conversationId: groupActive.conversationId,
          state: 'active',
          generation: survivorJoining.generation,
          version: survivorJoining.version + 1,
          mediaReady: true,
        });
        const survivorGrants = await Promise.all([
          issueMediaGrant(first, ready[0]!, survivorActive),
          issueMediaGrant(second, ready[1]!, survivorActive),
        ]);
        survivorMediaClient = startApplicationMediaClient({
          fixtureUrl: mediaFixture.url,
          grants: survivorGrants,
        });
        await expectRemoteGroupAudio(survivorMediaClient, identities.slice(0, 2));
        await vi.waitFor(
          async () => {
            const participants = await roomService.listParticipants(survivorActive.generation);
            expect(participants.map(({ identity }) => identity).sort()).toEqual(
              identities.slice(0, 2).sort(),
            );
          },
          { timeout: 5000, interval: 50 },
        );

        console.info(
          `three-person LiveKit verification: ${JSON.stringify({
            initialPairParticipants: 2,
            threePersonParticipants: 3,
            remoteAudioTracksPerGroupMember: [2, 2, 2],
            survivorParticipants: 2,
            survivorRemoteAudioTracks: [1, 1],
            groupJoinAuthorizationLatencyMs: groupJoinLatencyMs,
            pairRoomRetirementMs: pairRetirement.durationMs,
            groupRoomRetirementMs: groupRetirement.durationMs,
            pairDecodedAudioCutoffMs: pairCutoff['cutoffMs'],
            groupDecodedAudioCutoffMs: groupCutoff['cutoffMs'],
            pairGenerationRetired: retiredPairRooms.length === 0,
            removedGroupGenerationRetired: true,
            removedUserRejoinDenied: true,
          })}`,
        );
      } finally {
        for (const mediaClient of [pairMediaClient, groupMediaClient, survivorMediaClient]) {
          if (mediaClient) await stopApplicationMediaClient(mediaClient);
        }
        if (applicationGuard) await stopApplicationGuard(applicationGuard);
        if (mediaFixture) await mediaFixture.stop();
        if (liveKitFixture) await liveKitFixture.stop();
        if (retirementDirectory) await rm(retirementDirectory, { recursive: true, force: true });
        for (const socket of sockets) socket.disconnect();
      }
    },
    180000,
  );

  it('repairs a missed world delta with a current safe snapshot', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const ownerSocket = officeSocket({
      ticket: ownerTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
    const memberSocket = officeSocket({
      ticket: memberTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
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
      conflictSocket = officeSocket({
        ticket: conflictTicket,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      });
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
          protocolVersion: OFFICE_PROTOCOL_VERSION,
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
          protocolVersion: OFFICE_PROTOCOL_VERSION,
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
          protocolVersion: OFFICE_PROTOCOL_VERSION,
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
      replacementSocket = officeSocket({
        ticket: replacementTicket,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      });
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
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
        await resetBrowser.send('post', '/api/auth/reset-password', {
          email: owner.email,
          token,
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

  it('ends an idle socket after the account is suspended', async () => {
    const owner = await account();
    const workspaceId = await workspace(owner);
    const { ticket } = await issueTicket(owner, workspaceId);
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const client = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const first = officeSocket({ ticket: firstTicket, protocolVersion: OFFICE_PROTOCOL_VERSION });
    let replacement: Socket | undefined;
    try {
      const firstReadyEvent = nextSocketEvent<unknown>(first, 'office:ready');
      await connectSocket(first);
      const firstReady = officeReadySchema.parse(await firstReadyEvent);
      const firstDisconnected = nextSocketEvent<string>(first, 'disconnect');
      first.disconnect();
      await firstDisconnected;

      const { ticket: replacementTicket } = await issueTicket(owner, workspaceId);
      replacement = officeSocket({
        ticket: replacementTicket,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      });
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
      officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION }, null),
      officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION }, 'https://evil.example'),
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
    const client = officeSocket({
      ticket: 'invalid',
      protocolVersion: OFFICE_PROTOCOL_VERSION,
      role: 'owner',
    });
    try {
      await expect(connectSocket(client)).rejects.toMatchObject({ message: 'unauthorized' });
    } finally {
      client.disconnect();
    }
  });

  it('closes oversized raw handshake packets at the transport boundary', async () => {
    const client = officeSocket({
      ticket: 'a'.repeat(43),
      protocolVersion: OFFICE_PROTOCOL_VERSION,
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
    const first = officeSocket({ ticket: firstTicket, protocolVersion: OFFICE_PROTOCOL_VERSION });
    const replay = officeSocket({ ticket: firstTicket, protocolVersion: OFFICE_PROTOCOL_VERSION });
    const duplicate = officeSocket({
      ticket: duplicateTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
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
    const oldSocket = officeSocket({ ticket: oldTicket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
      newSocket = officeSocket({ ticket: newTicket, protocolVersion: OFFICE_PROTOCOL_VERSION });
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
    const ownerSocket = officeSocket({
      ticket: ownerTicket,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
    });
    const ownerReadyEvent = nextSocketEvent<unknown>(ownerSocket, 'office:ready');
    let memberSocket: Socket | undefined;
    try {
      await connectSocket(ownerSocket);
      const ownerReady = officeReadySchema.parse(await ownerReadyEvent);
      const joinedEvent = nextSocketEvent<Record<string, unknown>>(ownerSocket, 'world:delta');
      memberSocket = officeSocket({
        ticket: memberTicket,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
      });
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
        await resetBrowser.send('post', '/api/auth/reset-password', {
          email: user.email,
          token,
          newPassword,
        }),
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
    status(
      await browser.send('post', '/api/auth/reset-password', {
        email: user.email,
        token,
        newPassword,
      }),
      200,
    );
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

describe('authoritative room door lifecycle', () => {
  it('synchronizes first entry, room changes, disconnect and reconnect across sockets', async () => {
    const owner = await account();
    const member = await account();
    const observer = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    await join(owner, workspaceId, observer);
    const sockets: Socket[] = [];
    const connect = async (user: typeof owner) => {
      const { ticket } = await issueTicket(user, workspaceId);
      const socket = officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION });
      sockets.push(socket);
      const ready = nextSocketEvent<unknown>(socket, 'office:ready');
      let rooms: ReturnType<typeof meetingZonesSchema.parse> | undefined;
      socket.on('meeting:zones', (raw: unknown) => {
        rooms = meetingZonesSchema.parse(raw);
      });
      await connectSocket(socket);
      return { socket, ready: officeReadySchema.parse(await ready), rooms: () => rooms };
    };
    try {
      const a = await connect(owner);
      const b = await connect(member);
      const runtime = app.get(OfficeRuntimeService);
      const office = (
        runtime as unknown as {
          offices: Map<
            string,
            { participants: Map<string, { publicState: WorldSnapshot['participants'][number] }> }
          >;
        }
      ).offices.get(a.ready.officeId)!;
      const [first, second] = VIVO_GEOMETRY.zones.filter((zone) => zone.kind === 'meeting');
      if (!first || !second) throw new Error('Expected two meeting rooms');
      const place = (id: string, position: { x: number; y: number }) => {
        office.participants.get(id)!.publicState.position = position;
      };
      const inside = (room: NonNullable<typeof first>) => ({
        x: (room.bounds.tx + 0.5) * 32,
        y: (room.bounds.ty + 0.5) * 32,
      });
      const expectRooms = async (client: typeof a, firstIds: string[], secondIds: string[]) => {
        await vi.waitFor(() => {
          for (const [room, ids] of [
            [first, firstIds],
            [second, secondIds],
          ] as const) {
            const zone = client.rooms()?.zones.find((entry) => entry.zoneId === room.zoneId);
            expect(zone?.occupancy).toEqual([...ids].sort());
            expect(zone?.entrances.length).toBeGreaterThan(0);
            expect(zone?.entrances.map((entry) => entry.state)).toEqual(
              Array(zone!.entrances.length).fill(ids.length ? 'occupied' : 'open'),
            );
          }
        });
      };
      const idA = a.ready.participationId;
      const idB = b.ready.participationId;
      await expectRooms(a, [], []);
      await expectRooms(b, [], []);
      place(idA, inside(first!));
      await Promise.all([expectRooms(a, [idA], []), expectRooms(b, [idA], [])]);
      // Walk in through a visually closed entrance using the normal movement command.
      const entrance = a.rooms()!.zones.find((zone) => zone.zoneId === first.zoneId)!.entrances[0]!;
      const { tx, ty, width, height } = first.bounds;
      const axis = (entrance.at + 0.5) * 32;
      const crossings = {
        north: { position: { x: axis, y: ty * 32 - 1 }, dx: 0, dy: 1 },
        south: { position: { x: axis, y: (ty + height) * 32 + 1 }, dx: 0, dy: -1 },
        west: { position: { x: tx * 32 - 1, y: axis }, dx: 1, dy: 0 },
        east: { position: { x: (tx + width) * 32 + 1, y: axis }, dx: -1, dy: 0 },
      };
      const crossing = crossings[entrance.side];
      place(idB, crossing.position);
      const move = async (sequence: number, dx: number, dy: number) => {
        const ack = await new Promise<unknown>((resolve) => {
          b.socket.emit(
            'world:input',
            {
              eventId: randomUUID(),
              officeEpoch: b.ready.snapshot.officeEpoch,
              payload: { sequence, dx, dy },
            },
            resolve,
          );
        });
        expect(officeCommandAckSchema.parse(ack)).toMatchObject({ ok: true });
      };
      await move(1, crossing.dx, crossing.dy);
      await Promise.all([expectRooms(a, [idA, idB], []), expectRooms(b, [idA, idB], [])]);
      await move(2, 0, 0);
      // Both positions change before the next projection. Only final occupancy is broadcast.
      place(idA, inside(second!));
      place(idB, VIVO_GEOMETRY.spawn);
      await Promise.all([expectRooms(a, [], [idA]), expectRooms(b, [], [idA])]);
      const c = await connect(observer);
      await expectRooms(c, [], [idA]);
      a.socket.disconnect();
      await Promise.all([expectRooms(b, [], []), expectRooms(c, [], [])]);
      const fresh = await connect(owner);
      expect(fresh.ready.participationId).not.toBe(idA);
      await expectRooms(fresh, [], []);
    } finally {
      for (const socket of sockets) socket.disconnect();
    }
  });
});

describe('meeting invitation socket flow', () => {
  it('keeps invitations private, declines without movement, then admits after shared authoritative travel', async () => {
    const owner = await account();
    const member = await account();
    const observer = await account();
    const workspaceId = await workspace(owner);
    await join(owner, workspaceId, member);
    await join(owner, workspaceId, observer);
    const tickets = await Promise.all(
      [owner, member, observer].map((client) => issueTicket(client, workspaceId)),
    );
    const sockets = tickets.map(({ ticket }) =>
      officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION }),
    );
    const ready = [];
    const outsiderInvites: unknown[] = [];
    sockets[2]!.on('meeting:invitation', (event) => outsiderInvites.push(event));
    try {
      for (const socket of sockets) {
        const notice = nextSocketEvent<unknown>(socket, 'office:ready');
        await connectSocket(socket);
        ready.push(officeReadySchema.parse(await notice));
      }
      const [sender, recipient] = ready;
      if (!sender || !recipient) throw new Error('Missing clients');
      const runtime = app.get(OfficeRuntimeService);
      const map = trustedOfficeMap(vivoManifest.mapVersion)!;
      const room = VIVO_GEOMETRY.zones.find((zone) => zone.kind === 'meeting')!;
      const contains = (tile: { tx: number; ty: number }) =>
        tile.tx >= room.bounds.tx &&
        tile.tx < room.bounds.tx + room.bounds.width &&
        tile.ty >= room.bounds.ty &&
        tile.ty < room.bounds.ty + room.bounds.height;
      const free = (tile: { tx: number; ty: number }) =>
        map.validated.isReachable(tile) &&
        !map.seats.some((seat) => seat.tile.tx === tile.tx && seat.tile.ty === tile.ty);
      const roomTiles = Array.from(
        { length: room.bounds.width * room.bounds.height },
        (_, index) => ({
          tx: room.bounds.tx + (index % room.bounds.width),
          ty: room.bounds.ty + Math.floor(index / room.bounds.width),
        }),
      ).filter(free);
      const entry = roomTiles.flatMap((tile) =>
        [
          { tx: tile.tx - 1, ty: tile.ty },
          { tx: tile.tx + 1, ty: tile.ty },
          { tx: tile.tx, ty: tile.ty - 1 },
          { tx: tile.tx, ty: tile.ty + 1 },
        ]
          .filter(
            (outside) =>
              !contains(outside) &&
              free(outside) &&
              canStep(outside, tile, map.validated.bounds, map.validated.collision),
          )
          .map((outside) => ({ tile, outside })),
      )[0]!;
      const hostTile = roomTiles.find(
        (tile) => tile.tx !== entry.tile.tx || tile.ty !== entry.tile.ty,
      )!;
      const office = (
        runtime as unknown as {
          offices: Map<
            string,
            { participants: Map<string, { publicState: WorldSnapshot['participants'][number] }> }
          >;
        }
      ).offices.get(sender.officeId)!;
      const person = (id: string) => office.participants.get(id)!.publicState;
      const pixel = (tile: { tx: number; ty: number }) => ({
        x: tile.tx * 32 + 16,
        y: tile.ty * 32 + 16,
      });
      person(sender.participationId).position = pixel(hostTile);
      person(recipient.participationId).position = pixel(entry.outside);
      const command = async (index: number, event: string, payload: object) =>
        officeCommandAckSchema.parse(
          await new Promise<unknown>((resolve) =>
            sockets[index]!.emit(
              event,
              { eventId: randomUUID(), officeEpoch: sender.snapshot.officeEpoch, payload },
              resolve,
            ),
          ),
        );
      expect(await command(0, 'meeting:join', { zoneId: room.zoneId })).toMatchObject({ ok: true });
      const policy = app.get(MediaPolicyService);
      const installPolicy = async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        const challenge = { epoch: 'a'.repeat(64), nonce: randomBytes(32).toString('hex') };
        const snapshot = mediaPolicySnapshotSchema.parse(
          JSON.parse(policy.issueSnapshot(challenge).body),
        );
        policy.acknowledgeInstallation({ ...challenge, sequence: snapshot.sequence });
        return snapshot;
      };
      await installPolicy();
      const before = { ...person(recipient.participationId).position };
      let pendingNotice = nextSocketEvent<unknown>(sockets[1]!, 'meeting:invitation');
      expect(
        await command(0, 'meeting:invite', {
          targetParticipationId: recipient.participationId,
          zoneId: room.zoneId,
        }),
      ).toMatchObject({ ok: true });
      const pending = meetingInvitationSchema.parse(await pendingNotice);
      expect(pending.status).toBe('pending');
      expect(
        runtime
          .proximityMediaPermits()
          .some((permit) => permit.identity === recipient.participationId),
      ).toBe(false);
      expect(
        await command(1, 'meeting:invitation:respond', {
          invitationId: pending.invitationId,
          decision: 'decline',
        }),
      ).toMatchObject({ ok: true });
      expect(person(recipient.participationId).position).toEqual(before);
      expect(
        await command(1, 'meeting:invitation:respond', {
          invitationId: pending.invitationId,
          decision: 'accept',
        }),
      ).toMatchObject({ ok: false });
      pendingNotice = nextSocketEvent<unknown>(sockets[1]!, 'meeting:invitation');
      expect(
        await command(0, 'meeting:invite', {
          targetParticipationId: recipient.participationId,
          zoneId: room.zoneId,
        }),
      ).toMatchObject({ ok: true });
      const second = meetingInvitationSchema.parse(await pendingNotice);
      const observedPositions: { x: number; y: number }[][] = [[], []];
      for (const [index, socket] of [sockets[0]!, sockets[2]!].entries())
        socket.on('world:delta', (raw) => {
          const delta = worldDeltaSchema.parse(raw);
          const moved = delta.participants.find(
            (participant) => participant.participationId === recipient.participationId,
          );
          if (moved) observedPositions[index]!.push(moved.position);
        });
      expect(
        await command(1, 'meeting:invitation:respond', {
          invitationId: second.invitationId,
          decision: 'accept',
        }),
      ).toMatchObject({ ok: true });
      expect(
        runtime
          .proximityMediaPermits()
          .some((permit) => permit.identity === recipient.participationId),
      ).toBe(false);
      await expect
        .poll(
          () =>
            runtime
              .proximityMediaPermits()
              .some((permit) => permit.identity === recipient.participationId),
          { timeout: 5000 },
        )
        .toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(observedPositions[0]!.length).toBeGreaterThan(1);
      expect(observedPositions[0]).toEqual(observedPositions[1]);
      expect(outsiderInvites).toEqual([]);
      const snapshot = await installPolicy();
      const senderPermit = snapshot.permits.find(
        (permit) => permit.identity === sender.participationId,
      )!;
      expect(
        snapshot.permits.find((permit) => permit.identity === recipient.participationId)
          ?.generation,
      ).toBe(senderPermit.generation);
      expect(
        await command(1, 'meeting:invitation:respond', {
          invitationId: second.invitationId,
          decision: 'accept',
        }),
      ).toMatchObject({ ok: false });
    } finally {
      for (const socket of sockets) socket.disconnect();
    }
  });
});

describe('authoritative room audio isolation', () => {
  it.skipIf(!runLiveMediaFixture)(
    'isolates adjacent room meetings from doorway and wall outsiders and cuts off exited or revoked receivers',
    async () => {
      const users: Awaited<ReturnType<typeof account>>[] = [];
      for (let index = 0; index < 6; index += 1) users.push(await account());
      const workspaceId = await workspace(users[0]!);
      for (const member of users.slice(1)) await join(users[0]!, workspaceId, member);
      const tickets = await Promise.all(users.map((user) => issueTicket(user, workspaceId)));
      const sockets = tickets.map(({ ticket }) =>
        officeSocket({ ticket, protocolVersion: OFFICE_PROTOCOL_VERSION }),
      );
      let livekit: Awaited<ReturnType<typeof startLiveKitFixture>> | undefined;
      let fixture: Awaited<ReturnType<typeof startViteMediaFixture>> | undefined;
      let guard: ApplicationGuard | undefined;
      let retirementDirectory: string | undefined;
      const mediaClients: ApplicationMediaClient[] = [];
      try {
        const ready: ReturnType<typeof officeReadySchema.parse>[] = [];
        for (const socket of sockets) {
          const notice = nextSocketEvent<unknown>(socket, 'office:ready');
          await connectSocket(socket);
          ready.push(officeReadySchema.parse(await notice));
        }
        const officeId = ready[0]!.officeId;
        const officeEpoch = ready[0]!.snapshot.officeEpoch;
        const runtime = app.get(OfficeRuntimeService);
        const map = trustedOfficeMap(vivoManifest.mapVersion)!;
        const rooms = VIVO_GEOMETRY.zones.filter((zone) => zone.kind === 'meeting');
        // Pick two genuinely adjacent rooms from the installed map, rather than synthetic rooms.
        const adjacent = rooms.flatMap((a) =>
          rooms
            .filter(
              (b) =>
                a.zoneId !== b.zoneId &&
                a.bounds.tx === b.bounds.tx &&
                a.bounds.width === b.bounds.width &&
                a.bounds.ty + a.bounds.height === b.bounds.ty,
            )
            .map((b) => [a, b] as const),
        )[0];
        if (!adjacent) throw new Error('Expected adjacent trusted meeting rooms');
        const [roomA, roomB] = adjacent;
        const inside = (zone: typeof roomA, tile: { tx: number; ty: number }) =>
          tile.tx >= zone.bounds.tx &&
          tile.tx < zone.bounds.tx + zone.bounds.width &&
          tile.ty >= zone.bounds.ty &&
          tile.ty < zone.bounds.ty + zone.bounds.height;
        const free = (tile: { tx: number; ty: number }) =>
          map.validated.isReachable(tile) &&
          !map.seats.some((seat) => seat.tile.tx === tile.tx && seat.tile.ty === tile.ty);
        const tilesIn = (zone: typeof roomA) =>
          Array.from({ length: zone.bounds.width * zone.bounds.height }, (_, index) => ({
            tx: zone.bounds.tx + (index % zone.bounds.width),
            ty: zone.bounds.ty + Math.floor(index / zone.bounds.width),
          })).filter(free);
        const boundary = tilesIn(roomA).flatMap((tile) =>
          [
            { tx: tile.tx - 1, ty: tile.ty },
            { tx: tile.tx + 1, ty: tile.ty },
            { tx: tile.tx, ty: tile.ty - 1 },
            { tx: tile.tx, ty: tile.ty + 1 },
          ]
            .filter((outside) => free(outside) && !rooms.some((zone) => inside(zone, outside)))
            .map((outside) => ({ tile, outside })),
        );
        const doorway = boundary.find(({ tile, outside }) =>
          canStep(tile, outside, map.validated.bounds, map.validated.collision),
        );
        if (!doorway) throw new Error('Expected a reachable doorway');
        const wall = boundary.find(
          ({ tile, outside }) =>
            !canStep(tile, outside, map.validated.bounds, map.validated.collision) &&
            Math.hypot(outside.tx - doorway.outside.tx, outside.ty - doorway.outside.ty) <= 2,
        );
        if (!wall) throw new Error('Expected a reachable exterior wall beside the doorway');
        const office = (
          runtime as unknown as {
            offices: Map<
              string,
              {
                participants: Map<
                  string,
                  {
                    publicState: { position: { x: number; y: number } };
                  }
                >;
              }
            >;
          }
        ).offices.get(officeId)!;
        const place = (index: number, tile: { tx: number; ty: number }) => {
          // Arrange authoritative positions; navigation itself has separate movement tests.
          office.participants.get(ready[index]!.participationId)!.publicState.position = {
            x: tile.tx * 32 + 16,
            y: tile.ty * 32 + 16,
          };
        };
        place(0, doorway.tile);
        place(
          1,
          tilesIn(roomA).find(
            (tile) => tile.tx !== doorway.tile.tx || tile.ty !== doorway.tile.ty,
          )!,
        );
        place(2, tilesIn(roomB)[0]!);
        place(3, tilesIn(roomB)[1]!);
        place(4, doorway.outside);
        place(5, doorway.outside);
        const nextUpdate = sockets.map((socket) => socketEventQueue(socket, 'conversation:update'));
        const command = async (index: number, event: string, payload: Record<string, unknown>) => {
          const acknowledgement = officeCommandAckSchema.parse(
            await new Promise((resolve) =>
              sockets[index]!.emit(event, { eventId: randomUUID(), officeEpoch, payload }, resolve),
            ),
          );
          expect(acknowledgement).toMatchObject({ ok: true });
        };
        for (const index of [0, 1]) await command(index, 'meeting:join', { zoneId: roomA.zoneId });
        for (const index of [2, 3]) await command(index, 'meeting:join', { zoneId: roomB.zoneId });
        for (const index of [4, 5]) await command(index, 'proximity:set-opt-in', { enabled: true });
        livekit = await startLiveKitFixture();
        fixture = await startViteMediaFixture();
        retirementDirectory = await mkdtemp(resolve(tmpdir(), 'gather-room-audio-'));
        const apiAddress = app.getHttpServer().address() as AddressInfo;
        guard = startApplicationGuard({
          apiBaseUrl: `http://127.0.0.1:${apiAddress.port}`,
          epoch: 'b'.repeat(64),
          host: '127.0.0.1',
          port: liveMediaGuardPort!,
          retirementDirectory,
          sfuUpstream: `http://127.0.0.1:${livekit.signalingPort}`,
          origin: fixture.origin,
        });
        await waitForGuardMessage(
          guard,
          (message) => message.kind === 'ack',
          'room policy installation',
        );
        const active = await Promise.all(
          [0, 2, 4].map(async (index) =>
            conversationUpdateSchema.parse(
              await nextUpdate[index]!((raw) => {
                const parsed = conversationUpdateSchema.safeParse(raw);
                return (
                  parsed.success &&
                  parsed.data.state === 'active' &&
                  parsed.data.participants.length === 2
                );
              }),
            ),
          ),
        );
        expect(new Set(active.map((conversation) => conversation.generation)).size).toBe(3);
        const grantFor = async (index: number, conversation: (typeof active)[number]) => {
          const response = await users[index]!.client.send(
            'post',
            `/api/conversations/${conversation.conversationId}/media-token`,
            {
              participationId: ready[index]!.participationId,
              conversationVersion: conversation.version,
            },
          );
          status(response, 200);
          return {
            ...mediaTokenResponseSchema.parse(response.body),
            identity: ready[index]!.participationId,
          };
        };
        const grants = await Promise.all(
          active.map((conversation, pair) =>
            Promise.all([pair * 2, pair * 2 + 1].map((index) => grantFor(index, conversation))),
          ),
        );
        for (const pairGrants of grants) {
          const client = startApplicationMediaClient({
            fixtureUrl: fixture.url,
            grants: pairGrants,
          });
          mediaClients.push(client);
          const connected = await waitForApplicationMediaMessage(
            client,
            (message) => message['kind'] === 'connected',
            'isolated pair decoded audio',
          );
          const observations = connected['observations'] as Array<{
            remoteIdentities: string[];
            remoteTrackIdentities: string[];
            activeAudioSamples: number;
            decodedAudioSamples: number;
          }>;
          observations.forEach((observation, index) => {
            const expected = [pairGrants[index === 0 ? 1 : 0]!.identity];
            expect(observation.remoteIdentities).toEqual(expected);
            expect(observation.remoteTrackIdentities).toEqual(expected);
            expect(observation.activeAudioSamples).toBeGreaterThanOrEqual(10);
            expect(observation.decodedAudioSamples).toBeGreaterThan(0);
          });
        }
        const assertAdvancing = async (client: ApplicationMediaClient) => {
          const baseline = client.messages.length;
          client.send({ kind: 'expect-audio-advancing' });
          await vi.waitFor(
            () => {
              const report = client.messages
                .slice(baseline)
                .find((message) => message['kind'] === 'audio-advancing');
              expect(report).toBeDefined();
              expect(
                (report!['decodedAudioSampleDeltas'] as number[]).every((delta) => delta > 0),
              ).toBe(true);
            },
            { timeout: 5000, interval: 50 },
          );
        };
        const denyOutsiders = async () => {
          for (const index of [4, 5]) {
            for (const conversation of active.slice(0, 2)) {
              status(
                await users[index]!.client.send(
                  'post',
                  `/api/conversations/${conversation.conversationId}/media-token`,
                  {
                    participationId: ready[index]!.participationId,
                    conversationVersion: conversation.version,
                  },
                ),
                409,
              );
            }
          }
          // All three pairs remain active at the same time, with exactly their own peer tracks.
          await Promise.all(mediaClients.map(assertAdvancing));
        };
        await denyOutsiders();
        place(4, wall.outside);
        place(5, wall.outside);
        runtime.reconcileProximity(officeId);
        await denyOutsiders();

        // Do not stop either browser: the media guard must cut off already connected receivers.
        mediaClients[0]!.send({ kind: 'expect-server-cutoff' });
        place(1, doorway.outside);
        runtime.reconcileProximity(officeId);
        const cutoffA = await waitForApplicationMediaMessage(
          mediaClients[0]!,
          (message) => message['kind'] === 'server-cutoff',
          'real room exit cutoff',
        );
        expect(cutoffA['stable']).toBe(true);
        expect(cutoffA['cutoffMs']).toBeLessThanOrEqual(8000);
        status(
          await users[1]!.client.send(
            'post',
            `/api/conversations/${active[0]!.conversationId}/media-token`,
            {
              participationId: ready[1]!.participationId,
              conversationVersion: active[0]!.version,
            },
          ),
          409,
        );
        const replay = async (token: string) => {
          const url = new URL(`http://127.0.0.1:${liveMediaGuardPort}/rtc/v1/validate`);
          url.searchParams.set('access_token', token);
          url.searchParams.set(
            'join_request',
            Buffer.from(JSON.stringify({ protocol: 12 })).toString('base64url'),
          );
          return fetch(url, { headers: { Origin: fixture!.origin } });
        };
        expect((await replay(grants[0]![1]!.token)).status).toBe(403);
        await assertAdvancing(mediaClients[1]!);

        mediaClients[1]!.send({ kind: 'expect-server-cutoff' });
        const admissionEnded = nextSocketEvent<Record<string, unknown>>(
          sockets[3]!,
          'office:access-ended',
        );
        status(
          await users[0]!.client.send(
            'delete',
            `/api/workspaces/${workspaceId}/members/${users[3]!.id}`,
          ),
          200,
        );
        await expect(admissionEnded).resolves.toMatchObject({ reason: 'authorization_ended' });
        const cutoffB = await waitForApplicationMediaMessage(
          mediaClients[1]!,
          (message) => message['kind'] === 'server-cutoff',
          'real room admission revocation cutoff',
        );
        expect(cutoffB['stable']).toBe(true);
        expect(cutoffB['cutoffMs']).toBeLessThanOrEqual(8000);
        expect((await replay(grants[1]![1]!.token)).status).toBe(403);
        await assertAdvancing(mediaClients[2]!);

        sockets[1]!.disconnect();
        await vi.waitFor(() =>
          expect(office.participants.has(ready[1]!.participationId)).toBe(false),
        );
        const freshTicket = await issueTicket(users[1]!, workspaceId);
        const freshSocket = officeSocket({
          ticket: freshTicket.ticket,
          protocolVersion: OFFICE_PROTOCOL_VERSION,
        });
        sockets.push(freshSocket);
        const freshReadyNotice = nextSocketEvent<unknown>(freshSocket, 'office:ready');
        await connectSocket(freshSocket);
        const fresh = officeReadySchema.parse(await freshReadyNotice);
        expect(fresh.participationId).not.toBe(ready[1]!.participationId);
        status(
          await users[1]!.client.send(
            'post',
            `/api/conversations/${active[0]!.conversationId}/media-token`,
            {
              participationId: fresh.participationId,
              conversationVersion: active[0]!.version,
            },
          ),
          409,
        );
        console.info(
          'Issue #31 room media evidence:',
          JSON.stringify({
            simultaneousPairs: 3,
            adjacentRooms: [roomA.zoneId, roomB.zoneId],
            outsiderLocations: ['doorway', 'wall'],
            exitCutoffMs: cutoffA['cutoffMs'],
            revocationCutoffMs: cutoffB['cutoffMs'],
            retiredTokensRejected: true,
            reconnectAdmissionRetained: false,
          }),
        );
      } finally {
        for (const client of mediaClients) await stopApplicationMediaClient(client);
        if (guard) await stopApplicationGuard(guard);
        if (fixture) await fixture.stop();
        if (livekit) await livekit.stop();
        if (retirementDirectory) await rm(retirementDirectory, { recursive: true, force: true });
        for (const socket of sockets) socket.disconnect();
      }
    },
    180000,
  );
});
