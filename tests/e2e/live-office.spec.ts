import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { workspaceRoute } from '../../apps/web/commons-preview/workspace-navigation';
import {
  createTileCollision,
  getWorkspaceLayoutProfile,
  getWorkspaceLayoutTemplate,
  pixelToTile,
  type WorkspaceLayoutPlacement,
} from '../../packages/world/dist/index.js';
import {
  expect,
  devices,
  firefox as firefoxBrowser,
  request,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';

const enabled = process.env['LIVE_OFFICE_E2E'] === '1';
const mediaEnabled = process.env['LIVE_OFFICE_MEDIA_E2E'] === '1';
const appOrigin = process.env['LIVE_OFFICE_ORIGIN'] ?? 'https://localhost:8443';
const mailpitOrigin = process.env['LIVE_OFFICE_MAILPIT'] ?? 'http://127.0.0.1:8025';
const password = `Local-Office-E2E-${randomUUID()}!`;

type MailpitMessage = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
};

type OfficeAudioProbe = {
  activeSamples: number;
  lastActiveAt: number;
  firstSilentAfterStopAt: number;
  lastActiveAfterStopAt: number;
  stopRequestedAt: number;
  silentStartedAt: number;
  longestSilentMs: number;
  interval: number;
  sampleCount: number;
  lastSampleAt: number;
  maxCallbackIntervalMs: number;
  context: AudioContext;
  analyser: AnalyserNode;
  samples: Float32Array;
};

type OfficeRtcDiagnostic = {
  iceServers: string[];
  gatheredCandidates: Array<{ type: string | null; protocol: string | null }>;
  candidateErrors: Array<{ code: number; text: string }>;
  peerConnection: RTCPeerConnection;
};

type PositionRenderProbe = {
  frameCount: number;
  startedAt: number;
  firstChangedAt: number;
  maxStepPx: number;
  lastX: number;
  lastY: number;
  initialX: number;
  initialY: number;
  animationFrame: number;
};

declare global {
  interface Window {
    __officeAudioProbe?: OfficeAudioProbe;
    __officeRtcDiagnostics?: { peers: OfficeRtcDiagnostic[] };
    __officePositionRenderProbe?: PositionRenderProbe;
  }
}

async function json(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  if (!response.ok()) throw new Error(`Local API request failed (${response.status()}).`);
  return (await response.json()) as Record<string, unknown>;
}

async function mailToken(email: string, subject: string, previousToken?: string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const listResponse = await fetch(`${mailpitOrigin}/api/v1/messages?start=0&limit=50`);
    if (listResponse.ok) {
      const list = (await listResponse.json()) as { messages?: MailpitMessage[] };
      const message = list.messages?.find(
        (candidate) =>
          candidate.Subject.includes(subject) &&
          candidate.To.some((entry) => entry.Address.toLowerCase() === email.toLowerCase()),
      );
      if (message) {
        const detailResponse = await fetch(
          `${mailpitOrigin}/api/v1/message/${encodeURIComponent(message.ID)}`,
        );
        if (detailResponse.ok) {
          const detail = (await detailResponse.json()) as { Text?: string; HTML?: string };
          const code = `${detail.Text ?? ''}\n${detail.HTML ?? ''}`.match(
            /One-time code:\s*([0-9]{6}|[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})/i,
          );
          if (code?.[1] && code[1] !== previousToken) return code[1];
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for local Mailpit delivery to ${email}.`);
}

async function createAccount(email: string) {
  const client = await request.newContext({
    baseURL: appOrigin,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      Origin: appOrigin,
      'Sec-Fetch-Site': 'same-origin',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  const csrfResponse = await client.get('/api/auth/csrf');
  const csrfBody = await json(csrfResponse);
  let csrf = String(csrfBody.csrfToken);
  const register = await client.post('/api/auth/register', {
    data: { email, displayName: `E2E ${email.split('@')[0]}`, password },
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(register.status()).toBe(202);
  const verifyToken = await mailToken(email, 'Verify your email');
  const verified = await client.post('/api/auth/verify-email', {
    data: { email, token: verifyToken },
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(verified.status()).toBe(200);
  const verifiedBody = await json(verified);
  csrf = String(verifiedBody.csrfToken);
  const account = verifiedBody.account as { id: string; displayName: string };
  return { client, csrf, account, email };
}

async function postJson(
  client: APIRequestContext,
  path: string,
  data: unknown,
  csrf: string,
  idempotent = false,
) {
  return client.post(path, {
    data,
    headers: {
      'X-CSRF-Token': csrf,
      ...(idempotent ? { 'Idempotency-Key': randomUUID() } : {}),
    },
  });
}

async function deleteJson(
  client: APIRequestContext,
  path: string,
  csrf: string,
  idempotent = false,
) {
  return client.delete(path, {
    data: {},
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
      ...(idempotent ? { 'Idempotency-Key': randomUUID() } : {}),
    },
  });
}

type LiveMediaOfficeFixture = {
  owner: Awaited<ReturnType<typeof createAccount>>;
  member: Awaited<ReturnType<typeof createAccount>>;
  workspaceId: string;
};

let liveMediaOfficeFixture: Promise<LiveMediaOfficeFixture> | null = null;

function getLiveMediaOfficeFixture(): Promise<LiveMediaOfficeFixture> {
  liveMediaOfficeFixture ??= (async () => {
    const fixtureId = randomUUID();
    const ownerEmail = `cp085-owner-${fixtureId}@example.test`;
    const memberEmail = `cp085-member-${fixtureId}@example.test`;
    const owner = await createAccount(ownerEmail);
    const member = await createAccount(memberEmail);
    const workspaceResponse = await postJson(
      owner.client,
      '/api/workspaces',
      {
        name: `CP08.5 media ${fixtureId.slice(0, 8)}`,
        slug: `cp085-${fixtureId.slice(0, 12)}`,
      },
      owner.csrf,
      true,
    );
    expect(workspaceResponse.status()).toBe(201);
    const workspaceBody = (await workspaceResponse.json()) as { workspace: { id: string } };
    const workspaceId = workspaceBody.workspace.id;

    const invitation = await postJson(
      owner.client,
      `/api/workspaces/${workspaceId}/invitations`,
      { email: memberEmail },
      owner.csrf,
      true,
    );
    expect(invitation.status()).toBe(201);
    const invitationToken = await mailToken(memberEmail, 'Join a company');
    const accepted = await postJson(
      member.client,
      '/api/invitations/accept',
      { token: invitationToken },
      member.csrf,
      true,
    );
    expect(accepted.status()).toBe(200);
    return { owner, member, workspaceId };
  })();
  return liveMediaOfficeFixture;
}

test.afterAll(async () => {
  if (!liveMediaOfficeFixture) return;
  const fixture = await liveMediaOfficeFixture.catch(() => null);
  if (!fixture) return;
  await fixture.owner.client.dispose();
  await fixture.member.client.dispose();
});

async function participantPosition(page: import('@playwright/test').Page, displayName: string) {
  return page.locator('.office-scene svg.office-map .scene-avatar').evaluateAll((avatars, name) => {
    const avatar = avatars.find((element) => element.getAttribute('aria-label')?.startsWith(name));
    const transform = avatar?.parentElement?.getAttribute('transform') ?? '';
    const coordinates = transform.match(/translate\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)/);
    if (!coordinates) throw new Error('The remote Vivo avatar has no world-position transform.');
    return { x: Number(coordinates[1]), y: Number(coordinates[2]) };
  }, displayName);
}

async function participantPositionObservation(
  page: Page,
  displayName: string,
): Promise<{
  epoch: string | null;
  version: string | null;
  worldX: number;
  worldY: number;
  authoritativeX: number;
  authoritativeY: number;
}> {
  return page.locator('.office-scene svg.office-map').evaluate((element, name) => {
    const svg = element as SVGSVGElement;
    const avatar = Array.from(svg.querySelectorAll<SVGGElement>('g[data-world-x]')).find((group) =>
      Array.from(group.querySelectorAll<SVGElement>('[aria-label]')).some((child) =>
        child.getAttribute('aria-label')?.startsWith(name),
      ),
    );
    if (!avatar) throw new Error(`The Vivo avatar for ${name} has no logical position.`);
    return {
      epoch: svg.getAttribute('data-authoritative-epoch'),
      version: svg.getAttribute('data-authoritative-version'),
      worldX: Number(avatar.getAttribute('data-world-x')),
      worldY: Number(avatar.getAttribute('data-world-y')),
      authoritativeX: Number(avatar.getAttribute('data-authoritative-x')),
      authoritativeY: Number(avatar.getAttribute('data-authoritative-y')),
    };
  }, displayName);
}

async function officePairPositions(page: Page, firstName: string, secondName: string) {
  return page.locator('.office-scene svg.office-map').evaluate(
    (element, names) => {
      const svg = element as SVGSVGElement;
      const find = (name: string) =>
        Array.from(svg.querySelectorAll<SVGGElement>('g[data-world-x]')).find((group) =>
          Array.from(group.querySelectorAll<SVGElement>('[aria-label]')).some((child) =>
            child.getAttribute('aria-label')?.startsWith(name),
          ),
        );
      const first = find(names[0]);
      const second = find(names[1]);
      if (!first || !second) throw new Error('Both live Vivo avatar positions must be available.');
      return {
        epoch: svg.getAttribute('data-authoritative-epoch'),
        version: svg.getAttribute('data-authoritative-version'),
        first: {
          x: Number(first.getAttribute('data-authoritative-x')),
          y: Number(first.getAttribute('data-authoritative-y')),
        },
        second: {
          x: Number(second.getAttribute('data-authoritative-x')),
          y: Number(second.getAttribute('data-authoritative-y')),
        },
      };
    },
    [firstName, secondName],
  );
}

async function officeConversationArea(page: Page) {
  return page.locator('.office-scene svg.office-map').evaluate((element) => {
    const circle = element.querySelector<SVGCircleElement>('circle[data-conversation-area]');
    if (!circle) return null;
    return {
      id: circle.getAttribute('data-conversation-area'),
      version: Number(circle.getAttribute('data-area-version')),
      center: { x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')) },
      radius: Number(circle.getAttribute('r')),
    };
  });
}

async function startPositionRenderProbe(page: Page, displayName: string) {
  return page.evaluate((name) => {
    const svg = document.querySelector<SVGSVGElement>('.office-scene svg.office-map');
    if (!svg) throw new Error('The live office map is not mounted.');
    const findAvatar = () =>
      Array.from(svg.querySelectorAll<SVGGElement>('g[data-world-x]')).find((group) =>
        Array.from(group.querySelectorAll<SVGElement>('[aria-label]')).some((child) =>
          child.getAttribute('aria-label')?.startsWith(name),
        ),
      );
    const initialAvatar = findAvatar();
    if (!initialAvatar) throw new Error(`The Vivo avatar for ${name} has no logical position.`);
    const initialX = Number(initialAvatar.getAttribute('data-world-x'));
    const initialY = Number(initialAvatar.getAttribute('data-world-y'));
    const probe: PositionRenderProbe = {
      frameCount: 0,
      startedAt: performance.now(),
      firstChangedAt: 0,
      maxStepPx: 0,
      lastX: initialX,
      lastY: initialY,
      initialX,
      initialY,
      animationFrame: 0,
    };
    const sample = () => {
      const avatar = findAvatar();
      if (avatar) {
        const x = Number(avatar.getAttribute('data-world-x'));
        const y = Number(avatar.getAttribute('data-world-y'));
        const dx = x - probe.lastX;
        const dy = y - probe.lastY;
        probe.frameCount += 1;
        if (probe.firstChangedAt === 0 && (x !== initialX || y !== initialY))
          probe.firstChangedAt = performance.now();
        probe.maxStepPx = Math.max(probe.maxStepPx, Math.hypot(dx, dy));
        probe.lastX = x;
        probe.lastY = y;
      }
      probe.animationFrame = requestAnimationFrame(sample);
    };
    window.__officePositionRenderProbe = probe;
    probe.animationFrame = requestAnimationFrame(sample);
    return { startedAt: probe.startedAt, initialX, initialY };
  }, displayName);
}

async function readPositionRenderProbe(page: Page) {
  return page.evaluate(() => {
    const probe = window.__officePositionRenderProbe;
    if (!probe) throw new Error('The live position render probe is not running.');
    return { ...probe, now: performance.now() };
  });
}

async function stopPositionRenderProbe(page: Page) {
  return page.evaluate(() => {
    const probe = window.__officePositionRenderProbe;
    if (!probe) throw new Error('The live position render probe is not running.');
    cancelAnimationFrame(probe.animationFrame);
    delete window.__officePositionRenderProbe;
    return { ...probe, stoppedAt: performance.now() };
  });
}

async function nearestVisibleOpenSeatId(map: Locator) {
  return map.evaluate((element) => {
    const svg = element as SVGSVGElement;
    const self = svg.querySelector<SVGGElement>('.scene-avatar.is-self');
    const transform = self?.parentElement?.getAttribute('transform') ?? '';
    const position = transform.match(/translate\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)/);
    if (!position) throw new Error('The local Vivo avatar has no world-position transform.');
    const selfX = Number(position[1]);
    const selfY = Number(position[2]);
    const view = svg.viewBox.baseVal;
    const seats = Array.from(
      svg.querySelectorAll<SVGGElement>('.scene-seat[aria-disabled="false"]'),
    )
      .map((seat) => {
        const rect = seat.querySelector<SVGRectElement>('.seat-target')?.getBBox();
        if (!rect) return null;
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        const visible =
          x >= view.x && x <= view.x + view.width && y >= view.y && y <= view.y + view.height;
        return {
          id: seat.getAttribute('data-seat-id'),
          visible,
          distance: Math.hypot(x - selfX, y - selfY),
        };
      })
      .filter(
        (seat): seat is NonNullable<typeof seat> => seat !== null && !!seat.id && seat.visible,
      )
      .sort((left, right) => left.distance - right.distance);
    return seats[0]?.id ?? null;
  });
}

async function startRemoteAudioProbe(page: Page) {
  await page.evaluate(async () => {
    const tracks = Array.from(
      document.querySelectorAll<HTMLAudioElement>('.office-proximity-audio-output audio'),
    ).flatMap((audio) =>
      audio.srcObject instanceof MediaStream ? audio.srcObject.getAudioTracks() : [],
    );
    if (tracks.length === 0) throw new Error('No subscribed remote audio track is available.');
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(new MediaStream(tracks));
    source.connect(analyser);
    analyser.connect(context.destination);
    await context.resume();
    const samples = new Float32Array(analyser.fftSize);
    const probe: OfficeAudioProbe = {
      activeSamples: 0,
      lastActiveAt: 0,
      firstSilentAfterStopAt: 0,
      lastActiveAfterStopAt: 0,
      stopRequestedAt: 0,
      silentStartedAt: 0,
      longestSilentMs: 0,
      sampleCount: 0,
      lastSampleAt: 0,
      maxCallbackIntervalMs: 0,
      interval: 0,
      context,
      analyser,
      samples,
    };
    probe.interval = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const observedAt = Date.now();
      probe.sampleCount += 1;
      if (probe.lastSampleAt > 0)
        probe.maxCallbackIntervalMs = Math.max(
          probe.maxCallbackIntervalMs,
          observedAt - probe.lastSampleAt,
        );
      probe.lastSampleAt = observedAt;
      if (samples.some((sample) => Math.abs(sample) > 0.01)) {
        probe.activeSamples += 1;
        probe.lastActiveAt = observedAt;
        if (probe.silentStartedAt > 0) {
          probe.longestSilentMs = Math.max(
            probe.longestSilentMs,
            observedAt - probe.silentStartedAt,
          );
          probe.silentStartedAt = 0;
        }
        if (probe.stopRequestedAt > 0) probe.lastActiveAfterStopAt = observedAt;
      } else {
        if (probe.silentStartedAt === 0) probe.silentStartedAt = observedAt;
        if (probe.stopRequestedAt > 0 && probe.firstSilentAfterStopAt === 0)
          probe.firstSilentAfterStopAt = observedAt;
      }
    }, 20);
    window.__officeAudioProbe = probe;
  });
}

async function readRemoteAudioProbe(page: Page) {
  return page.evaluate(() => ({
    activeSamples: window.__officeAudioProbe?.activeSamples ?? 0,
    sampleCount: window.__officeAudioProbe?.sampleCount ?? 0,
    maxCallbackIntervalMs: window.__officeAudioProbe?.maxCallbackIntervalMs ?? 0,
    lastActiveAt: window.__officeAudioProbe?.lastActiveAt ?? 0,
    firstSilentAfterStopAt: window.__officeAudioProbe?.firstSilentAfterStopAt ?? 0,
    lastActiveAfterStopAt: window.__officeAudioProbe?.lastActiveAfterStopAt ?? 0,
    longestSilentMs: window.__officeAudioProbe?.longestSilentMs ?? 0,
    currentSilentMs:
      window.__officeAudioProbe?.silentStartedAt && window.__officeAudioProbe
        ? Date.now() - window.__officeAudioProbe.silentStartedAt
        : 0,
  }));
}

async function markRemoteAudioStopRequested(page: Page) {
  return page.evaluate(() => {
    const probe = window.__officeAudioProbe;
    if (!probe) throw new Error('The remote audio probe is not running.');
    probe.stopRequestedAt = Date.now();
    return probe.stopRequestedAt;
  });
}

async function stopRemoteAudioProbe(page: Page) {
  await page.evaluate(async () => {
    const probe = window.__officeAudioProbe;
    if (!probe) return;
    window.clearInterval(probe.interval);
    await probe.context.close();
    delete window.__officeAudioProbe;
  });
}

async function interceptWorldVersionGap(page: import('@playwright/test').Page) {
  const probe = {
    armed: false,
    interrupted: false,
    droppedDelta: false,
    resyncRequested: false,
    snapshotReceived: false,
    connectionAttempts: 0,
  };
  await page.routeWebSocket(/\/socket\.io\//, (webSocket) => {
    probe.interrupted = false;
    probe.connectionAttempts += 1;
    const server = webSocket.connectToServer();
    webSocket.onMessage((message) => {
      if (probe.interrupted) return;
      if (probe.armed && typeof message === 'string' && message.includes('"world:resync"'))
        probe.resyncRequested = true;
      server.send(message);
    });
    server.onMessage((message) => {
      if (probe.interrupted) return;
      if (typeof message === 'string' && probe.armed) {
        if (
          !probe.droppedDelta &&
          message.includes('"world:delta"') &&
          message.includes('"availability":"busy"')
        ) {
          probe.droppedDelta = true;
          return;
        }
        if (message.includes('"world:snapshot"')) probe.snapshotReceived = true;
      }
      webSocket.send(message);
    });
  });
  return {
    arm: () => {
      probe.armed = true;
    },
    state: probe,
    interrupt: () => {
      probe.interrupted = true;
    },
  };
}

async function companyPage(
  browser: Browser,
  client: APIRequestContext,
  workspaceId: string,
  withGapProbe = false,
  denyMicrophone = false,
  traceRtc = false,
) {
  const context = await browser.newContext({
    storageState: await client.storageState(),
    ignoreHTTPSErrors: true,
    ...(browser.browserType().name() === 'firefox'
      ? { userAgent: devices['Desktop Firefox'].userAgent }
      : {}),
  });
  if (denyMicrophone) {
    await context.addInitScript(() => {
      const devices = navigator.mediaDevices;
      const getUserMedia = devices.getUserMedia.bind(devices);
      Object.defineProperty(devices, 'getUserMedia', {
        configurable: true,
        value: (constraints?: MediaStreamConstraints) => {
          if (constraints?.audio)
            return Promise.reject(
              new DOMException('Microphone permission denied', 'NotAllowedError'),
            );
          return getUserMedia(constraints);
        },
      });
    });
  }
  if (traceRtc) {
    await context.addInitScript(
      ({ forceRelay }) => {
        const diagnostics: { peers: OfficeRtcDiagnostic[] } = { peers: [] };
        const NativePeerConnection = window.RTCPeerConnection;
        window.__officeRtcDiagnostics = diagnostics;
        window.RTCPeerConnection = new Proxy(NativePeerConnection, {
          construct(target, args, newTarget) {
            if (forceRelay) args[0] = { ...args[0], iceTransportPolicy: 'relay' };
            const peerConnection = Reflect.construct(target, args, newTarget) as RTCPeerConnection;
            if (forceRelay) {
              const setConfiguration = peerConnection.setConfiguration.bind(peerConnection);
              peerConnection.setConfiguration = (configuration) =>
                setConfiguration({ ...configuration, iceTransportPolicy: 'relay' });
            }
            const report: OfficeRtcDiagnostic = {
              iceServers: (peerConnection.getConfiguration().iceServers ?? []).flatMap((server) =>
                typeof server.urls === 'string' ? [server.urls] : server.urls,
              ),
              gatheredCandidates: [],
              candidateErrors: [],
              peerConnection,
            };
            peerConnection.addEventListener('icecandidate', (event) => {
              if (!event.candidate) return;
              report.gatheredCandidates.push({
                type: event.candidate.type,
                protocol: event.candidate.protocol,
              });
            });
            peerConnection.addEventListener('icecandidateerror', (event) => {
              report.candidateErrors.push({
                code: event.errorCode,
                text: event.errorText,
              });
            });
            diagnostics.peers.push(report);
            return peerConnection;
          },
        });
      },
      {
        forceRelay:
          browser.browserType().name() === 'firefox' &&
          process.env['LIVE_OFFICE_FIREFOX_RELAY_ONLY'] === '1',
      },
    );
  }
  const page = await context.newPage();
  // Register before navigation: Socket.IO captures WebSocket when its module loads.
  const gapProbe = withGapProbe ? await interceptWorldVersionGap(page) : null;
  await page.goto(appOrigin);
  await expect(page.locator(`[data-workspace-id="${workspaceId}"]`)).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator(`[data-workspace-id="${workspaceId}"]`)
    .getByRole('link', { name: 'Open office', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/companies/${workspaceId}/offices/[^/]+/entry$`));
  await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
  await expect(page.getByText('SIGN-IN STATUS', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Company details' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Employee invitations' })).toHaveCount(0);
  return { context, page, gapProbe };
}

async function readOfficeRtcDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const peers = window.__officeRtcDiagnostics?.peers ?? [];
    return Promise.all(
      peers.map(async (entry) => {
        const stats = await entry.peerConnection.getStats();
        const candidates = Array.from(stats.values())
          .filter(
            (report) => report.type === 'local-candidate' || report.type === 'remote-candidate',
          )
          .map((candidate) => ({
            type: candidate.type === 'local-candidate' ? 'local' : 'remote',
            candidateType: candidate.candidateType,
            protocol: candidate.protocol,
          }));
        const pairs = Array.from(stats.values())
          .filter(
            (report) =>
              report.type === 'candidate-pair' &&
              (report.state === 'failed' || report.nominated || report.selected),
          )
          .map((pair) => {
            const local = stats.get(pair.localCandidateId);
            const remote = stats.get(pair.remoteCandidateId);
            return {
              state: pair.state,
              nominated: pair.nominated,
              selected: pair.selected,
              localType: local?.candidateType,
              localProtocol: local?.protocol,
              remoteType: remote?.candidateType,
              remoteProtocol: remote?.protocol,
              bytesSent: pair.bytesSent,
              bytesReceived: pair.bytesReceived,
            };
          });
        const audioStreams = Array.from(stats.values())
          .filter(
            (report) =>
              (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') &&
              (report.kind === 'audio' || report.mediaType === 'audio'),
          )
          .map((report) => ({
            direction: report.type,
            bytes: 'bytesReceived' in report ? report.bytesReceived : report.bytesSent,
            packets: 'packetsReceived' in report ? report.packetsReceived : report.packetsSent,
            packetsLost: 'packetsLost' in report ? report.packetsLost : undefined,
            jitter: 'jitter' in report ? report.jitter : undefined,
            totalSamplesReceived:
              'totalSamplesReceived' in report ? report.totalSamplesReceived : undefined,
            totalAudioEnergy: 'totalAudioEnergy' in report ? report.totalAudioEnergy : undefined,
          }));
        return {
          iceServers: entry.iceServers,
          iceState: entry.peerConnection.iceConnectionState,
          connectionState: entry.peerConnection.connectionState,
          gatheredCandidates: entry.gatheredCandidates,
          candidateErrors: entry.candidateErrors,
          candidates,
          pairs,
          audioStreams,
        };
      }),
    );
  });
}

test('owner publishes an edited SVG office that two accounts can join', async ({ browser }) => {
  test.skip(!enabled, 'Set LIVE_OFFICE_E2E=1 to use the local Docker stack.');
  test.setTimeout(120_000);
  const fixture = randomUUID().slice(0, 8);
  const owner = await createAccount(`map-owner-${fixture}@example.test`);
  const member = await createAccount(`map-member-${fixture}@example.test`);
  const contexts: Array<Awaited<ReturnType<Browser['newContext']>>> = [];
  try {
    const ownerContext = await browser.newContext({
      storageState: await owner.client.storageState(),
      ignoreHTTPSErrors: true,
    });
    contexts.push(ownerContext);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`${appOrigin}/companies`);
    await ownerPage.getByRole('button', { name: 'Create company', exact: true }).first().click();
    const createDialog = ownerPage.getByRole('dialog', { name: 'Create a company' });
    await createDialog.getByLabel('Company name').fill(`SVG Office ${fixture}`);
    await createDialog.getByLabel('Office floor plan').selectOption('svg');
    const creation = ownerPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/workspaces' &&
        response.request().method() === 'POST',
    );
    await createDialog.getByRole('button', { name: 'Create company', exact: true }).click();
    const created = await creation;
    expect(created.status()).toBe(201);
    const {
      workspace: { id: workspaceId },
    } = (await created.json()) as { workspace: { id: string } };
    const workspacePath = `/api/workspaces/${workspaceId}`;
    const detail = (await json(await owner.client.get(workspacePath))).workspace as {
      officeId: string;
    };
    const officePath = `${workspacePath}/offices/${detail.officeId}`;
    const initial = await json(await owner.client.get(officePath));
    expect(initial.layout).toMatchObject([
      { templateId: 'reception' },
      { templateId: 'small' },
      { templateId: 'large' },
      { templateId: 'desks' },
    ]);
    await ownerPage.getByRole('link', { name: 'Open office', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Join', exact: true }).click();
    const firstScene = ownerPage.getByRole('img', { name: /^Live workspace floor plan/ });
    await expect(firstScene).toHaveAttribute('data-map-version', String(initial.mapVersion));
    await ownerPage.getByRole('button', { name: 'Leave office', exact: true }).click();
    await expect(ownerPage.getByRole('button', { name: 'Join', exact: true })).toBeVisible();

    const invitation = await postJson(
      owner.client,
      `${workspacePath}/invitations`,
      { email: member.email },
      owner.csrf,
      true,
    );
    expect(invitation.status()).toBe(201);
    const token = await mailToken(member.email, 'Join a company');
    const accepted = await postJson(
      member.client,
      '/api/invitations/accept',
      { token },
      member.csrf,
      true,
    );
    expect(accepted.status()).toBe(200);
    expect((await member.client.get(`${officePath}/layout`)).ok()).toBe(false);

    await ownerPage.goto(`${appOrigin}/companies/${workspaceId}/settings`);
    await expect(ownerPage.getByRole('button', { name: 'Save room count' })).toHaveCount(0);
    await ownerPage.getByRole('button', { name: 'Edit office map' }).click();
    const editor = ownerPage.getByRole('region', { name: 'Office map editor' });
    const map = editor.getByRole('group', { name: 'Editable office floor plan' });
    await expect(map.locator('[data-placement-id]')).toHaveCount(4);
    await editor.getByRole('button', { name: 'Add small meeting room' }).click();
    await editor.getByRole('button', { name: 'Add desk area' }).click();
    await expect(map.locator('[data-placement-id]')).toHaveCount(6);
    await editor.getByLabel('Module to move').selectOption('small');
    await editor.getByRole('button', { name: 'Move on map' }).click();
    await ownerPage.keyboard.press('ArrowRight');
    await ownerPage.keyboard.press('Enter');
    await expect(editor.getByRole('status')).toHaveText('Small meeting room moved.');
    await expect(map.locator('[data-placement-id="small"] image')).toHaveAttribute('x', '96');
    await editor.getByLabel('Module to move').selectOption('desks');
    await editor.getByRole('button', { name: 'Move on map' }).click();
    const deskTarget = await map.evaluate((element) => {
      const transform = (element as SVGSVGElement).getScreenCTM()!;
      const { x, y } = new DOMPoint(34 * 32 + 16, 13 * 32 + 16).matrixTransform(transform);
      return { x, y };
    });
    await ownerPage.mouse.click(deskTarget.x, deskTarget.y);
    await expect(editor.getByRole('status')).toHaveText('Desk area moved.');
    await editor.getByRole('button', { name: 'Save draft' }).click();
    await expect(editor.getByRole('status')).toHaveText('Draft saved.');
    expect((await json(await member.client.get(officePath))).mapVersion).toBe(initial.mapVersion);

    await ownerPage.reload();
    await ownerPage.getByRole('button', { name: 'Edit office map' }).click();
    await expect(map.locator('[data-placement-id]')).toHaveCount(6);
    await expect(map.locator('[data-placement-id="small"] image')).toHaveAttribute('x', '96');
    await expect(map.locator('[data-placement-id="desks"] image')).toHaveAttribute('x', '1088');

    const memberOffice = await companyPage(browser, member.client, workspaceId);
    contexts.push(memberOffice.context);
    await memberOffice.page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(
      memberOffice.page.getByRole('img', { name: /^Live workspace floor plan/ }),
    ).toHaveAttribute('data-map-version', String(initial.mapVersion));
    await editor.getByRole('button', { name: 'Publish map' }).click();
    await expect(editor.getByRole('alert')).toContainText('Everyone must leave');
    expect((await json(await member.client.get(officePath))).mapVersion).toBe(initial.mapVersion);

    await memberOffice.page.getByRole('button', { name: 'Leave office', exact: true }).click();
    await expect(
      memberOffice.page.getByRole('button', { name: 'Join', exact: true }),
    ).toBeVisible();
    await editor.getByRole('button', { name: 'Publish map' }).click();
    await expect(editor.getByRole('status')).toContainText('Map published.');
    const published = await json(await member.client.get(officePath));
    expect(published.mapVersion).not.toBe(initial.mapVersion);
    expect(published.layout).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'small', origin: { tx: 3, ty: 3 } }),
        expect.objectContaining({ id: 'small-2' }),
        expect.objectContaining({ id: 'desks', origin: { tx: 34, ty: 13 } }),
        expect.objectContaining({ id: 'desks-2' }),
      ]),
    );

    await editor.getByRole('link', { name: 'Open office' }).click();
    await ownerPage.getByRole('button', { name: 'Join', exact: true }).click();
    await memberOffice.page.getByRole('button', { name: 'Join', exact: true }).click();
    for (const page of [ownerPage, memberOffice.page]) {
      const scene = page.getByRole('img', { name: /^Live workspace floor plan/ });
      await expect(scene).toBeVisible();
      await expect(scene).toHaveAttribute('data-map-version', String(published.mapVersion));
      await expect(scene).toHaveAttribute('aria-label', /Small meeting room 2 door open/);
      await expect(page.getByText('2 people in the office', { exact: true })).toBeVisible();
    }
    await ownerPage
      .getByRole('group', { name: 'Live Commons office map with server-positioned participants' })
      .focus();
    await ownerPage.keyboard.down('ArrowUp');
    try {
      await expect(ownerPage.getByText(/You are inside Small meeting room\./)).toBeVisible();
    } finally {
      await ownerPage.keyboard.up('ArrowUp');
    }
    await expect(
      memberOffice.page.getByRole('img', { name: /^Live workspace floor plan/ }),
    ).toHaveAttribute('aria-label', /Small meeting room door closed/);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await Promise.all([owner.client.dispose(), member.client.dispose()]);
  }
});

test('Startup and Corporate presets render and publish with two real office accounts', async ({
  browser,
}, testInfo) => {
  test.skip(!enabled, 'Set LIVE_OFFICE_E2E=1 to use the local Docker stack.');
  test.setTimeout(160_000);
  const fixture = randomUUID().slice(0, 8);
  const owner = await createAccount(`preset-owner-${fixture}@example.test`);
  const member = await createAccount(`preset-member-${fixture}@example.test`);
  const contexts: Array<Awaited<ReturnType<Browser['newContext']>>> = [];
  try {
    const ownerContext = await browser.newContext({
      storageState: await owner.client.storageState(),
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 1060 },
    });
    contexts.push(ownerContext);
    const page = await ownerContext.newPage();
    let previousInvitation: string | undefined;
    const createWorkspace = async (preset: 'startup' | 'corporate', count: number) => {
      await page.goto(`${appOrigin}/companies`);
      await page.getByRole('button', { name: 'Create company', exact: true }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Create a company' });
      await dialog.getByLabel('Company name').fill(`${preset} ${fixture}`);
      await dialog.getByLabel('Office floor plan').selectOption(preset);
      await dialog.getByLabel('Private offices', { exact: true }).fill(String(count));
      await expect(
        dialog
          .getByRole('img', { name: 'Workspace floor plan preview' })
          .locator('[data-template-id="private-office"]'),
      ).toHaveCount(count);
      const creation = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/workspaces' &&
          response.request().method() === 'POST',
      );
      await dialog.getByRole('button', { name: 'Create company', exact: true }).click();
      const response = await creation;
      expect(response.status()).toBe(201);
      const { workspace } = (await response.json()) as { workspace: { id: string } };
      const workspacePath = `/api/workspaces/${workspace.id}`;
      const detail = (await json(await owner.client.get(workspacePath))).workspace as {
        officeId: string;
        roomCount: number;
      };
      expect(detail.roomCount).toBe(preset === 'startup' ? 2 : 3);
      const officePath = `${workspacePath}/offices/${detail.officeId}`;
      const bootstrap = await json(await owner.client.get(officePath));
      expect(bootstrap.layoutPreset).toBe(preset);
      const issued = await postJson(
        owner.client,
        `${workspacePath}/invitations`,
        { email: member.email },
        owner.csrf,
        true,
      );
      expect(issued.status()).toBe(201);
      const token = await mailToken(member.email, 'Join a company', previousInvitation);
      previousInvitation = token;
      const accepted = await postJson(
        member.client,
        '/api/invitations/accept',
        { token },
        member.csrf,
        true,
      );
      expect(accepted.status()).toBe(200);
      return { id: workspace.id, officeId: detail.officeId, officePath, bootstrap };
    };

    const startup = await createWorkspace('startup', 10);
    const corporate = await createWorkspace('corporate', 12);
    const editor = page.getByRole('region', { name: 'Office map editor' });
    const enterEditor = async (id: string, count: number, screenshot: string) => {
      await page.goto(`${appOrigin}/companies/${id}/settings`);
      await page.getByRole('button', { name: 'Edit office map' }).click();
      const map = editor.getByRole('group', { name: 'Editable office floor plan' });
      await expect(map.locator('[data-template-id="private-office"]')).toHaveCount(count);
      await expect(map.locator('[data-template-id="garden"]')).toHaveCount(1);
      await expect(map.locator('[data-template-id="lounge"]')).toHaveCount(1);
      await editor.screenshot({ path: testInfo.outputPath(screenshot) });
    };
    const scene = (office: Page) => office.getByRole('img', { name: /^Live workspace floor plan/ });
    const joinOffice = async (office: Page, version: unknown, count: number) => {
      await office.getByRole('button', { name: 'Join', exact: true }).click();
      await expect(scene(office)).toHaveAttribute('data-map-version', String(version));
      await expect(scene(office)).toHaveAttribute('data-private-office-count', String(count));
    };
    const enterMember = async (id: string, version: unknown, count: number) => {
      const fixture = await companyPage(browser, member.client, id);
      contexts.push(fixture.context);
      await joinOffice(fixture.page, version, count);
      return fixture.page;
    };

    await enterEditor(corporate.id, 12, 'corporate-editor.png');
    const corporateMember = await enterMember(corporate.id, corporate.bootstrap.mapVersion, 12);
    await editor.getByRole('link', { name: 'Open office' }).click();
    await joinOffice(page, corporate.bootstrap.mapVersion, 12);
    await expect(
      corporateMember.getByText('2 people in the office', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('corporate-live.png') });
    await page.getByRole('button', { name: 'Leave office', exact: true }).click();
    await corporateMember.getByRole('button', { name: 'Leave office', exact: true }).click();

    await enterEditor(startup.id, 10, 'startup-editor.png');
    const startupMember = await enterMember(startup.id, startup.bootstrap.mapVersion, 10);
    await editor.getByLabel('Replace with preset').selectOption('corporate');
    await editor.getByRole('button', { name: 'Preview replacement' }).click();
    await expect(
      editor
        .getByRole('group', { name: 'Proposed office floor plan' })
        .locator('[data-template-id="private-office"]'),
    ).toHaveCount(12);
    await editor.getByRole('button', { name: 'Cancel replacement' }).click();
    await editor.getByLabel('Module to move').selectOption('private-office-1');
    await editor.getByLabel('Module name').fill('North Star Studio');
    await editor.getByRole('button', { name: 'Apply name' }).click();
    await editor.getByLabel('Private offices', { exact: true }).fill('9');
    await editor.getByRole('button', { name: 'Apply count' }).click();
    await expect(editor.getByRole('group', { name: 'Confirm layout replacement' })).toContainText(
      'Remove Private office 10',
    );
    await editor.getByRole('button', { name: 'Cancel replacement' }).click();
    await editor.getByLabel('Private offices', { exact: true }).fill('12');
    await editor.getByRole('button', { name: 'Apply count' }).click();
    await expect(
      editor.getByLabel('Module to move').locator('option[value="private-office-1"]'),
    ).toHaveText('North Star Studio');
    await editor.getByRole('button', { name: 'Save draft' }).click();
    await expect(editor.getByRole('status')).toHaveText('Draft saved.');
    await expect(scene(startupMember)).toHaveAttribute('data-private-office-count', '10');
    await editor.getByRole('button', { name: 'Publish map' }).click();
    await expect(editor.getByRole('alert')).toContainText('Everyone must leave');

    await startupMember.getByRole('button', { name: 'Leave office', exact: true }).click();
    await expect(startupMember.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
    await editor.getByRole('button', { name: 'Publish map' }).click();
    await expect(editor.getByRole('status')).toContainText('Map published.');
    const published = await json(await member.client.get(startup.officePath));
    expect(published.layout).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'private-office-1', name: 'North Star Studio' }),
        expect.objectContaining({ id: 'private-office-12' }),
      ]),
    );
    expect(published.mapVersion).not.toBe(startup.bootstrap.mapVersion);
    await editor.getByRole('link', { name: 'Open office' }).click();
    await joinOffice(page, published.mapVersion, 12);
    await joinOffice(startupMember, published.mapVersion, 12);
    await expect(page.getByText('2 people in the office', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('startup-live.png') });

    const follow = page.getByRole('button', { name: 'Follow me' });
    await follow.click();
    await expect(page.getByRole('button', { name: 'Show overview' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const walkUntil = async (key: string, reached: RegExp) => {
      await page.keyboard.down(key);
      try {
        await expect(scene(page)).toHaveAttribute('data-local-tile', reached);
      } finally {
        await page.keyboard.up(key);
      }
    };
    await walkUntil('ArrowUp', /^6,23$/);
    await walkUntil('ArrowRight', /^(13|14),2[2-4]$/);
    await walkUntil('ArrowUp', /^(13|14),20$/);
    await page
      .getByRole('button', { name: 'Sit · private-office-6-furniture:0', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Stand up' })).toBeVisible();
    await expect(
      startupMember.getByRole('button', {
        name: 'Sit · private-office-6-furniture:0',
        exact: true,
      }),
    ).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('startup-follow.png') });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await Promise.all([owner.client.dispose(), member.client.dispose()]);
  }
});

async function inviteStudioMember(
  workspaceId: string,
  owner: Awaited<ReturnType<typeof createAccount>>,
  member: Awaited<ReturnType<typeof createAccount>>,
) {
  const invitation = await postJson(
    owner.client,
    `/api/workspaces/${workspaceId}/invitations`,
    { email: member.email },
    owner.csrf,
    true,
  );
  expect(invitation.status()).toBe(201);
  const token = await mailToken(member.email, 'Join a company');
  const accepted = await postJson(
    member.client,
    '/api/invitations/accept',
    { token },
    member.csrf,
    true,
  );
  expect(accepted.status()).toBe(200);
}

const studioMap = (page: Page) => page.getByRole('img', { name: /^Live workspace floor plan/ });

async function studioClick(page: Page, tx: number, ty: number) {
  const map = studioMap(page);
  const rectangle = await map.boundingBox();
  if (!rectangle) throw new Error('Studio canvas must be visible.');
  const { width, height } = await map.evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));
  await page.mouse.click(
    rectangle.x + (rectangle.width * ((tx + 0.5) * 32)) / width,
    rectangle.y + (rectangle.height * ((ty + 0.5) * 32)) / height,
  );
}

async function enterStudio(page: Page, count = 6) {
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(studioMap(page)).toHaveAttribute('data-avatar-style', 'studio');
  await expect(studioMap(page)).toHaveAttribute('data-private-office-count', String(count));
}

test('Dynamic rooms light locally and close doors for all occupants', async ({ browser }) => {
  test.skip(!enabled, 'Set LIVE_OFFICE_E2E=1 to use the local Docker stack.');
  test.setTimeout(160_000);
  const stamp = randomUUID().slice(0, 8);
  const owner = await createAccount(`room-visual-owner-${stamp}@example.test`);
  const member = await createAccount(`room-visual-member-${stamp}@example.test`);
  const contexts: Array<Awaited<ReturnType<Browser['newContext']>>> = [];
  try {
    const created = await postJson(
      owner.client,
      '/api/workspaces',
      {
        name: 'Dynamic room visuals',
        slug: `room-visuals-${stamp}`,
        officeTemplate: 'studio-orthogonal',
        privateOfficeCount: 8,
      },
      owner.csrf,
      true,
    );
    expect(created.status()).toBe(201);
    const { workspace } = (await created.json()) as { workspace: { id: string } };
    await inviteStudioMember(workspace.id, owner, member);
    const ownerOffice = await companyPage(browser, owner.client, workspace.id);
    const memberOffice = await companyPage(browser, member.client, workspace.id);
    contexts.push(ownerOffice.context, memberOffice.context);
    await enterStudio(ownerOffice.page, 8);
    await enterStudio(memberOffice.page, 8);

    const ownerMap = studioMap(ownerOffice.page);
    const memberMap = studioMap(memberOffice.page);
    for (const map of [ownerMap, memberMap]) {
      await expect(map).toHaveAttribute('data-active-room-id', 'reception');
      await expect(map).toHaveAttribute('data-room-lighting', 'dimmed');
      await expect(map).toHaveAttribute('aria-label', /Private office 1 door open/);
    }

    await studioClick(ownerOffice.page, 4, 15);
    await expect(ownerMap).toHaveAttribute('data-active-room-id', 'private-office-1', {
      timeout: 20_000,
    });
    await expect(memberMap).toHaveAttribute('data-active-room-id', 'reception');
    await expect(memberMap).toHaveAttribute('aria-label', /Private office 1 door closed/);

    await studioClick(memberOffice.page, 17, 19);
    await expect(memberMap).toHaveAttribute('data-active-room-id', 'large', { timeout: 20_000 });
    await expect(ownerMap).toHaveAttribute('data-active-room-id', 'private-office-1');
    await expect(ownerMap).toHaveAttribute('aria-label', /Large meeting room door closed/);

    await studioClick(ownerOffice.page, 3, 18);
    await expect(ownerMap).not.toHaveAttribute('data-active-room-id', /.+/, { timeout: 20_000 });
    await expect(ownerMap).not.toHaveAttribute('data-room-lighting', /.+/);
    await expect(memberMap).toHaveAttribute('data-active-room-id', 'large');
    await expect(memberMap).toHaveAttribute('aria-label', /Private office 1 door open/);
    await expect(memberMap).toHaveAttribute('aria-label', /Large meeting room door closed/);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await Promise.all([owner.client.dispose(), member.client.dispose()]);
  }
});

test('Orthogonal Studio publishes eight offices and keeps the open floor bounded', async ({
  browser,
}, testInfo) => {
  test.skip(!enabled, 'Set LIVE_OFFICE_E2E=1 to use the local Docker stack.');
  test.setTimeout(110_000);
  const stamp = randomUUID().slice(0, 8);
  const owner = await createAccount(`orthogonal-${stamp}@example.test`);
  const context = await browser.newContext({
    storageState: await owner.client.storageState(),
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 1050 },
  });
  try {
    const response = await postJson(
      owner.client,
      '/api/workspaces',
      {
        name: 'Orthogonal Studio test',
        slug: `orthogonal-${stamp}`,
        officeTemplate: 'studio-orthogonal',
        privateOfficeCount: 6,
      },
      owner.csrf,
      true,
    );
    expect(response.status()).toBe(201);
    const { workspace } = (await response.json()) as { workspace: { id: string } };
    const workspacePath = `/api/workspaces/${workspace.id}`;
    const detail = (await json(await owner.client.get(workspacePath))).workspace as {
      officeId: string;
    };
    const officePath = `${workspacePath}/offices/${detail.officeId}`;
    const previous = await json(await owner.client.get(officePath));
    const page = await context.newPage();
    await page.goto(`${appOrigin}/companies/${workspace.id}/settings`);
    await page.getByRole('button', { name: 'Edit office map' }).click();
    const editor = page.getByRole('region', { name: 'Office map editor' });
    const map = editor.getByRole('group', { name: 'Editable office floor plan' });
    await expect(map.locator('[data-area="open-area"]')).toHaveCount(1);
    await expect(
      map.locator('[data-template-id="private-office"] image[height="192"][width="192"]'),
    ).toHaveCount(6);
    await map.hover();
    await page.mouse.wheel(0, -400);
    await expect(map).not.toHaveAttribute('data-map-zoom', '1.00');
    const view = editor.locator('.workspace-map-viewport');
    const box = (await view.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    expect(await view.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.mouse.wheel(0, 1200);
    await expect(map).toHaveAttribute('data-map-zoom', '1.00');
    await editor.getByLabel('Private offices', { exact: true }).fill('8');
    await editor.getByRole('button', { name: 'Apply count' }).click();
    await expect(map.locator('[data-template-id="private-office"]')).toHaveCount(8);
    await editor.getByRole('button', { name: 'Save draft' }).click();
    await expect(editor.getByRole('status')).toHaveText('Draft saved.');
    expect((await json(await owner.client.get(officePath))).layout).toEqual(previous.layout);
    await editor.getByRole('button', { name: 'Publish map' }).click();
    await expect(editor.getByRole('status')).toContainText('Map published.');
    const after = await json(await owner.client.get(officePath));
    expect(after.layoutPreset).toBe('studio-orthogonal');
    const initial = previous.layout as unknown[];
    const published = after.layout as Array<{ id: string }>;
    expect(published.slice(0, initial.length)).toEqual(initial);
    expect(published.slice(initial.length).map(({ id }) => id)).toEqual([
      'private-office-7',
      'private-office-8',
    ]);
    await page.screenshot({ path: testInfo.outputPath('orthogonal-editor.png') });
    await page.goto(`${appOrigin}/companies/${workspace.id}/offices/${detail.officeId}/entry`);
    const steps: Array<{ event: string; at: number; data: unknown }> = [];
    page.on('websocket', (socket) => {
      socket.on('framesent', ({ payload }) => {
        if (typeof payload === 'string' && payload.includes('"world:input"'))
          steps.push({
            event: 'input',
            at: Date.now(),
            data: JSON.parse(payload.slice(payload.indexOf('[')))[1].payload,
          });
      });
      socket.on('framereceived', ({ payload }) => {
        if (typeof payload === 'string' && payload.includes('"world:delta"')) {
          const data = JSON.parse(payload.slice(payload.indexOf('[')))[1];
          const position = data.participants[0]?.position;
          if (position) steps.push({ event: 'position', at: Date.now(), data: position });
        }
      });
    });
    await enterStudio(page, 8);
    const live = studioMap(page);
    await expect(live).toHaveAttribute('data-map-version', String(after.mapVersion));
    await page.screenshot({ path: testInfo.outputPath('orthogonal-live.png') });
    try {
      await studioClick(page, 21, 2);
      await expect(live).toHaveAttribute('data-local-tile', '21,2', { timeout: 20_000 });
    } finally {
      await testInfo.attach('corridor-navigation', {
        body: JSON.stringify(steps, null, 2),
        contentType: 'application/json',
      });
    }
    await page.keyboard.down('ArrowUp');
    try {
      await page.waitForTimeout(650);
      await expect(live).toHaveAttribute('data-local-tile', '21,2');
    } finally {
      await page.keyboard.up('ArrowUp');
    }
    await live.hover();
    await page.mouse.wheel(0, -400);
    await expect(live).toHaveAttribute('data-camera-zoom', '1.82');
    const pan = await live.getAttribute('data-camera-pan');
    const canvasBox = (await live.boundingBox())!;
    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.64,
      canvasBox.y + canvasBox.height * 0.55,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.35,
      canvasBox.y + canvasBox.height * 0.4,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(live).not.toHaveAttribute('data-camera-pan', pan!);
    await expect(live).toHaveAttribute('data-local-tile', '21,2');
    await page.screenshot({ path: testInfo.outputPath('orthogonal-zoom-pan.png') });
  } finally {
    await context.close();
    await owner.client.dispose();
  }
});

test('Orthogonal Studio recovers a missed corridor waypoint and isolates private-room voice', async ({
  browser,
}, testInfo) => {
  test.skip(!enabled || !mediaEnabled, 'Requires the local Docker and LiveKit services.');
  test.setTimeout(150_000);
  const stamp = randomUUID().slice(0, 8);
  const owner = await createAccount(`bany-owner-${stamp}@example.test`);
  const member = await createAccount(`bany-member-${stamp}@example.test`);
  const contexts: Array<Awaited<ReturnType<Browser['newContext']>>> = [];
  const pages: Page[] = [];
  try {
    const created = await postJson(
      owner.client,
      '/api/workspaces',
      {
        name: 'Orthogonal recovery and privacy',
        slug: `bany-${stamp}`,
        officeTemplate: 'studio-orthogonal',
      },
      owner.csrf,
      true,
    );
    expect(created.status()).toBe(201);
    const { workspace } = (await created.json()) as { workspace: { id: string } };
    await inviteStudioMember(workspace.id, owner, member);
    for (const { client } of [owner, member]) {
      const context = await browser.newContext({
        storageState: await client.storageState(),
        ignoreHTTPSErrors: true,
      });
      contexts.push(context);
      pages.push(await context.newPage());
      await context.grantPermissions(['microphone'], { origin: appOrigin });
    }
    const [first, second] = pages as [Page, Page];
    const roomId = new Map<Page, string>();
    type Participant = {
      participationId: string;
      seatId: string | null;
      position: { x: number; y: number };
    };
    const observed = new Map<Page, Map<string, Participant>>();
    for (const page of pages) {
      const roster = new Map<string, Participant>();
      observed.set(page, roster);
      page.on('websocket', (webSocket) => {
        if (!webSocket.url().includes('/socket.io/')) return;
        webSocket.on('framereceived', ({ payload }) => {
          if (typeof payload !== 'string' || !payload.startsWith('42/office,[')) return;
          const [event, data] = JSON.parse(payload.slice('42/office,'.length));
          if (event === 'office:ready') {
            roomId.set(page, data.participationId);
            for (const peer of data.snapshot.participants) roster.set(peer.participationId, peer);
          } else if (event === 'world:delta') {
            for (const peer of data.participants) roster.set(peer.participationId, peer);
            for (const id of data.removedParticipationIds) roster.delete(id);
          }
        });
      });
    }
    let arm = false;
    let missed: { tx: number; ty: number } | undefined;
    let resent = false;
    await first.routeWebSocket(/\/socket\.io\//, (socket) => {
      const upstream = socket.connectToServer();
      socket.onMessage((message) => {
        if (arm && typeof message === 'string' && message.includes('"world:input"')) {
          const [event, command] = JSON.parse(message.slice(message.indexOf('[')));
          const waypoint = command.payload?.waypoint;
          if (event === 'world:input' && waypoint && !missed) {
            missed = waypoint;
            console.log('Dropped one movement waypoint:', waypoint);
            return;
          }
          if (
            event === 'world:input' &&
            waypoint &&
            missed?.tx === waypoint.tx &&
            missed?.ty === waypoint.ty
          )
            resent = true;
        }
        upstream.send(message);
      });
    });
    const { officeId } = (await json(await owner.client.get(`/api/workspaces/${workspace.id}`)))
      .workspace as { officeId: string };
    const entry = `${appOrigin}/companies/${workspace.id}/offices/${officeId}/entry`;
    await Promise.all(pages.map((page) => page.goto(entry)));
    await enterStudio(first);
    await enterStudio(second);
    arm = true;
    // Move the actual canvas after Phaser has cached its old input bounds.
    // The click should still resolve to a legal exact tile on the latest rect.
    const secondMap = studioMap(second);
    await secondMap.evaluate((canvas: HTMLCanvasElement) => {
      canvas.style.transform = 'translateY(48px)';
    });
    await Promise.all([studioClick(first, 20, 21), studioClick(second, 21, 21)]);
    await expect(secondMap).toHaveAttribute('data-last-clicked-tile', '21,21');
    await secondMap.evaluate((canvas: HTMLCanvasElement) => {
      canvas.style.removeProperty('transform');
    });
    await expect.poll(() => resent).toBe(true);
    await expect(studioMap(first)).toHaveAttribute('data-avatar-facing', 'north');
    await expect(studioMap(first)).toHaveAttribute('data-avatar-pose', 'walking');
    await expect(studioMap(first)).toHaveAttribute('data-local-tile', '20,21', { timeout: 22_000 });
    await expect(studioMap(second)).toHaveAttribute('data-local-tile', '21,21', {
      timeout: 22_000,
    });
    await expect(studioMap(first)).toHaveAttribute('data-avatar-pose', 'idle');
    expect(missed).toBeDefined();
    const checkAgreement = async (page: Page, tx: number, ty: number) => {
      const id = roomId.get(page)!;
      const center = { x: (tx + 0.5) * 32, y: (ty + 0.5) * 32 };
      await expect
        .poll(() => pages.map((viewer) => observed.get(viewer)?.get(id)?.position))
        .toEqual([center, center]);
    };
    await checkAgreement(first, 20, 21);
    await checkAgreement(second, 21, 21);
    arm = false;
    console.log(
      'One deliberately missed corridor waypoint was resent automatically. Both clients agreed on exact positions.',
    );

    await Promise.all([studioClick(first, 3, 14), studioClick(second, 4, 16)]);
    await expect(studioMap(first)).toHaveAttribute('data-local-tile', '3,14', { timeout: 22_000 });
    await expect(studioMap(first)).toHaveAttribute('data-avatar-pose', 'seated');
    await expect(studioMap(second)).toHaveAttribute('data-local-tile', '4,16', { timeout: 22_000 });
    await expect
      .poll(() => pages.map((viewer) => observed.get(viewer)?.get(roomId.get(first)!)?.seatId))
      .toEqual(['private-office-1-furniture:0', 'private-office-1-furniture:0']);
    await first.keyboard.press('e');
    await expect(studioMap(first)).toHaveAttribute('data-avatar-pose', 'idle');

    await studioClick(first, 3, 16);
    await expect(studioMap(first)).toHaveAttribute('data-local-tile', '3,16');
    await checkAgreement(first, 3, 16);
    await checkAgreement(second, 4, 16);
    await Promise.all(
      pages.map((page) => page.getByRole('button', { name: 'Opt in to nearby voice' }).click()),
    );
    for (const page of pages)
      await expect(page.locator('.office-voice-status')).toContainText(
        'In a 2-person conversation',
        { timeout: 18_000 },
      );
    await Promise.all(
      pages.map((page) =>
        page.getByRole('button', { name: 'Activate proximity microphone' }).click(),
      ),
    );
    const audio = (page: Page) => page.locator('.office-proximity-audio-output audio');
    await Promise.all(
      pages.map(async (page, index) => {
        await expect(audio(page)).toHaveCount(1, { timeout: 22_000 });
        await expect(audio(page)).toHaveAttribute(
          'data-participant-id',
          roomId.get(pages[1 - index]!)!,
        );
        await startRemoteAudioProbe(page);
        await expect
          .poll(async () => (await readRemoteAudioProbe(page)).activeSamples)
          .toBeGreaterThan(8);
      }),
    );
    await studioClick(second, 4, 17);
    await expect(studioMap(second)).toHaveAttribute('data-local-tile', '4,17');
    await checkAgreement(second, 4, 17);
    for (const page of pages) {
      await expect(audio(page)).toHaveCount(0);
      await expect
        .poll(async () => (await readRemoteAudioProbe(page)).currentSilentMs)
        .toBeGreaterThan(450);
    }
    console.log(
      'Two decoded private-office directions; both detached and silent at the adjacent corridor tile.',
    );
    await first.screenshot({ path: testInfo.outputPath('bany-private-boundary.png') });
  } finally {
    await Promise.allSettled(pages.map(stopRemoteAudioProbe));
    await Promise.allSettled(contexts.map((context) => context.close()));
    await Promise.allSettled([owner.client.dispose(), member.client.dispose()]);
  }
});

test('Studio grows six to eight without moving or resetting the open office', async ({
  browser,
}, testInfo) => {
  test.skip(!enabled, 'Set LIVE_OFFICE_E2E=1 to use the local Docker stack.');
  test.setTimeout(150_000);
  const stamp = randomUUID().slice(0, 8);
  const owner = await createAccount(`studio-builder-${stamp}@example.test`);
  const member = await createAccount(`studio-walker-${stamp}@example.test`);
  const contexts: Array<Awaited<ReturnType<Browser['newContext']>>> = [];
  try {
    const ownerContext = await browser.newContext({
      storageState: await owner.client.storageState(),
      ignoreHTTPSErrors: true,
      viewport: { width: 1480, height: 1020 },
    });
    contexts.push(ownerContext);
    const page = await ownerContext.newPage();
    await page.goto(`${appOrigin}/companies`);
    await page.getByRole('button', { name: 'Create company', exact: true }).first().click();
    const creation = page.getByRole('dialog', { name: 'Create a company' });
    await creation.getByLabel('Company name').fill(`Studio Circuit ${stamp}`);
    await expect(creation.getByLabel('Office floor plan')).toHaveValue('studio-orthogonal');
    await creation.getByLabel('Office floor plan').selectOption('studio');
    await expect(creation.getByLabel('Private offices')).toHaveValue('6');
    const preview = creation.getByRole('img', { name: 'Workspace floor plan preview' });
    await expect(preview.locator('[data-template-id="team-studio"]')).toHaveCount(1);
    await expect(preview.locator('[data-template-id="private-office"]')).toHaveCount(6);
    const creating = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/workspaces' &&
        response.request().method() === 'POST',
    );
    await creation.getByRole('button', { name: 'Create company', exact: true }).click();
    const created = await creating;
    expect(created.status()).toBe(201);
    const { workspace } = (await created.json()) as { workspace: { id: string } };
    const workspacePath = `/api/workspaces/${workspace.id}`;
    const detail = (await json(await owner.client.get(workspacePath))).workspace as {
      officeId: string;
      roomCount: number;
    };
    expect(detail.roomCount).toBe(2);
    const officePath = `${workspacePath}/offices/${detail.officeId}`;
    const old = await json(await owner.client.get(officePath));
    expect(old.layoutPreset).toBe('studio');
    await inviteStudioMember(workspace.id, owner, member);
    const activeMember = await companyPage(browser, member.client, workspace.id);
    contexts.push(activeMember.context);
    await enterStudio(activeMember.page);
    await page.goto(`${appOrigin}/companies/${workspace.id}/settings`);
    await page.getByRole('button', { name: 'Edit office map' }).click();
    const editor = page.getByRole('region', { name: 'Office map editor' });
    await editor.getByLabel('Module to move').selectOption('private-office-1');
    await editor.getByLabel('Module name').fill('Sketchbook');
    await editor.getByRole('button', { name: 'Apply name' }).click();
    await editor.getByLabel('Private offices', { exact: true }).fill('8');
    await editor.getByRole('button', { name: 'Apply count' }).click();
    await editor.getByRole('button', { name: 'Save draft' }).click();
    await expect(editor.getByRole('status')).toHaveText('Draft saved.');
    await page.screenshot({ path: testInfo.outputPath('studio-editor.png') });
    await editor.getByRole('button', { name: 'Publish map' }).click();
    await expect(editor.getByRole('alert')).toContainText('Everyone must leave');
    await expect(studioMap(activeMember.page)).toHaveAttribute(
      'data-map-version',
      String(old.mapVersion),
    );
    await activeMember.page.getByRole('button', { name: 'Leave office', exact: true }).click();
    await expect(
      activeMember.page.getByRole('button', { name: 'Join', exact: true }),
    ).toBeVisible();
    await editor.getByRole('button', { name: 'Publish map' }).click();
    await expect(editor.getByRole('status')).toContainText('Map published.');
    const published = await json(await member.client.get(officePath));
    type Placement = {
      id: string;
      templateId: string;
      origin: { tx: number; ty: number };
      name?: string;
    };
    const oldRows = old.layout as Placement[];
    const newRows = published.layout as Placement[];
    expect(newRows.slice(0, oldRows.length)).toEqual(
      oldRows.map((row) => (row.id === 'private-office-1' ? { ...row, name: 'Sketchbook' } : row)),
    );
    expect(newRows.slice(-2).map(({ id }) => id)).toEqual(['private-office-7', 'private-office-8']);
    await editor.getByRole('link', { name: 'Open office' }).click();
    await enterStudio(page, 8);
    await enterStudio(activeMember.page, 8);
    for (const office of [page, activeMember.page]) {
      await expect(office.getByText('2 people in the office', { exact: true })).toBeVisible();
      await expect(studioMap(office)).toHaveAttribute(
        'data-map-version',
        String(published.mapVersion),
      );
    }
    await page.screenshot({ path: testInfo.outputPath('studio-live.png') });
    // Check the real runtime: pass through the south opening, then press into a solid desk.
    await studioClick(page, 26, 15);
    await expect(studioMap(page)).toHaveAttribute('data-local-tile', '26,15', { timeout: 12_000 });
    await page.keyboard.down('ArrowLeft');
    try {
      await page.waitForTimeout(450);
      await expect(studioMap(page)).toHaveAttribute('data-local-tile', '26,15');
    } finally {
      await page.keyboard.up('ArrowLeft');
    }
    await studioClick(page, 22, 17);
    await expect(page.getByRole('button', { name: 'Stand up' })).toBeVisible({ timeout: 12_000 });
    await expect(
      activeMember.page.getByRole('button', { name: 'Sit · team-studio-furniture:0', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Follow me' }).click();
    await page.screenshot({ path: testInfo.outputPath('studio-seated.png') });
    await page.keyboard.press('e');
    await expect(page.getByRole('button', { name: 'Stand up' })).toHaveCount(0);
    await page.getByRole('button', { name: new RegExp(member.account.displayName) }).click();
    await page.getByRole('button', { name: 'Go to', exact: true }).click();
    await studioClick(activeMember.page, 7, 22);
    await expect(studioMap(activeMember.page)).toHaveAttribute('data-local-tile', '7,22');
    await expect(page.getByText('Destination reached.', { exact: true })).toBeVisible({
      timeout: 14_000,
    });
    await expect(studioMap(page)).toHaveAttribute('data-local-tile', /^(6,22|8,22|7,21|7,23)$/);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await Promise.all([owner.client.dispose(), member.client.dispose()]);
  }
});

test('Studio carries decoded LiveKit audio and cuts it off at room boundaries', async ({
  browser,
}) => {
  test.skip(!enabled || !mediaEnabled, 'Requires disposable loopback LiveKit test stack.');
  test.setTimeout(150_000);
  const stamp = randomUUID().slice(0, 8);
  const owner = await createAccount(`studio-audio-owner-${stamp}@example.test`);
  const member = await createAccount(`studio-audio-member-${stamp}@example.test`);
  const contexts: Array<Awaited<ReturnType<Browser['newContext']>>> = [];
  let pages: Page[] = [];
  try {
    const response = await postJson(
      owner.client,
      '/api/workspaces',
      {
        name: 'Studio audio verification',
        slug: `studio-audio-${stamp}`,
        officeTemplate: 'studio',
      },
      owner.csrf,
      true,
    );
    expect(response.status()).toBe(201);
    const { workspace } = (await response.json()) as { workspace: { id: string } };
    await inviteStudioMember(workspace.id, owner, member);
    const offices = await Promise.all(
      [owner, member].map(({ client }) => companyPage(browser, client, workspace.id)),
    );
    pages = offices.map(({ page }) => page);
    contexts.push(...offices.map(({ context }) => context));
    const [first, second] = pages as [Page, Page];
    const audio = (page: Page) => page.locator('.office-proximity-audio-output audio');
    for (const { context, page } of offices) {
      await context.grantPermissions(['microphone'], { origin: appOrigin });
      await enterStudio(page);
    }
    await studioClick(first, 6, 28);
    await expect(studioMap(first)).toHaveAttribute('data-local-tile', '6,28');
    await studioClick(second, 7, 28);
    await expect(studioMap(second)).toHaveAttribute('data-local-tile', '7,28');
    for (const page of pages)
      await page.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    for (const page of pages) {
      await expect(page.locator('.office-voice-status')).toContainText(
        'In a 2-person conversation',
      );
    }
    await Promise.all(
      pages.map((page) =>
        page.getByRole('button', { name: 'Activate proximity microphone' }).click(),
      ),
    );
    for (const page of pages) {
      await expect(page.locator('#office-microphone-help')).toHaveText('Your microphone is on.', {
        timeout: 20_000,
      });
    }
    const assertDecoded = async () => {
      for (const page of pages) {
        await expect(audio(page)).toHaveCount(1, { timeout: 15_000 });
        const enable = page.getByRole('button', { name: 'Enable speaker audio' });
        if (await enable.isVisible()) await enable.click();
        await startRemoteAudioProbe(page);
        await expect
          .poll(async () => (await readRemoteAudioProbe(page)).activeSamples, { timeout: 15_000 })
          .toBeGreaterThan(8);
      }
    };
    await assertDecoded();
    await second.getByRole('button', { name: 'Mute proximity microphone' }).click();
    await expect
      .poll(async () => (await readRemoteAudioProbe(first)).currentSilentMs, { timeout: 10_000 })
      .toBeGreaterThan(450);
    const beforeUnmute = (await readRemoteAudioProbe(first)).activeSamples;
    await second.getByRole('button', { name: 'Unmute proximity microphone' }).click();
    await expect
      .poll(async () => (await readRemoteAudioProbe(first)).activeSamples)
      .toBeGreaterThan(beforeUnmute + 5);
    await Promise.all(pages.map(stopRemoteAudioProbe));
    for (const page of pages)
      await page.getByRole('button', { name: 'Opt out of nearby voice' }).click();

    await studioClick(first, 4, 20);
    await expect(studioMap(first)).toHaveAttribute('data-local-tile', '4,20', { timeout: 12_000 });
    await studioClick(second, 5, 21);
    await expect(studioMap(second)).toHaveAttribute('data-local-tile', '5,21', { timeout: 12_000 });
    for (const page of pages)
      await page.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    // The two avatars are within 2 tiles but on opposite sides of a private-office opening.
    await second.waitForTimeout(650);
    for (const page of pages) {
      await expect(page.locator('.office-voice-status')).not.toContainText(
        'In a 2-person conversation',
      );
      await expect(audio(page)).toHaveCount(0);
      await page.getByRole('button', { name: 'Opt out of nearby voice' }).click();
    }

    await studioClick(first, 12, 20);
    await expect(first.getByText(/You are inside Small meeting room\./)).toBeVisible({
      timeout: 12_000,
    });
    await studioClick(second, 13, 20);
    await expect(second.getByText(/You are inside Small meeting room\./)).toBeVisible({
      timeout: 12_000,
    });
    for (const page of pages)
      await page.getByRole('button', { name: 'Join meeting', exact: true }).click();
    for (const page of pages) {
      const microphone = page.locator('button[aria-describedby="office-microphone-help"]');
      if ((await microphone.getAttribute('aria-pressed')) !== 'true') await microphone.click();
    }
    await assertDecoded();
    await studioClick(second, 13, 21);
    await expect(studioMap(second)).toHaveAttribute('data-local-tile', '13,21', {
      timeout: 12_000,
    });
    await expect(audio(second)).toHaveCount(0);
    await expect(audio(first)).toHaveCount(0);
    await expect
      .poll(async () => (await readRemoteAudioProbe(second)).currentSilentMs, { timeout: 10_000 })
      .toBeGreaterThan(450);
  } finally {
    await Promise.allSettled(pages.map(stopRemoteAudioProbe));
    await Promise.all(contexts.map((context) => context.close()));
    await Promise.all([owner.client.dispose(), member.client.dispose()]);
  }
});

test('Studio eight-office load converges for twenty and isolates three decoded audio pairs', async ({
  browser,
}, testInfo) => {
  test.skip(!enabled || !mediaEnabled, 'Requires disposable loopback LiveKit test stack.');
  test.setTimeout(360_000);
  type Point = { x: number; y: number };
  type Participant = {
    participationId: string;
    position: Point;
    lastProcessedInputSequence: number;
    seatId: string | null;
  };
  type Snapshot = {
    officeEpoch: string;
    stateVersion: number;
    serverTime: number;
    participants: Participant[];
    removedParticipationIds?: string[];
  };
  type Ready = { participationId: string; mapVersion: string; snapshot: Snapshot };
  type CanvasSample = { at: number; points: Point[] };
  type CanvasWindow = Window & {
    studioDraws?: CanvasSample[];
    studioAnimationFrames?: number[];
    studioSubscriptions?: Array<{ at: number; identity: string | undefined }>;
  };
  type MotionSample = {
    at: number;
    serverTime: number;
    id: string;
    position: Point;
    sequence: number;
  };
  const traceMotion = process.env['LIVE_OFFICE_LOAD_TRACE_MOTION'] === '1';
  const observe = () => {
    let ready: Ready | undefined;
    const participants = new Map<string, Participant>();
    const samples: MotionSample[] = [];
    const lifecycle: Array<{ at: number; event: string; reason?: string }> = [];
    const packets: Array<{ at: number; ageMs: number; version: number; gap: number }> = [];
    let version = 0;
    return {
      participants,
      samples,
      packets,
      lifecycle,
      get ready() {
        return ready;
      },
      observe(event: string, value: Ready | Snapshot) {
        const receivedAt = Date.now();
        if (event === 'office:ready') ready = value as Ready;
        const snapshot = event === 'office:ready' ? (value as Ready).snapshot : (value as Snapshot);
        if (event !== 'world:delta') participants.clear();
        const base = (snapshot as Snapshot & { baseVersion?: number }).baseVersion ?? version;
        packets.push({
          at: receivedAt,
          ageMs: receivedAt - snapshot.serverTime,
          version: snapshot.stateVersion,
          gap: base - version,
        });
        version = snapshot.stateVersion;
        for (const id of snapshot.removedParticipationIds ?? []) participants.delete(id);
        for (const participant of snapshot.participants) {
          const previous = participants.get(participant.participationId)?.position;
          participants.set(participant.participationId, participant);
          if (previous?.x !== participant.position.x || previous?.y !== participant.position.y) {
            samples.push({
              at: receivedAt,
              serverTime: snapshot.serverTime,
              id: participant.participationId,
              position: participant.position,
              sequence: participant.lastProcessedInputSequence,
            });
          }
        }
      },
    };
  };
  const accounts: Array<Awaited<ReturnType<typeof createAccount>>> = [];
  const contexts: Array<Awaited<ReturnType<Browser['newContext']>>> = [];
  const sockets: Array<import('../../apps/api/node_modules/socket.io-client').Socket> = [];
  const pages: Page[] = [];
  const streams = Array.from({ length: 20 }, observe);
  const browserCommands = Array.from(
    { length: 8 },
    () => [] as Array<{ at: number; event: string; waypoint?: string }>,
  );
  const report: Record<string, unknown> = {};
  const resumeState = process.env['LIVE_OFFICE_LOAD_RESUME'];
  const frameCap = Number(process.env['LIVE_OFFICE_LOAD_RENDER_FPS'] ?? '0');
  report.testRendererFrameCap = frameCap || null;
  const stamp = randomUUID().slice(0, 6);
  const tile = ({ x, y }: Point) => [Math.floor(x / 32), Math.floor(y / 32)] as const;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const audio = (page: Page) => page.locator('.office-proximity-audio-output audio');
  const identities = (page: Page) =>
    audio(page).evaluateAll((elements) =>
      elements.map((element) => {
        const media = element as HTMLAudioElement;
        return {
          identity: media.dataset.participantId,
          trackIds:
            media.srcObject instanceof MediaStream
              ? media.srcObject.getAudioTracks().map(({ id }) => id)
              : [],
          playing: !media.paused && !media.muted,
        };
      }),
    );
  const orthogonal = process.env['LIVE_OFFICE_LOAD_PRESET'] === 'studio-orthogonal';
  const preset = orthogonal ? 'studio-orthogonal' : 'studio';
  report.layoutPreset = preset;
  const meetingCount = orthogonal ? 2 : 4;
  const goals = orthogonal
    ? [
        { zone: 'Large meeting', tx: 20, ty: 21, partner: 1 },
        { zone: 'Large meeting', tx: 21, ty: 21, partner: 0 },
        { zone: 'Private office 1', tx: 3, ty: 16, partner: 3 },
        { zone: 'Private office 1', tx: 4, ty: 16, partner: 2 },
        { zone: 'Private office 2', tx: 31, ty: 16, partner: 5 },
        { zone: 'Private office 2', tx: 32, ty: 16, partner: 4 },
        { zone: 'Private office 5', tx: 3, ty: 24, partner: null },
        { zone: 'Corridor', tx: 4, ty: 25, partner: null },
      ]
    : [
        { zone: 'Small meeting', tx: 12, ty: 20, partner: 1 },
        { zone: 'Small meeting', tx: 13, ty: 20, partner: 0 },
        { zone: 'Large meeting', tx: 42, ty: 20, partner: 3 },
        { zone: 'Large meeting', tx: 43, ty: 20, partner: 2 },
        { zone: 'Team Studio', tx: 26, ty: 13, partner: 5 },
        { zone: 'Team Studio', tx: 27, ty: 13, partner: 4 },
        { zone: 'Private office', tx: 4, ty: 20, partner: null },
        { zone: 'Corridor', tx: 5, ty: 21, partner: null },
      ];
  try {
    let workspace: { id: string };
    let officePath: string;
    let published: Awaited<ReturnType<typeof json>>;
    const saved = resumeState
      ? await readFile(resumeState, 'utf8').then(
          (body) =>
            JSON.parse(body) as {
              workspace: { id: string };
              officePath: string;
              published: Awaited<ReturnType<typeof json>>;
              publish: unknown;
              accounts: Array<
                Omit<Awaited<ReturnType<typeof createAccount>>, 'client'> & {
                  storageState: Awaited<ReturnType<APIRequestContext['storageState']>>;
                }
              >;
            },
          (error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
            return undefined;
          },
        )
      : undefined;
    if (saved) {
      ({ workspace, officePath, published } = saved);
      expect(published.layoutPreset).toBe(preset);
      report.workspace = workspace.id;
      report.publish = saved.publish;
      for (const { storageState, ...account } of saved.accounts) {
        accounts.push({
          ...account,
          client: await request.newContext({
            baseURL: appOrigin,
            ignoreHTTPSErrors: true,
            storageState,
            extraHTTPHeaders: {
              Origin: appOrigin,
              'Sec-Fetch-Site': 'same-origin',
              'X-Requested-With': 'XMLHttpRequest',
            },
          }),
        });
      }
    } else {
      const owner = await createAccount(`studio-load-${stamp}-00@example.test`);
      accounts.push(owner);
      const response = await postJson(
        owner.client,
        '/api/workspaces',
        { name: 'Disposable Studio load', slug: `studio-load-${stamp}`, officeTemplate: preset },
        owner.csrf,
        true,
      );
      expect(response.status()).toBe(201);
      const { workspace: freshWorkspace } = (await response.json()) as {
        workspace: { id: string };
      };
      workspace = freshWorkspace;
      report.workspace = workspace.id;
      const workspacePath = `/api/workspaces/${workspace.id}`;
      const detail = (await json(await owner.client.get(workspacePath))).workspace as {
        officeId: string;
      };
      officePath = `${workspacePath}/offices/${detail.officeId}`;
      const bootstrap = async () => {
        const response = await owner.client.get(officePath);
        expect(response.status()).toBe(200);
        return json(response);
      };
      type Placement = {
        id: string;
        templateId: string;
        origin: { tx: number; ty: number };
        name?: string;
      };
      const original = await bootstrap();
      expect(
        (original.layout as Placement[]).filter((row) => row.templateId === 'private-office'),
      ).toHaveLength(6);
      const editorContext = await browser.newContext({
        storageState: await owner.client.storageState(),
        ignoreHTTPSErrors: true,
        viewport: { width: 1480, height: 1020 },
      });
      contexts.push(editorContext);
      const editorPage = await editorContext.newPage();
      await editorPage.goto(`${appOrigin}/companies/${workspace.id}/settings`);
      await editorPage.getByRole('button', { name: 'Edit office map' }).click();
      const editor = editorPage.getByRole('region', { name: 'Office map editor' });
      await editor.getByLabel('Module to move').selectOption('private-office-1');
      await editor.getByLabel('Module name').fill('Load test sketchbook');
      await editor.getByRole('button', { name: 'Apply name' }).click();
      await editor.getByRole('button', { name: 'Save draft' }).click();
      await expect(editor.getByRole('status')).toHaveText('Draft saved.');
      await editor.getByRole('button', { name: 'Publish map' }).click();
      await expect(editor.getByRole('status')).toContainText('Map published.');
      const named = await bootstrap();
      await editor.getByLabel('Private offices', { exact: true }).fill('8');
      await editor.getByRole('button', { name: 'Apply count' }).click();
      await editor.getByRole('button', { name: 'Save draft' }).click();
      await expect(editor.getByRole('status')).toHaveText('Draft saved.');
      expect((await bootstrap()).layout).toEqual(named.layout);
      await editor.getByRole('button', { name: 'Publish map' }).click();
      await expect(editor.getByRole('status')).toContainText('Map published.');
      published = await bootstrap();
      const previous = named.layout as Placement[];
      const expanded = published.layout as Placement[];
      expect(previous.find(({ id }) => id === 'private-office-1')?.name).toBe(
        'Load test sketchbook',
      );
      expect(expanded.slice(0, previous.length)).toEqual(previous);
      expect(expanded.slice(previous.length).map(({ id }) => id)).toEqual([
        'private-office-7',
        'private-office-8',
      ]);
      expect(published.mapVersion).not.toBe(named.mapVersion);
      report.publish = {
        before: named.mapVersion,
        after: published.mapVersion,
        previous,
        expanded,
      };
      await editorPage.screenshot({ path: testInfo.outputPath('studio-load-editor.png') });
      await editorContext.close();
      console.log('Published 8 offices with every prior placement retained.');

      for (let offset = 1; offset < 20; offset += 3) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(3, 20 - offset) }, async (_, index) => {
            const number = String(offset + index).padStart(2, '0');
            const member = await createAccount(`studio-load-${stamp}-${number}@example.test`);
            await inviteStudioMember(workspace.id, owner, member);
            return member;
          }),
        );
        accounts.push(...batch);
      }
      if (resumeState) {
        await writeFile(
          resumeState,
          JSON.stringify({
            workspace,
            officePath,
            published,
            publish: report.publish,
            accounts: await Promise.all(
              accounts.map(async ({ client, ...account }) => ({
                ...account,
                storageState: await client.storageState(),
              })),
            ),
          }),
          { mode: 0o600 },
        );
      }
    }
    console.log('Verified and invited 20 unique accounts.');
    const browserJoinTimes: number[] = [];
    report.browserJoinTimesMs = browserJoinTimes;
    report.cachedServerIssuedCsrfOnRetry = Boolean(saved);
    for (let index = 0; index < 8; index++) {
      const context = await browser.newContext({
        storageState: await accounts[index]!.client.storageState(),
        ignoreHTTPSErrors: true,
      });
      if (frameCap > 0) {
        await context.addInitScript((fps) => {
          const nativeFrame = window.requestAnimationFrame.bind(window);
          const waiting = new Map<number, FrameRequestCallback>();
          let frameId = 0;
          let scheduled = false;
          let previousFrame = 0;
          function schedule() {
            if (scheduled || waiting.size === 0) return;
            scheduled = true;
            setTimeout(
              () =>
                nativeFrame((timestamp) => {
                  scheduled = false;
                  previousFrame = timestamp;
                  const callbacks = [...waiting.values()];
                  waiting.clear();
                  for (const callback of callbacks) callback(timestamp);
                  schedule();
                }),
              Math.max(0, 1000 / fps - (performance.now() - previousFrame)),
            );
          }
          window.requestAnimationFrame = (callback) => {
            waiting.set(++frameId, callback);
            schedule();
            return frameId;
          };
          window.cancelAnimationFrame = (id) => {
            waiting.delete(id);
          };
        }, frameCap);
      }
      const page = await context.newPage();
      pages.push(page);
      contexts.push(context);
      await context.grantPermissions(['microphone'], { origin: appOrigin });
      if (saved) {
        // Reuse the token issued when this exact disposable session verified its email.
        // The actual office/API mutations still undergo all server checks.
        await page.route('**/api/auth/csrf', (route) =>
          route.fulfill({ json: { csrfToken: accounts[index]!.csrf } }),
        );
      }
      page.on('websocket', (webSocket) => {
        if (!webSocket.url().includes('/socket.io/')) return;
        webSocket.on('framesent', ({ payload }) => {
          if (typeof payload !== 'string' || !payload.startsWith('42/office,')) return;
          const start = payload.indexOf('[');
          if (start < 0) return;
          const [event, command] = JSON.parse(payload.slice(start)) as [
            string,
            {
              payload: { waypoint?: { tx: number; ty: number } };
            },
          ];
          if (!['world:input', 'seat:sit', 'seat:stand'].includes(event)) return;
          const waypoint = command.payload.waypoint;
          browserCommands[index]!.push({
            at: Date.now(),
            event,
            ...(waypoint && { waypoint: `${waypoint.tx},${waypoint.ty}` }),
          });
        });
        webSocket.on('framereceived', ({ payload }) => {
          if (typeof payload !== 'string' || !payload.startsWith('42/office,')) return;
          const [event, value] = JSON.parse(payload.slice('42/office,'.length)) as [
            string,
            Ready | Snapshot,
          ];
          if (['office:ready', 'world:delta', 'world:snapshot'].includes(event))
            streams[index]!.observe(event, value);
          if (event === 'office:access-ended') {
            streams[index]!.lifecycle.push({
              at: Date.now(),
              event,
              reason: (value as unknown as { reason: string }).reason,
            });
          }
        });
        webSocket.on('close', () =>
          streams[index]!.lifecycle.push({ at: Date.now(), event: 'close' }),
        );
      });
      const route = officePath.replace(/^\/api\/workspaces\//, '/companies/');
      await page.goto(`${appOrigin}${route}/entry`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible({
        timeout: 25_000,
      });
      await page.evaluate((traceMotion) => {
        const draws: CanvasSample[] = [];
        let frame: CanvasSample | undefined;
        let endScheduled = false;
        const original = CanvasRenderingContext2D.prototype.drawImage;
        const target = window as CanvasWindow;
        target.studioDraws = draws;
        if (traceMotion) {
          const callbacks: number[] = [];
          target.studioAnimationFrames = callbacks;
          const recordCallback = () => {
            callbacks.push(Date.now());
            if (callbacks.length > 6000) callbacks.shift();
            requestAnimationFrame(recordCallback);
          };
          requestAnimationFrame(recordCallback);
        }
        target.studioSubscriptions = [];
        const observer = new MutationObserver((changes) => {
          for (const change of changes)
            for (const node of change.addedNodes) {
              if (
                node instanceof HTMLAudioElement &&
                node.closest('.office-proximity-audio-output')
              ) {
                target.studioSubscriptions!.push({
                  at: Date.now(),
                  identity: node.dataset.participantId,
                });
              }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        CanvasRenderingContext2D.prototype.drawImage = function (image, ...coordinates: number[]) {
          if (
            image instanceof HTMLImageElement &&
            image.naturalWidth === 192 &&
            image.naturalHeight === 192 &&
            coordinates.length === 8 &&
            coordinates[2] === 48 &&
            coordinates[3] === 48
          ) {
            const transform = this.getTransform();
            const foot = transform.transformPoint(
              new DOMPoint(coordinates[4]! + 24, coordinates[5]! + 43),
            );
            frame ??= { at: Date.now(), points: [] };
            frame.points.push({ x: foot.x, y: foot.y });
            if (!endScheduled) {
              endScheduled = true;
              queueMicrotask(() => {
                if (frame) draws.push(frame);
                if (draws.length > 2400) draws.shift();
                frame = undefined;
                endScheduled = false;
              });
            }
          }
          Reflect.apply(original, this, [image, ...coordinates]);
        };
      }, traceMotion);
    }
    for (const [index, page] of pages.entries()) {
      const joinStartedAt = Date.now();
      await page.getByRole('button', { name: 'Join', exact: true }).click({ timeout: 25_000 });
      await expect(studioMap(page)).toHaveAttribute('data-avatar-style', 'studio', {
        timeout: 35_000,
      });
      await expect(studioMap(page)).toHaveAttribute('data-private-office-count', '8');
      browserJoinTimes.push(Date.now() - joinStartedAt);
      console.log('Authenticated browser joined:', index + 1, 'in', browserJoinTimes.at(-1), 'ms.');
      await expect(studioMap(page)).toHaveAttribute(
        'data-map-version',
        String(published.mapVersion),
      );
    }
    const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
    const { io } = requireApi(
      'socket.io-client',
    ) as typeof import('../../apps/api/node_modules/socket.io-client');
    for (let index = 8; index < 20; index++) {
      const account = accounts[index]!;
      const protocolVersion = Number(published.protocolVersion);
      const response = await postJson(
        account.client,
        `${officePath}/join-ticket`,
        {
          mapVersion: published.mapVersion,
          protocolVersion,
        },
        account.csrf,
      );
      expect(response.status()).toBe(201);
      const { ticket } = await json(response);
      const socket = io(`${appOrigin}/office`, {
        autoConnect: false,
        forceNew: true,
        reconnection: false,
        transports: ['websocket'],
        rejectUnauthorized: false,
        extraHeaders: { Origin: appOrigin },
        auth: { ticket, protocolVersion },
      });
      sockets.push(socket);
      socket.on('disconnect', (reason) =>
        streams[index]!.lifecycle.push({ at: Date.now(), event: 'disconnect', reason }),
      );
      socket.on('office:access-ended', ({ reason }: { reason: string }) =>
        streams[index]!.lifecycle.push({ at: Date.now(), event: 'office:access-ended', reason }),
      );
      socket.on('office:ready', (event: Ready) => streams[index]!.observe('office:ready', event));
      socket.on('world:delta', (event: Snapshot) => streams[index]!.observe('world:delta', event));
      socket.on('world:snapshot', (event: Snapshot) =>
        streams[index]!.observe('world:snapshot', event),
      );
      await new Promise<void>((resolve, reject) => {
        socket.once('office:ready', () => resolve());
        socket.once('connect_error', reject);
        socket.connect();
      });
    }
    await expect
      .poll(() => streams.map((stream) => stream.participants.size))
      .toEqual(Array(20).fill(20));
    expect(streams.every(({ ready }) => ready?.mapVersion === published.mapVersion)).toBe(true);
    const ids = streams.map((stream) => stream.ready!.participationId);
    expect(new Set(ids).size).toBe(20);
    report.admission = {
      browserClients: pages.length,
      socketClients: sockets.length,
      count: ids.length,
    };
    console.log('All 20 sessions concurrently received the same new map version and roster.');

    const now = () => streams[0]!.participants;
    const before = new Map(now());
    const movementStart = Date.now();
    const send = (index: number, sequence: number, waypoint?: { tx: number; ty: number }) => {
      const ready = streams[index]!.ready!;
      sockets[index - 8]!.emit('world:input', {
        eventId: randomUUID(),
        officeEpoch: ready.snapshot.officeEpoch,
        payload: { sequence, dx: 0, dy: 0, ...(waypoint && { waypoint }) },
      });
    };
    const rawGoals = orthogonal
      ? [
          { zone: 'Private office 3', tx: 9, ty: 16 },
          { zone: 'Private office 4', tx: 37, ty: 16 },
          { zone: 'Private office 5', tx: 5, ty: 23 },
          { zone: 'Private office 6', tx: 37, ty: 24 },
          { zone: 'Private office 7 (new)', tx: 9, ty: 24 },
          { zone: 'Private office 8 (new)', tx: 31, ty: 24 },
          { zone: 'Open area north west', tx: 6, ty: 4 },
          { zone: 'Open area north center', tx: 21, ty: 5 },
          { zone: 'Open area north east', tx: 36, ty: 4 },
          { zone: 'East connector', tx: 27, ty: 15 },
          { zone: 'Reception', tx: 20, ty: 34 },
          { zone: 'Reception', tx: 21, ty: 34 },
        ]
      : [
          { zone: 'Private office 1', tx: 11, ty: 7 },
          { zone: 'Private office 2', tx: 17, ty: 7 },
          { zone: 'Private office 3', tx: 35, ty: 7 },
          { zone: 'Private office 4', tx: 41, ty: 7 },
          { zone: 'Private office 6', tx: 51, ty: 19 },
          { zone: 'Private office 7 (new)', tx: 23, ty: 7 },
          { zone: 'Private office 8 (new)', tx: 29, ty: 7 },
          { zone: 'Garden', tx: 4, ty: 7 },
          { zone: 'Lounge', tx: 50, ty: 7 },
          { zone: 'Desks', tx: 20, ty: 25 },
          { zone: 'Reception', tx: 7, ty: 30 },
          { zone: 'Reception', tx: 8, ty: 30 },
        ];
    const geometry =
      published.geometry as import('../../packages/world/dist/index.js').OfficeGeometry;
    const bounds = { width: geometry.widthTiles * 32, height: geometry.heightTiles * 32 };
    const collision = createTileCollision({
      blockedEdges: geometry.blockedEdges,
      blockedTiles: [
        ...(geometry.blockedTiles ?? []),
        ...geometry.objects.flatMap(({ blockedTiles }) => blockedTiles),
      ],
    });
    const rawMoveResults: Array<Record<string, unknown>> = [];
    report.socketRoutes = rawMoveResults;
    const moveSocket = async (offset: number) => {
      const index = offset + 8;
      const id = ids[index]!;
      const stream = streams[index]!;
      const goal = rawGoals[offset]!;
      const route = workspaceRoute(pixelToTile(before.get(id)!.position), goal, bounds, collision, {
        occupied: new Set(),
        adjacent: false,
      });
      if (!route) throw new Error(`No route to ${goal.zone}.`);
      let sequence = 0;
      let sentWaypoint: (typeof route)[number] | undefined;
      const deadline = Date.now() + 55_000;
      while (route.length && Date.now() < deadline) {
        const next = route[0]!;
        const observerPosition = stream.participants.get(id)?.position;
        if (!observerPosition)
          throw new Error(
            `Socket ${index} lost its own participant during movement: ${JSON.stringify(stream.lifecycle)}`,
          );
        const { x, y } = observerPosition;
        const dx = (next.tx + 0.5) * 32 - x;
        const dy = (next.ty + 0.5) * 32 - y;
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
          route.shift();
          continue;
        }
        if (next !== sentWaypoint) {
          sentWaypoint = next;
          send(index, ++sequence, next);
        }
        await sleep(40);
      }
      send(index, sequence + 1);
      rawMoveResults.push({
        index,
        goal,
        tile: tile(stream.participants.get(id)!.position),
        remainingWaypoints: route.length,
        sentWaypoints: sequence,
      });
      if (route.length)
        throw new Error(
          `Socket ${index} stopped before ${goal.zone}, last ${JSON.stringify(stream.participants.get(id)!.position)}, next ${JSON.stringify(route[0])}.`,
        );
    };
    const roomMoves: Array<Array<{ at: number; tile: string | null; doorLabel: string | null }>> =
      pages.map(() => []);
    report.browserRoutes = roomMoves;
    const moveBrowser = async (page: Page, index: number) => {
      const { tx, ty } = goals[index]!;
      const map = studioMap(page);
      const goal = `${tx},${ty}`;
      const attempts = roomMoves[index]!;
      const deadline = Date.now() + 55_000;
      const click = async () => {
        attempts.push({
          at: Date.now() - movementStart,
          tile: await map.getAttribute('data-local-tile'),
          doorLabel: await map.getAttribute('aria-label'),
        });
        await studioClick(page, tx, ty);
      };
      await click();
      let lastTile: string | null = null;
      let lastProgressAt = Date.now();
      while (Date.now() < deadline) {
        const currentTile = await map.getAttribute('data-local-tile');
        if (currentTile === goal) return;
        if (currentTile !== lastTile) {
          lastTile = currentTile;
          lastProgressAt = Date.now();
        } else if (Date.now() - lastProgressAt >= 2_500 && attempts.length < 5) {
          console.log('Reissued click route with no tile progress:', index, currentTile, goal);
          await click();
          lastProgressAt = Date.now();
        }
        await sleep(400);
      }
      await expect(map).toHaveAttribute('data-local-tile', goal);
    };
    const burst = process.env['LIVE_OFFICE_LOAD_BURST'] === '1';
    report.movementMode = burst ? 'concurrent' : 'phased';
    if (burst) {
      await Promise.all([
        ...sockets.map((_, index) => moveSocket(index)),
        ...pages.map(moveBrowser),
      ]);
    } else {
      for (let offset = 0; offset < sockets.length; offset += 3) {
        await Promise.all(
          sockets.slice(offset, offset + 3).map((_, index) => moveSocket(offset + index)),
        );
      }
      for (let offset = 0; offset < pages.length; offset += 2) {
        await Promise.all(
          pages.slice(offset, offset + 2).map((page, index) => moveBrowser(page, offset + index)),
        );
      }
    }
    await expect
      .poll(async () => {
        const positionBefore = ids.map((id) => now().get(id)!.position);
        await sleep(350);
        return ids.every((id, index) => {
          const position = now().get(id)!.position;
          return position.x === positionBefore[index]!.x && position.y === positionBefore[index]!.y;
        });
      })
      .toBe(true);
    const settled = new Map(now());
    expect(
      ids.filter((id) => {
        const a = before.get(id)!.position;
        const b = settled.get(id)!.position;
        return a.x !== b.x || a.y !== b.y;
      }),
    ).toHaveLength(20);
    for (const stream of streams)
      expect([...stream.participants.entries()].sort()).toEqual([...settled.entries()].sort());
    const expectedTiles = [...goals, ...rawGoals].map(({ tx, ty }) => [tx, ty]);
    const actualTiles = ids.map((id) => tile(settled.get(id)!.position));
    const areaIds = orthogonal
      ? [
          'large',
          'large',
          'private-office-1',
          'private-office-1',
          'private-office-2',
          'private-office-2',
          'private-office-5',
          null,
          'private-office-3',
          'private-office-4',
          'private-office-5',
          'private-office-6',
          'private-office-7',
          'private-office-8',
          null,
          null,
          null,
          null,
          'reception',
          'reception',
        ]
      : [
          'small',
          'small',
          'large',
          'large',
          'team-studio',
          'team-studio',
          'private-office-5',
          null,
          'private-office-1',
          'private-office-2',
          'private-office-3',
          'private-office-4',
          'private-office-6',
          'private-office-7',
          'private-office-8',
          'garden',
          'lounge',
          'desks',
          'reception',
          'reception',
        ];
    const placements = published.layout as WorkspaceLayoutPlacement[];
    const inside = (
      [tx, ty]: readonly [number, number],
      region: {
        tx: number;
        ty: number;
        width: number;
        height: number;
      },
    ) =>
      tx >= region.tx &&
      tx < region.tx + region.width &&
      ty >= region.ty &&
      ty < region.ty + region.height;
    for (const [index, areaId] of areaIds.entries()) {
      const actual = actualTiles[index]!;
      if (areaId === null) {
        expect(
          getWorkspaceLayoutProfile(preset).corridors.some((region) => inside(actual, region)),
        ).toBe(true);
      } else {
        const placement = placements.find(({ id }) => id === areaId)!;
        const { width, height } = getWorkspaceLayoutTemplate(placement.templateId, preset);
        expect(inside(actual, { ...placement.origin, width, height })).toBe(true);
      }
      if (index < pages.length) expect(actual).toEqual(expectedTiles[index]);
    }
    const tileDeviations = actualTiles.flatMap((actual, index) => {
      const expected = expectedTiles[index]!;
      return actual[0] === expected[0] && actual[1] === expected[1]
        ? []
        : [{ index, expected, actual }];
    });
    report.tileDeviations = tileDeviations;
    if (tileDeviations.length)
      console.log('Final tile deviations within expected areas:', tileDeviations);

    const canvas: Array<{
      matching: number;
      frames: number;
      largestFrameGapMs: number;
      changedPositionFrames: number;
      visibility: DocumentVisibilityState;
      drawCount: number;
      worstAxisErrorPx: number;
      finalFeet: Point[];
    }> = [];
    const positions = [...settled.values()].map(({ position }) => position);
    const frameTimelines: { actorId: string; draws: CanvasSample[]; raf: number[] }[] = [];
    const lastMotionAt = Math.max(0, ...streams[0]!.samples.map(({ at }) => at));
    for (const [index, page] of pages.entries()) {
      const { frames, visibility, raf } = await page.evaluate(() => ({
        frames: (window as CanvasWindow).studioDraws ?? [],
        visibility: document.visibilityState,
        raf: (window as CanvasWindow).studioAnimationFrames ?? [],
      }));
      if (traceMotion)
        frameTimelines.push({
          actorId: ids[index]!,
          draws: frames.filter(({ at }) => at >= movementStart && at <= lastMotionAt + 400),
          raf: raf.filter((at) => at >= movementStart && at <= lastMotionAt + 400),
        });
      const last = frames.at(-1)?.points ?? [];
      const unmatched = last.slice();
      let matching = 0;
      let worstAxisErrorPx = 0;
      for (const position of positions) {
        const index = unmatched.findIndex(
          ({ x, y }) => Math.max(Math.abs(x - position.x), Math.abs(y - position.y)) <= 1.01,
        );
        if (index >= 0) {
          matching++;
          const { x, y } = unmatched[index]!;
          worstAxisErrorPx = Math.max(
            worstAxisErrorPx,
            Math.abs(x - position.x),
            Math.abs(y - position.y),
          );
          unmatched.splice(index, 1);
        }
      }
      const duringMovement = frames.filter(({ at }) => at >= movementStart);
      canvas.push({
        matching,
        drawCount: last.length,
        worstAxisErrorPx,
        finalFeet: last,
        visibility,
        frames: duringMovement.length,
        changedPositionFrames: duringMovement.slice(1).filter(({ points }, index) => {
          const previous = duringMovement[index]!.points;
          return (
            previous.length !== points.length ||
            points.some(({ x, y }, pointIndex) => {
              const old = previous[pointIndex];
              return x !== old?.x || y !== old.y;
            })
          );
        }).length,
        largestFrameGapMs: Math.max(
          0,
          ...duringMovement.slice(1).map(({ at }, i) => at - duringMovement[i]!.at),
        ),
      });
    }
    const motion = streams.map((stream) => {
      const movements = stream.samples.filter(({ at }) => at >= movementStart);
      let maxWorldStepPx = 0;
      let maxWorldSampleGapMs = 0;
      const finalTimes: number[] = [];
      for (const id of ids) {
        const actor = movements.filter((sample) => sample.id === id);
        const final = actor.at(-1);
        if (final) finalTimes.push(final.at);
        for (let i = 1; i < actor.length; i++) {
          const a = actor[i - 1]!;
          const b = actor[i]!;
          maxWorldStepPx = Math.max(
            maxWorldStepPx,
            Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y),
          );
          maxWorldSampleGapMs = Math.max(maxWorldSampleGapMs, b.at - a.at);
        }
      }
      return {
        movementSamples: movements.length,
        packetVersionGaps: stream.packets.filter(({ at, gap }) => at >= movementStart && gap !== 0)
          .length,
        maxPacketReceiptAgeMs: Math.max(
          ...stream.packets.filter(({ at }) => at >= movementStart).map(({ ageMs }) => ageMs),
        ),
        maxWorldStepPx,
        maxWorldSampleGapMs,
        finalTimes,
      };
    });
    report.movement = {
      elapsedMs: Date.now() - movementStart,
      settled: ids.map((id, index) => ({
        index,
        id,
        zone: [...goals, ...rawGoals][index]!.zone,
        position: settled.get(id)!.position,
        tile: tile(settled.get(id)!.position),
      })),
      maxFinalArrivalSpreadMs: Math.max(
        ...ids.map((_, index) => {
          const times = motion.map(({ finalTimes }) => finalTimes[index]!);
          return Math.max(...times) - Math.min(...times);
        }),
      ),
      motion,
      canvas,
      renderer: { browser: browser.version(), toleranceWorldPxPerAxis: 1.01 },
    };
    if (traceMotion) {
      const timeline = testInfo.outputPath('studio-motion-timeline.json');
      await writeFile(
        timeline,
        JSON.stringify({
          movementStart,
          lastMotionAt,
          ids,
          streams: streams.map(({ samples }) =>
            samples.filter(({ at }) => at >= movementStart && at <= lastMotionAt + 400),
          ),
          canvases: frameTimelines,
        }),
      );
      await testInfo.attach('studio-motion-timeline', {
        path: timeline,
        contentType: 'application/json',
      });
    }
    console.log(
      'All 20 world observers converged after movement. Renderer counts:',
      canvas.map(({ matching }) => matching),
    );

    for (let index = 0; index < meetingCount; index++) {
      const { zone } = goals[index]!;
      await expect(
        pages[index]!.getByText(new RegExp(`You are inside ${zone} room\\.`)),
      ).toBeVisible();
    }
    for (const page of pages.slice(meetingCount))
      await page.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await Promise.all(
      pages
        .slice(0, meetingCount)
        .map((page) => page.getByRole('button', { name: 'Join meeting', exact: true }).click()),
    );
    for (const page of pages.slice(meetingCount, 6)) {
      await expect(page.locator('.office-voice-status')).toContainText(
        'In a 2-person conversation',
        { timeout: 20_000 },
      );
    }
    await Promise.all(
      pages.slice(0, 6).map(async (page, index) => {
        const button =
          index < meetingCount
            ? page.locator('button[aria-describedby="office-microphone-help"]')
            : page.getByRole('button', { name: 'Activate proximity microphone' });
        if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
      }),
    );
    const audioBefore: Array<{
      at: number;
      activeWorldReceivers: number;
      observed: Awaited<ReturnType<typeof identities>>[];
      decoded: Awaited<ReturnType<typeof readRemoteAudioProbe>>[];
    }> = [];
    const audioReport: Record<string, unknown> = { goals, windows: audioBefore };
    report.audio = audioReport;
    const probeSetup = await Promise.allSettled(
      pages.slice(0, 6).map(async (page, index) => {
        const partner = goals[index]!.partner!;
        await expect(audio(page)).toHaveCount(1, { timeout: 20_000 });
        expect(await identities(page)).toEqual([
          {
            identity: ids[partner],
            trackIds: [expect.any(String)],
            playing: expect.any(Boolean),
          },
        ]);
        const enable = page.getByRole('button', { name: 'Enable speaker audio' });
        if (await enable.isVisible()) await enable.click();
        await startRemoteAudioProbe(page);
      }),
    );
    audioReport.probeSetup = probeSetup.map((result) =>
      result.status === 'fulfilled'
        ? { status: result.status }
        : { status: result.status, reason: String(result.reason) },
    );

    for (let sample = 0; sample < 5; sample++) {
      const [observed, decoded] = await Promise.all([
        Promise.all(pages.map(identities)),
        Promise.all(pages.slice(0, 6).map(readRemoteAudioProbe)),
      ]);
      audioBefore.push({
        at: Date.now(),
        activeWorldReceivers: streams.filter(
          ({ participants, lifecycle }) => participants.size === 20 && lifecycle.length === 0,
        ).length,
        observed,
        decoded,
      });
      await sleep(250);
    }
    const subscriptionHistory = await Promise.all(
      pages.map((page) => page.evaluate(() => (window as CanvasWindow).studioSubscriptions ?? [])),
    );
    audioReport.subscriptionHistory = subscriptionHistory;
    expect(probeSetup.map(({ status }) => status)).toEqual(Array(6).fill('fulfilled'));
    for (const window of audioBefore) {
      expect(window.activeWorldReceivers).toBe(20);
      for (let index = 0; index < pages.length; index++) {
        const partner = goals[index]!.partner;
        expect(window.observed[index]!.map(({ identity }) => identity)).toEqual(
          partner === null ? [] : [ids[partner]],
        );
      }
    }
    const decoded = audioBefore.at(-1)!.decoded;
    decoded.forEach(({ activeSamples }) => expect(activeSamples).toBeGreaterThan(8));
    for (const page of pages.slice(6)) {
      await expect(page.locator('.office-voice-status')).not.toContainText(
        'In a 2-person conversation',
      );
      await expect(audio(page)).toHaveCount(0);
    }
    for (let index = 0; index < pages.length; index++) {
      const partner = goals[index]!.partner;
      expect([...new Set(subscriptionHistory[index]!.map(({ identity }) => identity))]).toEqual(
        partner === null ? [] : [ids[partner]],
      );
    }
    console.log('Six decoded directions across three simultaneous groups; no foreign audio tags.');

    const studioListener = pages[4]!;
    const studioTalker = pages[5]!;
    await studioTalker.getByRole('button', { name: 'Mute proximity microphone' }).click();
    await expect
      .poll(async () => (await readRemoteAudioProbe(studioListener)).currentSilentMs, {
        timeout: 10_000,
      })
      .toBeGreaterThan(450);
    const muted = await readRemoteAudioProbe(studioListener);
    await studioTalker.getByRole('button', { name: 'Unmute proximity microphone' }).click();
    await expect
      .poll(async () => (await readRemoteAudioProbe(studioListener)).activeSamples)
      .toBeGreaterThan(muted.activeSamples + 5);
    const resumed = await readRemoteAudioProbe(studioListener);
    await pages[0]!.screenshot({ path: testInfo.outputPath('studio-load-small.png') });
    await pages[4]!.screenshot({ path: testInfo.outputPath('studio-load-team.png') });
    const meetingListener = pages[0]!;
    const exit = orthogonal ? { tx: 21, ty: 22 } : { tx: 13, ty: 21 };
    await studioClick(pages[1]!, exit.tx, exit.ty);
    await expect(studioMap(pages[1]!)).toHaveAttribute('data-local-tile', `${exit.tx},${exit.ty}`);
    await expect(audio(meetingListener)).toHaveCount(0);
    await expect(audio(pages[1]!)).toHaveCount(0);
    await expect
      .poll(async () => (await readRemoteAudioProbe(meetingListener)).currentSilentMs, {
        timeout: 10_000,
      })
      .toBeGreaterThan(450);
    expect(await identities(pages[2]!)).toEqual([
      {
        identity: ids[3],
        trackIds: [expect.any(String)],
        playing: expect.any(Boolean),
      },
    ]);
    expect(await identities(studioListener)).toEqual([
      {
        identity: ids[5],
        trackIds: [expect.any(String)],
        playing: expect.any(Boolean),
      },
    ]);
    expect(streams.every(({ participants }) => participants.size === 20)).toBe(true);
    expect(sockets.every(({ connected }) => connected)).toBe(true);
    await Promise.all(
      pages.map((page) =>
        expect(page.getByText('20 people in the office', { exact: true })).toBeVisible({
          timeout: 12_000,
        }),
      ),
    );
    report.continuousRosterMs = Date.now() - movementStart;
    expect(report.continuousRosterMs).toBeGreaterThan(5_000);
    expect(streams.every(({ lifecycle }) => lifecycle.length === 0)).toBe(true);
    report.muteResumeExit = {
      muted,
      resumed,
      afterExit: await readRemoteAudioProbe(meetingListener),
    };
    expect(canvas.map(({ matching }) => matching)).toEqual(Array(8).fill(20));
    const walker = pages[4]!;
    await walker.getByRole('button', { name: 'Opt out of nearby voice' }).click();
    const collisionProbe = orthogonal
      ? { tx: 32, ty: 14, arrow: 'ArrowUp' }
      : { tx: 26, ty: 15, arrow: 'ArrowLeft' };
    const collisionTile = `${collisionProbe.tx},${collisionProbe.ty}`;
    const chair = orthogonal
      ? { tx: 31, ty: 14, seatId: 'private-office-2-furniture:0' }
      : { tx: 22, ty: 17, seatId: 'team-studio-furniture:0' };
    await studioClick(walker, collisionProbe.tx, collisionProbe.ty);
    await expect(studioMap(walker)).toHaveAttribute('data-local-tile', collisionTile, {
      timeout: 12_000,
    });
    await walker.keyboard.down(collisionProbe.arrow);
    try {
      await sleep(430);
      await expect(studioMap(walker)).toHaveAttribute('data-local-tile', collisionTile);
    } finally {
      await walker.keyboard.up(collisionProbe.arrow);
    }
    await studioClick(walker, chair.tx, chair.ty);
    await expect(walker.getByRole('button', { name: 'Stand up' })).toBeVisible({ timeout: 12_000 });
    await expect
      .poll(
        () =>
          streams.filter(({ participants }) => participants.get(ids[4]!)?.seatId === chair.seatId)
            .length,
      )
      .toBe(20);
    await walker.keyboard.press('e');
    await expect(walker.getByRole('button', { name: 'Stand up' })).toHaveCount(0);
    await walker
      .getByRole('button', { name: new RegExp(accounts[1]!.account.displayName) })
      .click();
    await walker.getByRole('button', { name: 'Go to', exact: true }).click();
    const destination = orthogonal ? { tx: 18, ty: 25 } : { tx: 10, ty: 22 };
    await studioClick(pages[1]!, destination.tx, destination.ty);
    await expect(studioMap(pages[1]!)).toHaveAttribute(
      'data-local-tile',
      `${destination.tx},${destination.ty}`,
      {
        timeout: 12_000,
      },
    );
    const targetPosition = () => streams[1]!.participants.get(ids[1]!)!.position;
    await expect
      .poll(targetPosition)
      .toEqual({ x: (destination.tx + 0.5) * 32, y: (destination.ty + 0.5) * 32 });
    await expect(walker.getByText('Destination reached.', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(studioMap(walker)).toHaveAttribute(
      'data-local-tile',
      orthogonal ? /^(17,25|19,25|18,24|18,26)$/ : /^(9,22|11,22|10,21|10,23)$/,
    );
    if (orthogonal) {
      await walker.getByRole('button', { name: 'Follow me', exact: true }).click();
      await expect(studioMap(walker)).toHaveAttribute('data-camera-zoom', '1.85');
      await walker.getByRole('button', { name: 'Show overview', exact: true }).click();
      await expect(studioMap(walker)).toHaveAttribute('data-camera-zoom', '1.00');
      await walker.emulateMedia({ reducedMotion: 'reduce' });
      await expect(studioMap(walker)).toHaveAttribute('data-avatar-pose', 'idle');
      await studioMap(walker).evaluate((canvas) => {
        canvas.dataset.reducedMotionProbe = 'idle';
        const observer = new MutationObserver(() => {
          if (canvas.dataset.avatarPose === 'walking')
            canvas.dataset.reducedMotionProbe = 'walking';
        });
        observer.observe(canvas, { attributes: true, attributeFilter: ['data-avatar-pose'] });
      });
      await studioClick(walker, 19, 26);
      await expect(studioMap(walker)).toHaveAttribute('data-local-tile', '19,26');
      await expect(studioMap(walker)).toHaveAttribute('data-reduced-motion-probe', 'idle');
      await expect(studioMap(walker)).toHaveAttribute('data-avatar-pose', 'idle');
    }
    expect.soft(actualTiles, 'Exact movement waypoint tiles after settling').toEqual(expectedTiles);
    report.interactions = {
      interiorCollision: true,
      doorTraversal: true,
      seatAcrossAllSessions: true,
      standWithE: true,
      followMovingMember: true,
      ...(orthogonal && { followCamera: true, reducedMotion: true }),
    };

    expect(motion.map(({ packetVersionGaps }) => packetVersionGaps)).toEqual(Array(20).fill(0));
  } finally {
    report.lifecycle = streams.map(({ lifecycle }) => lifecycle);
    report.browserCommands = browserCommands;
    report.lastObserverPoints = streams.map(({ ready }) =>
      ready ? (streams[0]!.participants.get(ready.participationId) ?? null) : null,
    );
    report.lastObservedTiles = streams[0]!.ready
      ? streams.map(({ ready }) => {
          const position = ready
            ? streams[0]!.participants.get(ready.participationId)?.position
            : undefined;
          return position ? tile(position) : null;
        })
      : undefined;
    const evidence = testInfo.outputPath('studio-load-evidence.json');
    await writeFile(evidence, JSON.stringify(report, null, 2));
    await testInfo.attach('studio-load-evidence', {
      path: evidence,
      contentType: 'application/json',
    });
    await Promise.allSettled(pages.map(stopRemoteAudioProbe));
    sockets.forEach((socket) => socket.disconnect());
    await Promise.allSettled(contexts.map((context) => context.close()));
    await Promise.allSettled(accounts.map(({ client }) => client.dispose()));
  }
});

test('Vivo opens both Media room doors after the last person walks out', async ({ browser }) => {
  test.skip(!enabled, 'Set LIVE_OFFICE_E2E=1 to use the local Docker stack.');
  test.setTimeout(120_000);
  const { owner, member, workspaceId } = await getLiveMediaOfficeFixture();
  const ownerOffice = await companyPage(browser, owner.client, workspaceId);
  const memberOffice = await companyPage(browser, member.client, workspaceId);
  const ownerPage = ownerOffice.page;
  const memberPage = memberOffice.page;
  const map = (page: Page) => page.locator('.office-scene svg.office-map');
  const lighting = (page: Page) => map(page).locator('[data-room-lighting="dimmed"]');
  const doors = (page: Page, state: 'open' | 'closed') =>
    map(page).locator(`[data-room-id="vivo-094907c0"][data-room-state="${state}"]`);
  const worldToScreen = (page: Page, x: number, y: number) =>
    map(page).evaluate(
      (svg, point) => {
        const screen = new DOMPoint(point.x, point.y).matrixTransform(
          (svg as SVGSVGElement).getScreenCTM()!,
        );
        return { x: screen.x, y: screen.y };
      },
      { x, y },
    );
  const walk = async (page: Page, x: number, y: number) => {
    const screen = await worldToScreen(page, x, y);
    await page.mouse.click(screen.x, screen.y);
  };
  const enter = async (page: Page, name: string) => {
    // The west entrance is between column 28 and column 29, on row 37.
    await walk(page, 912, 1200);
    await expect
      .poll(
        async () => {
          const position = await participantPositionObservation(page, name);
          return Math.hypot(position.authoritativeX - 912, position.authoritativeY - 1200);
        },
        { timeout: 15_000 },
      )
      .toBeLessThan(24);
    await map(page).focus();
    const { authoritativeY: approachY } = await participantPositionObservation(page, name);
    if (approachY < 1190 || approachY > 1210) {
      const key = approachY < 1190 ? 'ArrowDown' : 'ArrowUp';
      await page.keyboard.down(key);
      try {
        await expect
          .poll(
            async () => {
              const { authoritativeY } = await participantPositionObservation(page, name);
              return approachY < 1190 ? authoritativeY >= 1190 : authoritativeY <= 1210;
            },
            { intervals: [25, 50] },
          )
          .toBe(true);
      } finally {
        await page.keyboard.up(key);
      }
    }
    await page.keyboard.down('ArrowRight');
    try {
      await expect
        .poll(async () => (await participantPositionObservation(page, name)).authoritativeX)
        .toBeGreaterThan(975);
    } finally {
      await page.keyboard.up('ArrowRight');
    }
    await expect(page.getByText(/You are inside Media room/)).toBeVisible();
  };

  try {
    await ownerPage.getByRole('button', { name: 'Join' }).click();
    await memberPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('2 people in the office')).toBeVisible();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    for (const page of [ownerPage, memberPage]) {
      await expect(doors(page, 'open')).toHaveCount(2);
      await expect(lighting(page)).toHaveCount(0);
    }

    await enter(ownerPage, owner.account.displayName);
    await expect(lighting(ownerPage)).toHaveCount(1);
    await expect(lighting(memberPage)).toHaveCount(0);
    for (const page of [ownerPage, memberPage]) {
      await expect(doors(page, 'closed')).toHaveCount(2);
    }

    await enter(memberPage, member.account.displayName);
    await expect(lighting(memberPage)).toHaveCount(1);
    await walk(ownerPage, 880, 1200);
    await expect(lighting(ownerPage)).toHaveCount(0);
    await expect(lighting(memberPage)).toHaveCount(1);
    for (const page of [ownerPage, memberPage]) {
      await expect(doors(page, 'closed')).toHaveCount(2);
    }
    await expect
      .poll(async () => {
        const position = await participantPositionObservation(
          memberPage,
          owner.account.displayName,
        );
        return Math.hypot(position.worldX - 880, position.worldY - 1200);
      })
      .toBeLessThan(24);

    // This floor point is inside the first person's sprite canvas but outside their body.
    const ownerPosition = await participantPositionObservation(
      memberPage,
      owner.account.displayName,
    );
    await walk(memberPage, ownerPosition.worldX - 30, ownerPosition.worldY);
    for (const page of [ownerPage, memberPage]) {
      await expect(lighting(page)).toHaveCount(0);
      await expect(doors(page, 'open')).toHaveCount(2);
      await expect(page.getByText('2 people in the office')).toBeVisible();
    }
  } finally {
    await Promise.all([ownerOffice.context.close(), memberOffice.context.close()]);
  }
});

test('live two-browser Vivo admission, movement, seats, recovery, and company isolation', async ({
  browser,
}) => {
  test.skip(!enabled, 'Set LIVE_OFFICE_E2E=1 to use the owner-authorized local Docker stack.');
  test.setTimeout(180_000);

  const ownerEmail = `cp065-owner-${randomUUID()}@example.test`;
  const memberEmail = `cp065-member-${randomUUID()}@example.test`;
  const owner = await createAccount(ownerEmail);
  const member = await createAccount(memberEmail);
  let ownerContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  let memberContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  let ownerSecondContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  try {
    const workspaceResponse = await postJson(
      owner.client,
      '/api/workspaces',
      { name: `CP06.5 ${randomUUID().slice(0, 8)}`, slug: `cp065-${randomUUID().slice(0, 12)}` },
      owner.csrf,
      true,
    );
    expect(workspaceResponse.status()).toBe(201);
    const workspaceBody = (await workspaceResponse.json()) as { workspace: { id: string } };
    const workspaceId = workspaceBody.workspace.id;

    const inviteResponse = await postJson(
      owner.client,
      `/api/workspaces/${workspaceId}/invitations`,
      { email: memberEmail },
      owner.csrf,
      true,
    );
    expect(inviteResponse.status()).toBe(201);
    const inviteToken = await mailToken(memberEmail, 'Join a company');
    const accepted = await postJson(
      member.client,
      '/api/invitations/accept',
      { token: inviteToken },
      member.csrf,
      true,
    );
    if (accepted.status() !== 200) {
      const body = (await accepted.json()) as { error?: { code?: string } };
      throw new Error(`Invitation acceptance failed (${accepted.status()}: ${body.error?.code}).`);
    }

    const ownerOffice = await companyPage(browser, owner.client, workspaceId);
    ownerContext = ownerOffice.context;
    const memberOffice = await companyPage(browser, member.client, workspaceId, true);
    memberContext = memberOffice.context;
    const ownerPage = ownerOffice.page;
    const memberPage = memberOffice.page;
    const gapProbe = memberOffice.gapProbe;
    if (!gapProbe) throw new Error('The member WebSocket probe was not installed.');

    await ownerPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('2 people in the office')).toBeVisible();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    await expect(
      ownerPage.getByRole('region', { name: 'People in the office' }).getByRole('list'),
    ).toContainText(`E2E ${memberEmail.split('@')[0]}`);

    await expect(ownerPage.locator('.office-map-heading strong')).toHaveText('Live Vivo office');
    const ownerMap = ownerPage.locator('.office-scene svg.office-map');
    const memberMap = memberPage.locator('.office-scene svg.office-map');
    await expect(ownerMap).toHaveCount(1);
    await expect(memberMap).toHaveCount(1);
    const ownerName = `E2E ${ownerEmail.split('@')[0]}`;
    const memberName = `E2E ${memberEmail.split('@')[0]}`;
    const memberOwnerRow = memberPage
      .getByRole('region', { name: 'People in the office' })
      .getByRole('listitem')
      .filter({ hasText: ownerName });

    await memberOwnerRow.getByRole('button').click();
    const memberActions = memberPage.getByRole('dialog', { name: 'Member actions' });
    await memberActions.getByRole('button', { name: `Wave to ${ownerName}`, exact: true }).click();
    await expect(ownerPage.getByText(`${memberName} waved to you.`, { exact: true })).toBeVisible();

    const initialPosition = await participantPosition(memberPage, ownerName);
    await startPositionRenderProbe(memberPage, ownerName);
    const inputMark = await memberPage.evaluate(() => performance.now());
    await ownerMap.focus();
    await ownerPage.keyboard.down('ArrowRight');
    await expect
      .poll(async () => (await readPositionRenderProbe(memberPage)).firstChangedAt)
      .toBeGreaterThan(inputMark);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await ownerPage.keyboard.up('ArrowRight');
    const liveRenderTrace = await stopPositionRenderProbe(memberPage);
    await expect
      .poll(async () => {
        const current = await participantPosition(memberPage, ownerName);
        return current.x !== initialPosition.x || current.y !== initialPosition.y;
      })
      .toBe(true);

    let matchingOwnerState: Awaited<ReturnType<typeof participantPositionObservation>> | undefined;
    let matchingMemberState: Awaited<ReturnType<typeof participantPositionObservation>> | undefined;
    await expect
      .poll(async () => {
        matchingOwnerState = await participantPositionObservation(ownerPage, ownerName);
        matchingMemberState = await participantPositionObservation(memberPage, ownerName);
        return Boolean(
          matchingOwnerState.epoch &&
          matchingOwnerState.epoch === matchingMemberState.epoch &&
          matchingOwnerState.version === matchingMemberState.version &&
          matchingOwnerState.authoritativeX === matchingMemberState.authoritativeX &&
          matchingOwnerState.authoritativeY === matchingMemberState.authoritativeY,
        );
      })
      .toBe(true);
    await ownerPage.waitForTimeout(220);
    const settledOwnerState = await participantPositionObservation(ownerPage, ownerName);
    const settledMemberState = await participantPositionObservation(memberPage, ownerName);
    expect(settledOwnerState.epoch).toBe(settledMemberState.epoch);
    expect(settledOwnerState.version).toBe(settledMemberState.version);
    expect(settledOwnerState.authoritativeX).toBe(settledMemberState.authoritativeX);
    expect(settledOwnerState.authoritativeY).toBe(settledMemberState.authoritativeY);
    for (const observation of [settledOwnerState, settledMemberState]) {
      expect(Math.abs(observation.worldX - observation.authoritativeX)).toBeLessThan(0.01);
      expect(Math.abs(observation.worldY - observation.authoritativeY)).toBeLessThan(0.01);
    }
    console.info(
      `CP06.5 live movement convergence: ${JSON.stringify({
        inputToPeerVisibleMs: liveRenderTrace.firstChangedAt - inputMark,
        renderFrames: liveRenderTrace.frameCount,
        maxRenderedStepPx: liveRenderTrace.maxStepPx,
        epoch: settledOwnerState.epoch,
        version: settledOwnerState.version,
        authoritative: [settledOwnerState.authoritativeX, settledOwnerState.authoritativeY],
        ownerRendered: [settledOwnerState.worldX, settledOwnerState.worldY],
        peerRendered: [settledMemberState.worldX, settledMemberState.worldY],
        maxResidualPx: Math.max(
          Math.abs(settledOwnerState.worldX - settledOwnerState.authoritativeX),
          Math.abs(settledOwnerState.worldY - settledOwnerState.authoritativeY),
          Math.abs(settledMemberState.worldX - settledMemberState.authoritativeX),
          Math.abs(settledMemberState.worldY - settledMemberState.authoritativeY),
        ),
      })}`,
    );

    const contestedSeatId = await nearestVisibleOpenSeatId(memberMap);
    expect(contestedSeatId).toBeTruthy();
    const memberSeat = memberMap.locator(`[data-seat-id="${contestedSeatId}"]`);
    const ownerSeat = ownerMap.locator(`[data-seat-id="${contestedSeatId}"]`);
    await expect(ownerSeat).toHaveAttribute('aria-disabled', 'false');
    await memberSeat.click();
    await expect(ownerSeat).toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });
    await expect(memberMap.locator('.scene-avatar.is-self.is-seated')).toHaveCount(1, {
      timeout: 15_000,
    });
    await memberMap.focus();
    await memberPage.keyboard.press('e');
    await expect(ownerSeat).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 });
    await expect(memberMap.locator('.scene-avatar.is-self.is-seated')).toHaveCount(0);

    gapProbe.arm();
    await ownerPage.getByRole('button', { name: 'Busy', exact: true }).click();
    await expect.poll(() => gapProbe.state.droppedDelta).toBe(true);
    await expect(memberOwnerRow.locator('small')).toHaveText('Active');
    await ownerPage.getByRole('button', { name: 'Away', exact: true }).click();
    await expect(ownerPage.getByRole('button', { name: 'Away', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => gapProbe.state.resyncRequested).toBe(true);
    await expect.poll(() => gapProbe.state.snapshotReceived).toBe(true);
    await expect(memberOwnerRow.locator('small')).toHaveText('Away');

    const priorConnections = gapProbe.state.connectionAttempts;
    gapProbe.interrupt();
    await expect
      .poll(() => gapProbe.state.connectionAttempts, { timeout: 65_000 })
      .toBeGreaterThan(priorConnections);
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    await expect(
      ownerPage
        .getByRole('region', { name: 'People in the office' })
        .getByRole('listitem')
        .filter({ hasText: ownerName })
        .locator('small'),
    ).toHaveText('Away');

    await ownerPage.getByRole('button', { name: 'Leave office' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(memberPage.getByText('1 person in the office')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Leave office' }).click();
    await expect(memberPage.getByRole('button', { name: 'Join' })).toBeVisible();

    const secondWorkspaceResponse = await postJson(
      owner.client,
      '/api/workspaces',
      { name: `CP06.7 ${randomUUID().slice(0, 8)}`, slug: `cp067-${randomUUID().slice(0, 12)}` },
      owner.csrf,
      true,
    );
    expect(secondWorkspaceResponse.status()).toBe(201);
    const secondWorkspaceBody = (await secondWorkspaceResponse.json()) as {
      workspace: { id: string };
    };
    const ownerSecondOffice = await companyPage(
      browser,
      owner.client,
      secondWorkspaceBody.workspace.id,
    );
    ownerSecondContext = ownerSecondOffice.context;
    const ownerSecondPage = ownerSecondOffice.page;
    await memberPage.getByRole('button', { name: 'Join' }).click();
    await ownerSecondPage.getByRole('button', { name: 'Join' }).click();
    await expect(memberPage.getByText('1 person in the office')).toBeVisible();
    await expect(ownerSecondPage.getByText('1 person in the office')).toBeVisible();
    const memberRoster = memberPage
      .getByRole('region', { name: 'Online people' })
      .getByRole('list');
    const ownerRoster = ownerSecondPage
      .getByRole('region', { name: 'Online people' })
      .getByRole('list');
    await expect(memberRoster).toContainText(memberName);
    await expect(memberRoster).not.toContainText(ownerName);
    await expect(ownerRoster).toContainText(ownerName);
    await expect(ownerRoster).not.toContainText(memberName);

    await ownerSecondPage.getByRole('link', { name: 'Back to companies' }).click();
    await expect(ownerSecondPage.getByRole('heading', { name: 'Your companies' })).toBeVisible();
    await expect(ownerSecondPage.locator('.office-scene svg.office-map')).toHaveCount(0);
    await ownerSecondPage
      .locator(`[data-workspace-id="${secondWorkspaceBody.workspace.id}"]`)
      .getByRole('link', { name: 'Open office', exact: true })
      .click();
    await ownerSecondPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerSecondPage.getByText('1 person in the office')).toBeVisible();
    await expect(ownerSecondPage.locator('.office-scene svg.office-map')).toHaveCount(1);
    await ownerSecondPage.getByRole('button', { name: 'Leave office' }).click();
    await memberPage.getByRole('button', { name: 'Leave office' }).click();
  } finally {
    await ownerContext?.close();
    await memberContext?.close();
    await ownerSecondContext?.close();
    await owner.client.dispose();
    await member.client.dispose();
  }
});

test('mounted Vivo office carries and cuts off live nearby audio on conversation leave', async ({
  browser,
}) => {
  test.skip(
    !enabled || !mediaEnabled,
    'Run pnpm test:e2e:live-media against the local media-e2e Compose profile.',
  );
  test.setTimeout(420_000);

  const { owner, member, workspaceId } = await getLiveMediaOfficeFixture();
  let mixedBrowser: Browser | undefined;
  let ownerContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  let memberContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  try {
    const useMixedBrowser = process.env['LIVE_OFFICE_MIXED_BROWSERS'] === '1';
    const ownerOffice = await companyPage(browser, owner.client, workspaceId, false, false, true);
    ownerContext = ownerOffice.context;
    if (useMixedBrowser) {
      mixedBrowser = await firefoxBrowser.launch({
        headless: true,
        firefoxUserPrefs: {
          'media.navigator.streams.fake': true,
          'media.navigator.permission.disabled': true,
          'media.autoplay.default': 1,
        },
      });
    }
    const memberBrowser = mixedBrowser ?? browser;
    const memberOffice = await companyPage(
      memberBrowser,
      member.client,
      workspaceId,
      false,
      false,
      true,
    );
    memberContext = memberOffice.context;
    const ownerPage = ownerOffice.page;
    const memberPage = memberOffice.page;
    if (browser.browserType().name() !== 'firefox') {
      await ownerContext.grantPermissions(['microphone'], { origin: appOrigin });
    }
    if (memberBrowser.browserType().name() !== 'firefox') {
      await memberContext.grantPermissions(['microphone'], { origin: appOrigin });
    }

    await ownerPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('2 people in the office')).toBeVisible();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    const ownerMap = ownerPage.locator('.office-scene svg.office-map');
    const memberMap = memberPage.locator('.office-scene svg.office-map');
    await expect(ownerPage.locator('.office-map-heading strong')).toHaveText('Live Vivo office');
    await expect(ownerMap).toHaveCount(1);
    await expect(memberMap).toHaveCount(1);

    if (process.env['LIVE_OFFICE_FORCE_PLAYBACK_BLOCK'] === '1') {
      for (const page of [ownerPage, memberPage]) {
        await page.evaluate(() => {
          const play = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function () {
            if (
              this instanceof HTMLAudioElement &&
              this.srcObject instanceof MediaStream &&
              document.documentElement.dataset['officePlaybackAllowed'] !== 'true'
            ) {
              return Promise.reject(
                new DOMException('Playback requires a click', 'NotAllowedError'),
              );
            }
            return play.call(this);
          };
        });
      }
    }

    // Proximity opt-in controls membership; the separate microphone action grants capture.
    await ownerPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await memberPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Opt out of nearby voice' })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: 'Opt out of nearby voice' })).toBeVisible();
    await ownerPage.getByRole('button', { name: 'Activate proximity microphone' }).click();
    await memberPage.getByRole('button', { name: 'Activate proximity microphone' }).click();
    try {
      await expect(ownerPage.locator('#office-microphone-help')).toHaveText(
        'Your microphone is on.',
        { timeout: 20_000 },
      );
      await expect(memberPage.locator('#office-microphone-help')).toHaveText(
        'Your microphone is on.',
        { timeout: 20_000 },
      );
    } catch (error) {
      if (useMixedBrowser) {
        console.info(
          `Mixed-browser ICE diagnostics: ${JSON.stringify({
            owner: await readOfficeRtcDiagnostics(ownerPage),
            member: await readOfficeRtcDiagnostics(memberPage),
          })}`,
        );
      }
      throw error;
    }

    const ownerRemoteAudio = ownerPage.locator('.office-proximity-audio-output audio');
    await expect(ownerRemoteAudio).toHaveCount(1, { timeout: 15_000 });
    const memberRemoteAudio = memberPage.locator('.office-proximity-audio-output audio');
    await expect(memberRemoteAudio).toHaveCount(1, { timeout: 15_000 });
    if (process.env['LIVE_OFFICE_FORCE_PLAYBACK_BLOCK'] === '1') {
      for (const page of [ownerPage, memberPage]) {
        const unblock = page.getByRole('button', { name: 'Enable speaker audio' });
        await expect(unblock).toBeVisible();
        await page.evaluate(() => {
          document.documentElement.dataset['officePlaybackAllowed'] = 'true';
        });
        await unblock.click();
        await expect(unblock).toHaveCount(0);
      }
    }
    for (const page of [ownerPage, memberPage]) {
      const unblock = page.getByRole('button', { name: 'Enable speaker audio' });
      const audio = page.locator('.office-proximity-audio-output audio');
      await expect
        .poll(
          async () =>
            (await unblock.isVisible()) ||
            (await audio.evaluate((node: HTMLAudioElement) => !node.paused)),
          { timeout: 10_000 },
        )
        .toBe(true);
      if (await unblock.isVisible()) await unblock.click();
    }
    for (const element of [ownerRemoteAudio, memberRemoteAudio]) {
      await expect
        .poll(
          () =>
            element.evaluate(
              (node: HTMLAudioElement) => !node.paused && !node.muted && node.currentTime > 0,
            ),
          { timeout: 10_000 },
        )
        .toBe(true);
    }
    await startRemoteAudioProbe(memberPage);
    await expect
      .poll(async () => (await readRemoteAudioProbe(memberPage)).activeSamples, {
        timeout: 15_000,
      })
      .toBeGreaterThan(10);
    await startRemoteAudioProbe(ownerPage);
    await expect
      .poll(async () => (await readRemoteAudioProbe(ownerPage)).activeSamples, { timeout: 15_000 })
      .toBeGreaterThan(10);
    await expect
      .poll(async () => Date.now() - (await readRemoteAudioProbe(ownerPage)).lastActiveAt, {
        timeout: 5000,
      })
      .toBeLessThan(250);

    // Keep the pair stationary long enough to detect an established-pair cutoff,
    // rather than treating a successful initial subscription as continuity.
    for (let minute = 1; minute <= 5; minute += 1) {
      await ownerPage.waitForTimeout(60_000);
      const [ownerProbe, memberProbe, ownerRtc, memberRtc] = await Promise.all([
        readRemoteAudioProbe(ownerPage),
        readRemoteAudioProbe(memberPage),
        readOfficeRtcDiagnostics(ownerPage),
        readOfficeRtcDiagnostics(memberPage),
      ]);
      console.info(
        `CP08.5 live stationary checkpoint ${minute}/5: ${JSON.stringify({
          elapsedMs: minute * 60_000,
          owner: {
            activeSamples: ownerProbe.activeSamples,
            sampleCount: ownerProbe.sampleCount,
            longestSilentMs: ownerProbe.longestSilentMs,
            currentSilentMs: ownerProbe.currentSilentMs,
            maxCallbackIntervalMs: ownerProbe.maxCallbackIntervalMs,
            rtpAudio: ownerRtc.flatMap((peer) => peer.audioStreams),
          },
          member: {
            activeSamples: memberProbe.activeSamples,
            sampleCount: memberProbe.sampleCount,
            longestSilentMs: memberProbe.longestSilentMs,
            currentSilentMs: memberProbe.currentSilentMs,
            maxCallbackIntervalMs: memberProbe.maxCallbackIntervalMs,
            rtpAudio: memberRtc.flatMap((peer) => peer.audioStreams),
          },
        })}`,
      );
    }
    const stationaryAudio = await Promise.all([
      readRemoteAudioProbe(ownerPage),
      readRemoteAudioProbe(memberPage),
    ]);
    const stationaryGaps = stationaryAudio.map((probe) =>
      Math.max(probe.longestSilentMs, probe.currentSilentMs),
    );
    console.info(
      `CP08.5 live stationary nearby audio: ${JSON.stringify({
        durationMs: 300_000,
        activeSamples: stationaryAudio.map((probe) => probe.activeSamples),
        sampleCounts: stationaryAudio.map((probe) => probe.sampleCount),
        longestSilentMs: stationaryGaps,
        maxCallbackIntervalMs: stationaryAudio.map((probe) => probe.maxCallbackIntervalMs),
        bothDirectionsActive: stationaryAudio.every((probe) => probe.activeSamples > 100),
      })}`,
    );
    expect(stationaryAudio.every((probe) => probe.activeSamples > 100)).toBe(true);
    const continuousChromiumSource = Boolean(
      process.env['LIVE_OFFICE_FAKE_AUDIO_WAV'] &&
      browser.browserType().name() === 'chromium' &&
      !useMixedBrowser,
    );
    if (continuousChromiumSource) {
      expect(Math.max(...stationaryGaps)).toBeLessThanOrEqual(500);
    } else {
      console.info(
        'CP08.5 continuous-energy budget not enforced: this browser configuration does not use the controlled Chrome WAV source.',
      );
    }

    if (useMixedBrowser) {
      const peers = await readOfficeRtcDiagnostics(memberPage);
      expect(peers.length).toBeGreaterThan(0);
      expect(peers.every((peer) => peer.connectionState === 'connected')).toBe(true);
      if (process.env['LIVE_OFFICE_FIREFOX_RELAY_ONLY'] === '1') {
        expect(
          peers.every((peer) =>
            peer.pairs.some((pair) => pair.state === 'succeeded' && pair.localType === 'relay'),
          ),
        ).toBe(true);
      }
      console.info(
        `Firefox live media ICE: ${JSON.stringify(
          peers.map((peer) => ({
            iceState: peer.iceState,
            pairs: peer.pairs.filter((pair) => pair.state === 'succeeded'),
          })),
        )}`,
      );
    }

    const activeAudioBeforeLeave = await readRemoteAudioProbe(ownerPage);
    const leaveRequestedAt = await markRemoteAudioStopRequested(ownerPage);
    await memberPage.getByRole('button', { name: 'Leave conversation' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Leave conversation' })).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(memberPage.getByRole('button', { name: 'Leave conversation' })).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(ownerRemoteAudio).toHaveCount(0, { timeout: 10_000 });
    await expect(ownerMap).toHaveCount(1);
    await expect(memberMap).toHaveCount(1);
    await expect
      .poll(async () => (await readRemoteAudioProbe(ownerPage)).firstSilentAfterStopAt, {
        timeout: 5000,
      })
      .toBeGreaterThan(leaveRequestedAt);
    await ownerPage.waitForTimeout(500);
    const settledAudio = await readRemoteAudioProbe(ownerPage);
    await ownerPage.waitForTimeout(250);
    const finalAudio = await readRemoteAudioProbe(ownerPage);
    const lastAudibleSampleAt =
      finalAudio.lastActiveAfterStopAt || finalAudio.firstSilentAfterStopAt;
    const cutoffUpperBoundMs = Math.max(0, lastAudibleSampleAt - leaveRequestedAt) + 20;
    expect(activeAudioBeforeLeave.activeSamples).toBeGreaterThan(10);
    expect(activeAudioBeforeLeave.lastActiveAt).toBeGreaterThan(leaveRequestedAt - 250);
    expect(finalAudio.lastActiveAfterStopAt).toBe(settledAudio.lastActiveAfterStopAt);
    console.info(
      `CP08.5 mounted UI leave cutoff: ${JSON.stringify({
        cutoffUpperBoundMs,
        audioSamplesBeforeLeave: activeAudioBeforeLeave.activeSamples,
        lastAudibleSampleAfterLeaveMs: Math.max(
          0,
          finalAudio.lastActiveAfterStopAt - leaveRequestedAt,
        ),
        remoteAudioElementRemoved: true,
        mapRemainsMounted: true,
      })}`,
    );
    expect(
      cutoffUpperBoundMs,
      `Measured audio cutoff: ${cutoffUpperBoundMs}ms`,
    ).toBeLessThanOrEqual(8000);
    await stopRemoteAudioProbe(ownerPage);
    await stopRemoteAudioProbe(memberPage);

    await ownerPage.getByRole('button', { name: 'Leave office' }).click();
    await memberPage.getByRole('button', { name: 'Leave office' }).click();
  } finally {
    await ownerContext?.close();
    await memberContext?.close();
    await mixedBrowser?.close();
  }
});

test('mounted Vivo nearby audio ends outside and resumes after proximity re-entry', async ({
  browser,
}) => {
  test.skip(
    !enabled || !mediaEnabled,
    'Run pnpm test:e2e:live-media against the local media-e2e Compose profile.',
  );
  test.setTimeout(150_000);

  const { owner, member, workspaceId } = await getLiveMediaOfficeFixture();
  let ownerContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  let memberContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  try {
    const ownerOffice = await companyPage(browser, owner.client, workspaceId);
    ownerContext = ownerOffice.context;
    const memberOffice = await companyPage(browser, member.client, workspaceId);
    memberContext = memberOffice.context;
    const ownerPage = ownerOffice.page;
    const memberPage = memberOffice.page;
    const ownerName = owner.account.displayName;
    const memberName = member.account.displayName;
    await ownerContext.grantPermissions(['microphone'], { origin: appOrigin });
    await memberContext.grantPermissions(['microphone'], { origin: appOrigin });

    await ownerPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('2 people in the office')).toBeVisible();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    const memberMap = memberPage.locator('.office-scene svg.office-map');
    await ownerPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await memberPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await expect(ownerPage.locator('.office-voice-status')).toContainText(
      'In a 2-person conversation',
      { timeout: 15_000 },
    );
    await expect(memberPage.locator('.office-voice-status')).toContainText(
      'In a 2-person conversation',
      { timeout: 15_000 },
    );
    await ownerPage.locator('button[aria-describedby="office-microphone-help"]').click();
    await memberPage.locator('button[aria-describedby="office-microphone-help"]').click();
    await expect(ownerPage.locator('#office-microphone-help')).toHaveText(
      'Your microphone is on.',
      {
        timeout: 20_000,
      },
    );
    await expect(memberPage.locator('#office-microphone-help')).toHaveText(
      'Your microphone is on.',
      {
        timeout: 20_000,
      },
    );
    const ownerRemoteAudio = ownerPage.locator('.office-proximity-audio-output audio');
    const memberRemoteAudio = memberPage.locator('.office-proximity-audio-output audio');
    await expect(ownerRemoteAudio).toHaveCount(1, { timeout: 15_000 });
    await expect(memberRemoteAudio).toHaveCount(1, { timeout: 15_000 });
    await startRemoteAudioProbe(ownerPage);
    await startRemoteAudioProbe(memberPage);
    await expect
      .poll(async () => {
        const [ownerProbe, memberProbe] = await Promise.all([
          readRemoteAudioProbe(ownerPage),
          readRemoteAudioProbe(memberPage),
        ]);
        return Math.min(ownerProbe.activeSamples, memberProbe.activeSamples);
      })
      .toBeGreaterThan(10);

    const currentPair = async () => officePairPositions(memberPage, ownerName, memberName);
    const initialPair = await currentPair();
    expect(
      Math.hypot(
        initialPair.first.x - initialPair.second.x,
        initialPair.first.y - initialPair.second.y,
      ),
    ).toBeLessThanOrEqual(64);

    const moveRightStep = async () => {
      const before = await currentPair();
      await memberMap.focus();
      await memberPage.keyboard.down('ArrowRight');
      await memberPage.waitForTimeout(120);
      await memberPage.keyboard.up('ArrowRight');
      await expect
        .poll(async () => {
          const after = await currentPair();
          return (
            after.epoch === before.epoch &&
            after.version !== before.version &&
            (after.second.x !== before.second.x || after.second.y !== before.second.y)
          );
        })
        .toBe(true);
      await memberPage.waitForTimeout(180);
      return currentPair();
    };

    const cutoffUpperBoundsMs: number[] = [];
    let area = await officeConversationArea(ownerPage);
    expect(area).not.toBeNull();
    expect(area?.radius).toBe(64);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      area = await officeConversationArea(ownerPage);
      expect(area).not.toBeNull();
      const activeArea = area!;
      let outsideRadius = await currentPair();
      let leaveRequestedAt = 0;
      for (let step = 0; step < 9; step += 1) {
        const before = await currentPair();
        const memberDistance = Math.hypot(
          before.second.x - activeArea.center.x,
          before.second.y - activeArea.center.y,
        );
        if (memberDistance > activeArea.radius) {
          outsideRadius = before;
          break;
        }
        // Mark both actual decoded streams immediately before the step that crosses the
        // server-published circle. This is a conservative upper bound on cutoff latency.
        const requestedAt = await markRemoteAudioStopRequested(memberPage);
        await markRemoteAudioStopRequested(ownerPage);
        const after = await moveRightStep();
        const afterDistance = Math.hypot(
          after.second.x - activeArea.center.x,
          after.second.y - activeArea.center.y,
        );
        outsideRadius = after;
        if (afterDistance > activeArea.radius) {
          leaveRequestedAt = requestedAt;
          break;
        }
      }
      const outsideDistance = Math.hypot(
        outsideRadius.second.x - activeArea.center.x,
        outsideRadius.second.y - activeArea.center.y,
      );
      expect(outsideDistance).toBeGreaterThan(activeArea.radius);
      expect(leaveRequestedAt).toBeGreaterThan(0);
      await expect(ownerPage.getByRole('button', { name: 'Leave conversation' })).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect(memberPage.getByRole('button', { name: 'Leave conversation' })).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect(ownerRemoteAudio).toHaveCount(0, { timeout: 10_000 });
      await expect(memberRemoteAudio).toHaveCount(0, { timeout: 10_000 });
      await expect(ownerPage.locator('circle[data-conversation-area]')).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect(memberPage.locator('circle[data-conversation-area]')).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect
        .poll(async () => {
          const [ownerProbe, memberProbe] = await Promise.all([
            readRemoteAudioProbe(ownerPage),
            readRemoteAudioProbe(memberPage),
          ]);
          return (
            ownerProbe.firstSilentAfterStopAt > 0 &&
            ownerProbe.currentSilentMs >= 500 &&
            memberProbe.firstSilentAfterStopAt > 0 &&
            memberProbe.currentSilentMs >= 500
          );
        })
        .toBe(true);
      const stoppedAudio = await Promise.all([
        readRemoteAudioProbe(ownerPage),
        readRemoteAudioProbe(memberPage),
      ]);
      const cutoffUpperBoundMs = Math.max(
        ...stoppedAudio.map((probe) => probe.firstSilentAfterStopAt - leaveRequestedAt),
      );
      cutoffUpperBoundsMs.push(cutoffUpperBoundMs);
      console.info(
        `Issue #12 audio departure ${cycle + 1}: ${JSON.stringify({
          cutoffUpperBoundMs,
          outsideDistance,
          radius: activeArea.radius,
        })}`,
      );
      expect(
        cutoffUpperBoundMs,
        `Audio cutoff upper bound: ${cutoffUpperBoundMs}ms`,
      ).toBeLessThanOrEqual(2000);
      await stopRemoteAudioProbe(ownerPage);
      await stopRemoteAudioProbe(memberPage);

      if (cycle < 4) {
        await memberMap.focus();
        await memberPage.keyboard.down('ArrowLeft');
        await expect
          .poll(
            async () => {
              const pair = await currentPair();
              return (
                pair.epoch === outsideRadius.epoch &&
                Math.hypot(pair.first.x - pair.second.x, pair.first.y - pair.second.y) <= 64
              );
            },
            { timeout: 15_000 },
          )
          .toBe(true);
        await memberPage.keyboard.up('ArrowLeft');
        await expect(ownerPage.getByRole('button', { name: 'Leave conversation' })).toBeVisible({
          timeout: 10_000,
        });
        await expect(memberPage.getByRole('button', { name: 'Leave conversation' })).toBeVisible({
          timeout: 10_000,
        });
        const reenteredArea = await officeConversationArea(ownerPage);
        expect(reenteredArea).not.toBeNull();
        expect(reenteredArea?.id).not.toBe(activeArea.id);
        await expect(
          ownerPage.locator('button[aria-describedby="office-microphone-help"]'),
        ).toHaveAttribute('aria-pressed', 'false');
        await expect(
          memberPage.locator('button[aria-describedby="office-microphone-help"]'),
        ).toHaveAttribute('aria-pressed', 'false');
        await ownerPage.locator('button[aria-describedby="office-microphone-help"]').click();
        await memberPage.locator('button[aria-describedby="office-microphone-help"]').click();
        await expect(ownerPage.locator('#office-microphone-help')).toHaveText(
          'Your microphone is on.',
          {
            timeout: 20_000,
          },
        );
        await expect(memberPage.locator('#office-microphone-help')).toHaveText(
          'Your microphone is on.',
          {
            timeout: 20_000,
          },
        );
        await expect(ownerRemoteAudio).toHaveCount(1, { timeout: 15_000 });
        await expect(memberRemoteAudio).toHaveCount(1, { timeout: 15_000 });
        await startRemoteAudioProbe(ownerPage);
        await startRemoteAudioProbe(memberPage);
        await expect
          .poll(async () => {
            const [ownerProbe, memberProbe] = await Promise.all([
              readRemoteAudioProbe(ownerPage),
              readRemoteAudioProbe(memberPage),
            ]);
            return Math.min(ownerProbe.activeSamples, memberProbe.activeSamples);
          })
          .toBeGreaterThan(10);
      }
    }

    console.info(
      `Issue #12 live audio boundary: ${JSON.stringify({
        cutoffUpperBoundsMs,
        sampleCount: cutoffUpperBoundsMs.length,
        empiricalP95Ms: [...cutoffUpperBoundsMs].sort((a, b) => a - b)[
          Math.ceil(cutoffUpperBoundsMs.length * 0.95) - 1
        ],
        radius: 64,
        circleRadiusPixels: area?.radius,
        reentryKeptMicrophoneMutedUntilExplicitAction: true,
      })}`,
    );

    await stopRemoteAudioProbe(ownerPage);
    await stopRemoteAudioProbe(memberPage);
    await ownerPage.getByRole('button', { name: 'Leave office' }).click();
    await memberPage.getByRole('button', { name: 'Leave office' }).click();
  } finally {
    await ownerContext?.close();
    await memberContext?.close();
  }
});

test('mounted Vivo office keeps the map and office socket live after microphone denial', async ({
  browser,
}) => {
  test.skip(
    !enabled || !mediaEnabled,
    'Run pnpm test:e2e:live-media against the local media-e2e Compose profile.',
  );
  test.setTimeout(120_000);

  const { owner, member, workspaceId } = await getLiveMediaOfficeFixture();
  let ownerContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  let memberContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  try {
    const ownerOffice = await companyPage(browser, owner.client, workspaceId);
    ownerContext = ownerOffice.context;
    const memberOffice = await companyPage(browser, member.client, workspaceId, false, true);
    memberContext = memberOffice.context;
    const ownerPage = ownerOffice.page;
    const memberPage = memberOffice.page;
    await ownerContext.grantPermissions(['microphone'], { origin: appOrigin });

    await ownerPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('2 people in the office')).toBeVisible();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    await ownerPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await memberPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await expect(
      ownerPage.getByText(
        `Paired with ${member.account.displayName}. Turn on your microphone when ready.`,
      ),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      memberPage.getByText(
        `Paired with ${owner.account.displayName}. Turn on your microphone when ready.`,
      ),
    ).toBeVisible({ timeout: 15_000 });

    await ownerPage.getByRole('button', { name: 'Activate proximity microphone' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Mute proximity microphone' })).toBeVisible({
      timeout: 15_000,
    });
    await memberPage.getByRole('button', { name: 'Activate proximity microphone' }).click();
    await expect(
      memberPage
        .getByRole('alert')
        .getByText(
          'Microphone access was denied. Allow microphone access in your browser and try again.',
        ),
    ).toBeVisible({ timeout: 15_000 });

    const ownerMap = ownerPage.locator('.office-scene svg.office-map');
    const memberMap = memberPage.locator('.office-scene svg.office-map');
    await expect(ownerMap).toHaveCount(1);
    await expect(memberMap).toHaveCount(1);
    await expect(ownerPage.getByText('2 people in the office')).toBeVisible();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    await expect(ownerPage.locator('.sidebar-foot')).toContainText('Connected');
    await expect(memberPage.locator('.sidebar-foot')).toContainText('Connected');
    await expect(
      ownerPage.getByRole('button', { name: 'Mute proximity microphone' }),
    ).toBeVisible();

    const memberName = member.account.displayName;
    const initialMemberPosition = await participantPosition(ownerPage, memberName);
    await memberMap.focus();
    await memberPage.keyboard.down('ArrowRight');
    await new Promise((resolve) => setTimeout(resolve, 900));
    await memberPage.keyboard.up('ArrowRight');
    await expect
      .poll(async () => {
        const current = await participantPosition(ownerPage, memberName);
        return current.x !== initialMemberPosition.x || current.y !== initialMemberPosition.y;
      })
      .toBe(true);

    console.info(
      `CP08 mounted UI microphone denial: ${JSON.stringify({
        deniedCapture: 'NotAllowedError',
        recoveryMessageVisible: true,
        memberOfficeSocketConnected: true,
        memberMapRemainsMounted: true,
        memberMovementVisibleToPeer: true,
        authorizedPeerMicrophoneRemainsLive: true,
      })}`,
    );
    await memberPage.getByRole('button', { name: 'Leave conversation' }).click();
    await expect(
      ownerPage.getByRole('button', { name: 'Activate proximity microphone' }),
    ).toBeVisible({
      timeout: 10_000,
    });
    await ownerPage.getByRole('button', { name: 'Leave office' }).click();
    await memberPage.getByRole('button', { name: 'Leave office' }).click();
  } finally {
    await ownerContext?.close();
    await memberContext?.close();
  }
});

test('mounted Vivo office cuts off active audio when company membership is revoked', async ({
  browser,
}) => {
  test.skip(
    !enabled || !mediaEnabled,
    'Run pnpm test:e2e:live-media against the local media-e2e Compose profile.',
  );
  test.setTimeout(120_000);

  const { owner, member, workspaceId } = await getLiveMediaOfficeFixture();
  let ownerContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  let memberContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  try {
    const ownerOffice = await companyPage(browser, owner.client, workspaceId);
    ownerContext = ownerOffice.context;
    const memberOffice = await companyPage(browser, member.client, workspaceId);
    memberContext = memberOffice.context;
    const ownerPage = ownerOffice.page;
    const memberPage = memberOffice.page;
    await ownerContext.grantPermissions(['microphone'], { origin: appOrigin });
    await memberContext.grantPermissions(['microphone'], { origin: appOrigin });

    await ownerPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('2 people in the office')).toBeVisible();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    const ownerName = owner.account.displayName;
    const memberName = member.account.displayName;
    const ownerMap = ownerPage.locator('.office-scene svg.office-map');
    const memberMap = memberPage.locator('.office-scene svg.office-map');
    await expect(ownerPage.locator('.office-map-heading strong')).toHaveText('Live Vivo office');
    await expect(ownerMap).toHaveCount(1);
    await expect(memberMap).toHaveCount(1);

    await ownerPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await memberPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await expect(
      ownerPage.getByText(`Paired with ${memberName}. Turn on your microphone when ready.`),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      memberPage.getByText(`Paired with ${ownerName}. Turn on your microphone when ready.`),
    ).toBeVisible({ timeout: 15_000 });
    await ownerPage.getByRole('button', { name: 'Activate proximity microphone' }).click();
    await memberPage.getByRole('button', { name: 'Activate proximity microphone' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Mute proximity microphone' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(memberPage.getByRole('button', { name: 'Mute proximity microphone' })).toBeVisible(
      { timeout: 15_000 },
    );

    const ownerRemoteAudio = ownerPage.locator('.office-proximity-audio-output audio');
    const memberRemoteAudio = memberPage.locator('.office-proximity-audio-output audio');
    await expect(ownerRemoteAudio).toHaveCount(1, { timeout: 15_000 });
    await expect(memberRemoteAudio).toHaveCount(1, { timeout: 15_000 });
    await startRemoteAudioProbe(ownerPage);
    await startRemoteAudioProbe(memberPage);
    await expect
      .poll(async () => (await readRemoteAudioProbe(ownerPage)).activeSamples, { timeout: 15_000 })
      .toBeGreaterThan(10);
    await expect
      .poll(async () => (await readRemoteAudioProbe(memberPage)).activeSamples, { timeout: 15_000 })
      .toBeGreaterThan(10);
    await expect
      .poll(async () => Date.now() - (await readRemoteAudioProbe(ownerPage)).lastActiveAt, {
        timeout: 5000,
      })
      .toBeLessThan(250);
    await expect
      .poll(async () => Date.now() - (await readRemoteAudioProbe(memberPage)).lastActiveAt, {
        timeout: 5000,
      })
      .toBeLessThan(250);

    const ownerAudioBeforeRevocation = await readRemoteAudioProbe(ownerPage);
    const memberAudioBeforeRevocation = await readRemoteAudioProbe(memberPage);
    const ownerCutoffMarker = await markRemoteAudioStopRequested(ownerPage);
    const memberCutoffMarker = await markRemoteAudioStopRequested(memberPage);
    const removal = await deleteJson(
      owner.client,
      `/api/workspaces/${workspaceId}/members/${member.account.id}`,
      owner.csrf,
      true,
    );
    expect(removal.status()).toBe(200);

    await expect(memberPage.getByText('Office access ended. Re-enter to reconnect.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(memberMap).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: 'Leave conversation' })).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(
      ownerPage.getByRole('button', { name: 'Activate proximity microphone' }),
    ).toBeVisible();
    await expect(ownerRemoteAudio).toHaveCount(0, { timeout: 10_000 });
    await expect(memberRemoteAudio).toHaveCount(0, { timeout: 10_000 });
    await expect(ownerMap).toHaveCount(1);
    await expect
      .poll(async () => (await readRemoteAudioProbe(ownerPage)).firstSilentAfterStopAt, {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(ownerCutoffMarker);
    await expect
      .poll(async () => (await readRemoteAudioProbe(memberPage)).firstSilentAfterStopAt, {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(memberCutoffMarker);
    await ownerPage.waitForTimeout(500);
    await memberPage.waitForTimeout(500);
    const ownerAudioAfterRevocation = await readRemoteAudioProbe(ownerPage);
    const memberAudioAfterRevocation = await readRemoteAudioProbe(memberPage);
    const cutoffUpperBoundMs = {
      owner:
        Math.max(
          0,
          (ownerAudioAfterRevocation.lastActiveAfterStopAt ||
            ownerAudioAfterRevocation.firstSilentAfterStopAt) - ownerCutoffMarker,
        ) + 20,
      member:
        Math.max(
          0,
          (memberAudioAfterRevocation.lastActiveAfterStopAt ||
            memberAudioAfterRevocation.firstSilentAfterStopAt) - memberCutoffMarker,
        ) + 20,
    };
    expect(ownerAudioBeforeRevocation.activeSamples).toBeGreaterThan(10);
    expect(memberAudioBeforeRevocation.activeSamples).toBeGreaterThan(10);
    console.info(
      `CP08.5 mounted UI membership cutoff: ${JSON.stringify({
        cutoffUpperBoundMs,
        ownerAudioElementRemoved: true,
        memberAudioElementRemoved: true,
        revokedOfficeMapRemoved: true,
        ownerMapRemainsMounted: true,
      })}`,
    );
    expect(cutoffUpperBoundMs.owner).toBeLessThanOrEqual(8000);
    expect(cutoffUpperBoundMs.member).toBeLessThanOrEqual(8000);
    await stopRemoteAudioProbe(ownerPage);
    await stopRemoteAudioProbe(memberPage);
    expect((await member.client.get(`/api/workspaces/${workspaceId}`)).status()).toBe(403);
  } finally {
    await ownerContext?.close();
    await memberContext?.close();
  }
});

test('mounted Vivo office cuts off active audio when the member session logs out', async ({
  browser,
}) => {
  test.skip(
    !enabled || !mediaEnabled,
    'Run pnpm test:e2e:live-media against the local media-e2e Compose profile.',
  );
  test.setTimeout(120_000);

  const { owner, member, workspaceId } = await getLiveMediaOfficeFixture();
  let ownerContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  let memberContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  let sessionSecurityContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  try {
    const currentMembership = await member.client.get(`/api/workspaces/${workspaceId}`);
    if (currentMembership.status() === 403) {
      const invitation = await postJson(
        owner.client,
        `/api/workspaces/${workspaceId}/invitations`,
        { email: member.email },
        owner.csrf,
        true,
      );
      expect(invitation.status()).toBe(201);
      const invitationToken = await mailToken(member.email, 'Join a company');
      const accepted = await postJson(
        member.client,
        '/api/invitations/accept',
        { token: invitationToken },
        member.csrf,
        true,
      );
      expect(accepted.status()).toBe(200);
    } else {
      expect(currentMembership.status()).toBe(200);
    }

    const ownerOffice = await companyPage(browser, owner.client, workspaceId);
    ownerContext = ownerOffice.context;
    const memberOffice = await companyPage(browser, member.client, workspaceId);
    memberContext = memberOffice.context;
    const ownerPage = ownerOffice.page;
    const memberPage = memberOffice.page;
    await ownerContext.grantPermissions(['microphone'], { origin: appOrigin });
    await memberContext.grantPermissions(['microphone'], { origin: appOrigin });

    await ownerPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Join' }).click();
    await expect(ownerPage.getByText('2 people in the office')).toBeVisible();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    await ownerPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await memberPage.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await expect(
      ownerPage.getByText(
        `Paired with ${member.account.displayName}. Turn on your microphone when ready.`,
      ),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      memberPage.getByText(
        `Paired with ${owner.account.displayName}. Turn on your microphone when ready.`,
      ),
    ).toBeVisible({ timeout: 15_000 });
    await ownerPage.getByRole('button', { name: 'Activate proximity microphone' }).click();
    await memberPage.getByRole('button', { name: 'Activate proximity microphone' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Mute proximity microphone' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(memberPage.getByRole('button', { name: 'Mute proximity microphone' })).toBeVisible(
      { timeout: 15_000 },
    );

    const ownerMap = ownerPage.locator('.office-scene svg.office-map');
    const memberMap = memberPage.locator('.office-scene svg.office-map');
    const ownerRemoteAudio = ownerPage.locator('.office-proximity-audio-output audio');
    const memberRemoteAudio = memberPage.locator('.office-proximity-audio-output audio');
    await expect(ownerRemoteAudio).toHaveCount(1, { timeout: 15_000 });
    await expect(memberRemoteAudio).toHaveCount(1, { timeout: 15_000 });
    await startRemoteAudioProbe(ownerPage);
    await startRemoteAudioProbe(memberPage);
    await expect
      .poll(async () => (await readRemoteAudioProbe(ownerPage)).activeSamples, { timeout: 15_000 })
      .toBeGreaterThan(10);
    await expect
      .poll(async () => (await readRemoteAudioProbe(memberPage)).activeSamples, { timeout: 15_000 })
      .toBeGreaterThan(10);

    const ownerAudioBeforeLogout = await readRemoteAudioProbe(ownerPage);
    const memberAudioBeforeLogout = await readRemoteAudioProbe(memberPage);
    const ownerCutoffMarker = await markRemoteAudioStopRequested(ownerPage);
    const memberCutoffMarker = await markRemoteAudioStopRequested(memberPage);
    sessionSecurityContext = await browser.newContext({
      storageState: await member.client.storageState(),
      ignoreHTTPSErrors: true,
    });
    const sessionSecurityPage = await sessionSecurityContext.newPage();
    await sessionSecurityPage.goto(appOrigin);
    await sessionSecurityPage.getByRole('link', { name: 'Account security' }).click();
    await expect(
      sessionSecurityPage.getByRole('heading', { name: 'Account security' }),
    ).toBeVisible();
    const signOutCurrentSession = sessionSecurityPage.getByRole('button', {
      name: 'Sign out this session',
    });
    await expect(signOutCurrentSession).toBeEnabled();
    await signOutCurrentSession.click();
    await expect(sessionSecurityPage.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(
      sessionSecurityPage.getByText(
        'This browser session was signed out. Sign in again to continue.',
      ),
    ).toBeVisible();

    await expect(memberPage.getByText('Office access ended. Re-enter to reconnect.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(memberMap).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: 'Leave conversation' })).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(ownerRemoteAudio).toHaveCount(0, { timeout: 10_000 });
    await expect(memberRemoteAudio).toHaveCount(0, { timeout: 10_000 });
    await expect(ownerMap).toHaveCount(1);
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible();
    expect((await member.client.get('/api/auth/me')).status()).toBe(401);
    expect(await memberPage.evaluate(async () => (await fetch('/api/auth/me')).status)).toBe(401);

    await expect
      .poll(async () => (await readRemoteAudioProbe(ownerPage)).firstSilentAfterStopAt, {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(ownerCutoffMarker);
    await expect
      .poll(async () => (await readRemoteAudioProbe(memberPage)).firstSilentAfterStopAt, {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(memberCutoffMarker);
    await ownerPage.waitForTimeout(500);
    await memberPage.waitForTimeout(500);
    const ownerAudioAfterLogout = await readRemoteAudioProbe(ownerPage);
    const memberAudioAfterLogout = await readRemoteAudioProbe(memberPage);
    const cutoffUpperBoundMs = {
      owner:
        Math.max(
          0,
          (ownerAudioAfterLogout.lastActiveAfterStopAt ||
            ownerAudioAfterLogout.firstSilentAfterStopAt) - ownerCutoffMarker,
        ) + 20,
      member:
        Math.max(
          0,
          (memberAudioAfterLogout.lastActiveAfterStopAt ||
            memberAudioAfterLogout.firstSilentAfterStopAt) - memberCutoffMarker,
        ) + 20,
    };
    expect(ownerAudioBeforeLogout.activeSamples).toBeGreaterThan(10);
    expect(memberAudioBeforeLogout.activeSamples).toBeGreaterThan(10);
    console.info(
      `CP08 mounted UI session logout cutoff: ${JSON.stringify({
        cutoffUpperBoundMs,
        memberMapRemoved: true,
        ownerMapRemainsMounted: true,
        bothRemoteAudioElementsRemoved: true,
        logoutInitiatedInAccountSecurityUi: true,
        memberSessionRejectedAfterLogout: true,
      })}`,
    );
    expect(cutoffUpperBoundMs.owner).toBeLessThanOrEqual(8000);
    expect(cutoffUpperBoundMs.member).toBeLessThanOrEqual(8000);
    await stopRemoteAudioProbe(ownerPage);
    await stopRemoteAudioProbe(memberPage);
    await ownerPage.getByRole('button', { name: 'Leave office' }).click();
  } finally {
    await ownerContext?.close();
    await memberContext?.close();
    await sessionSecurityContext?.close();
  }
});

test('mounted Vivo joins an established pair into a three-person guarded audio group', async ({
  browser,
}) => {
  test.skip(
    !enabled || !mediaEnabled,
    'Set LIVE_OFFICE_E2E=1 and LIVE_OFFICE_MEDIA_E2E=1 against a media-enabled deployment.',
  );
  test.setTimeout(480_000);

  const fixtureId = randomUUID();
  const emails = [
    `codex-group-owner-${fixtureId}@example.test`,
    `codex-group-member-a-${fixtureId}@example.test`,
    `codex-group-member-b-${fixtureId}@example.test`,
  ];
  const clients: APIRequestContext[] = [];
  const offices: Array<Awaited<ReturnType<typeof companyPage>>> = [];
  const audioProbePages: Page[] = [];
  try {
    const owner = await createAccount(emails[0]!);
    clients.push(owner.client);
    const first = await createAccount(emails[1]!);
    clients.push(first.client);
    const third = await createAccount(emails[2]!);
    clients.push(third.client);
    const members = [first, third];

    const workspaceResponse = await postJson(
      owner.client,
      '/api/workspaces',
      {
        name: `Codex group validation ${fixtureId.slice(0, 8)}`,
        slug: `codex-group-${fixtureId.slice(0, 12)}`,
      },
      owner.csrf,
      true,
    );
    expect(workspaceResponse.status()).toBe(201);
    const workspaceBody = (await workspaceResponse.json()) as { workspace: { id: string } };
    const workspaceId = workspaceBody.workspace.id;

    for (const member of members) {
      const invitation = await postJson(
        owner.client,
        `/api/workspaces/${workspaceId}/invitations`,
        { email: member.email },
        owner.csrf,
        true,
      );
      expect(invitation.status()).toBe(201);
      const invitationToken = await mailToken(member.email, 'Join a company');
      const accepted = await postJson(
        member.client,
        '/api/invitations/accept',
        { token: invitationToken },
        member.csrf,
        true,
      );
      expect(accepted.status()).toBe(200);
    }

    for (const member of [owner, first, third])
      offices.push(await companyPage(browser, member.client, workspaceId, false, false, true));
    await Promise.all(
      offices.map((office) =>
        office.context.grantPermissions(['microphone'], { origin: appOrigin }),
      ),
    );

    const pages = offices.map((office) => office.page);
    for (const page of pages) await page.getByRole('button', { name: 'Join' }).click();
    for (const page of pages)
      await expect(page.getByText('3 people in the office')).toBeVisible({ timeout: 20_000 });

    await pages[0]!.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    await pages[1]!.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    for (const index of [0, 1]) {
      await expect(pages[index]!.locator('.office-voice-status')).toContainText(
        '2-person conversation',
        { timeout: 30_000 },
      );
      await pages[index]!.locator('button[aria-describedby="office-microphone-help"]').click();
    }
    for (const index of [0, 1]) {
      await expect(pages[index]!.locator('#office-microphone-help')).toHaveText(
        'Your microphone is on.',
        { timeout: 30_000 },
      );
      await expect(pages[index]!.locator('.office-proximity-audio-output audio')).toHaveCount(1, {
        timeout: 20_000,
      });
    }
    for (const index of [0, 1]) {
      await startRemoteAudioProbe(pages[index]!);
      audioProbePages.push(pages[index]!);
      await expect
        .poll(async () => (await readRemoteAudioProbe(pages[index]!)).activeSamples, {
          timeout: 20_000,
        })
        .toBeGreaterThan(5);
    }
    await Promise.all(audioProbePages.map(stopRemoteAudioProbe));
    audioProbePages.length = 0;

    const thirdJoinStartedAt = Date.now();
    await pages[2]!.getByRole('button', { name: 'Opt in to nearby voice' }).click();
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]!;
      await expect(page.locator('.office-voice-status')).toContainText('3-person conversation', {
        timeout: 30_000,
      });
      await expect(page.locator('.office-proximity-audio-output audio')).toHaveCount(
        index === 2 ? 2 : 1,
        {
          timeout: 20_000,
        },
      );
      await expect(page.locator('.office-voice-members')).toContainText('3 participants');
    }
    await expect(pages[2]!.locator('#office-microphone-help')).toContainText(
      'Your microphone is off',
    );
    await pages[2]!.locator('button[aria-describedby="office-microphone-help"]').click();
    await expect(pages[2]!.locator('#office-microphone-help')).toHaveText(
      'Your microphone is on.',
      { timeout: 30_000 },
    );
    for (const page of pages) {
      await expect(page.locator('.office-proximity-audio-output audio')).toHaveCount(2, {
        timeout: 20_000,
      });
    }
    const groupJoinLatencyMs = Date.now() - thirdJoinStartedAt;

    for (const page of pages) {
      await startRemoteAudioProbe(page);
      audioProbePages.push(page);
      await expect
        .poll(async () => (await readRemoteAudioProbe(page)).activeSamples, { timeout: 20_000 })
        .toBeGreaterThan(5);
    }
    const decodedAudioActiveSamples = await Promise.all(
      pages.map(async (page) => (await readRemoteAudioProbe(page)).activeSamples),
    );
    const rtcObservations = await Promise.all(pages.map(readOfficeRtcDiagnostics));
    const activePeersByParticipant = rtcObservations.map((peers) =>
      peers.filter((peer) => peer.connectionState === 'connected'),
    );
    expect(activePeersByParticipant.every((peers) => peers.length > 0)).toBe(true);
    expect(
      activePeersByParticipant.every((peers) =>
        peers.some((peer) => peer.iceState === 'connected'),
      ),
    ).toBe(true);
    const selectedCandidateTypes = activePeersByParticipant
      .flatMap((peers) => peers.flatMap((peer) => peer.pairs))
      .filter((pair) => pair.selected || pair.nominated)
      .map((pair) => `${pair.localType ?? 'unknown'}-${pair.remoteType ?? 'unknown'}`);
    const inboundAudioStatsByParticipant = activePeersByParticipant.map((peers) =>
      peers
        .flatMap((peer) => peer.audioStreams)
        .filter((stream) => stream.direction === 'inbound')
        .map((stream) => ({
          bytes: stream.bytes,
          totalSamplesReceived: stream.totalSamplesReceived,
        })),
    );

    console.info(
      `three-person deployed Vivo audio: ${JSON.stringify({
        participantCount: pages.length,
        remoteTracksPerParticipant: [2, 2, 2],
        decodedAudioActiveSamples,
        connectedPeerConnectionsByParticipant: activePeersByParticipant.map(
          (peers) => peers.length,
        ),
        inboundAudioStatsByParticipant,
        selectedCandidateTypes,
        groupJoinLatencyMs,
      })}`,
    );

    await Promise.all(audioProbePages.map(stopRemoteAudioProbe));
    audioProbePages.length = 0;
    const removalStartedAt = Date.now();
    await pages[2]!.getByRole('button', { name: 'Leave conversation' }).click();
    await expect(pages[2]!.locator('.office-proximity-audio-output audio')).toHaveCount(0, {
      timeout: 10_000,
    });
    const removedAudioElementMs = Date.now() - removalStartedAt;
    for (const index of [0, 1]) {
      await expect(pages[index]!.locator('.office-voice-status')).toContainText(
        '2-person conversation',
        { timeout: 30_000 },
      );
      await expect(pages[index]!.locator('.office-proximity-audio-output audio')).toHaveCount(1, {
        timeout: 20_000,
      });
      await startRemoteAudioProbe(pages[index]!);
      audioProbePages.push(pages[index]!);
      await expect
        .poll(async () => (await readRemoteAudioProbe(pages[index]!)).activeSamples, {
          timeout: 20_000,
        })
        .toBeGreaterThan(5);
    }
    console.info(
      `three-person deployed Vivo removal: ${JSON.stringify({
        removedParticipantAudioElements: 0,
        survivorParticipants: 2,
        survivorRemoteTracks: [1, 1],
        survivorDecodedAudioResumed: true,
        removedAudioElementMs,
      })}`,
    );
  } finally {
    await Promise.all(audioProbePages.map((page) => stopRemoteAudioProbe(page).catch(() => {})));
    await Promise.all(offices.map((office) => office.context.close()));
    await Promise.all(clients.map((client) => client.dispose()));
  }
});

test('mounted Vivo entry microphone opens and closes capture and preserves the choice after Join', async ({
  browser,
}) => {
  test.skip(!enabled || !mediaEnabled, 'Requires the local OrbStack media stack.');
  test.setTimeout(150_000);
  const { owner, member, workspaceId } = await getLiveMediaOfficeFixture();
  const offices: Awaited<ReturnType<typeof companyPage>>[] = [];
  try {
    for (const account of [owner, member]) {
      const office = await companyPage(browser, account.client, workspaceId);
      offices.push(office);
      await office.context.grantPermissions(['microphone'], { origin: appOrigin });
      await office.page.evaluate(() => {
        // Observe native browser capture; do not synthesize streams or speaker events here.
        const streams: MediaStream[] = [];
        Object.assign(window, { __entryNativeStreams: streams });
        const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          const stream = await capture(constraints);
          streams.push(stream);
          return stream;
        };
      });
      await expect(office.page.locator('.office-prejoin-camera, video')).toHaveCount(0);
      await expect(office.page.getByRole('textbox', { name: 'Display name' })).toHaveValue(
        account.account.displayName,
      );
    }
    const [ownerOffice, memberOffice] = offices;
    const ownerPage = ownerOffice!.page;
    const memberPage = memberOffice!.page;
    const captureState = (page: Page) =>
      page.evaluate(() => {
        const streams = (window as unknown as { __entryNativeStreams: MediaStream[] })
          .__entryNativeStreams;
        return {
          streams: streams.length,
          live: streams
            .flatMap((stream) => stream.getAudioTracks())
            .filter((track) => track.readyState === 'live' && track.enabled).length,
        };
      });
    expect(await captureState(ownerPage)).toEqual({ streams: 0, live: 0 });
    let started = Date.now();
    await ownerPage.getByRole('button', { name: 'Turn microphone on', exact: true }).click();
    await expect(
      ownerPage.getByRole('button', { name: 'Turn microphone off', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await captureState(ownerPage)).live).toBe(1);
    const microphoneOnMs = Date.now() - started;
    started = Date.now();
    await ownerPage.getByRole('button', { name: 'Turn microphone off', exact: true }).click();
    await expect.poll(async () => (await captureState(ownerPage)).live).toBe(0);
    const microphoneOffMs = Date.now() - started;
    await ownerPage.getByRole('button', { name: 'Turn microphone on', exact: true }).click();
    await expect(
      ownerPage.getByRole('button', { name: 'Turn microphone off', exact: true }),
    ).toBeVisible();
    await ownerPage.screenshot({ path: test.info().outputPath('office-entry-microphone-on.png') });
    await ownerPage.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible();
    await expect(
      ownerPage.getByRole('button', { name: 'Mute proximity microphone', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(ownerPage.locator('#office-microphone-help')).toContainText(
      'waiting for a nearby coworker',
    );
    // Entry capture is released; publication waits for an authorized nearby conversation.
    expect(await captureState(ownerPage)).toEqual({ streams: 2, live: 0 });
    await memberPage.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(
      memberPage.getByRole('button', { name: 'Activate proximity microphone', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(await captureState(memberPage)).toEqual({ streams: 0, live: 0 });
    started = Date.now();
    await memberPage
      .getByRole('button', { name: 'Activate proximity microphone', exact: true })
      .click();
    for (const { page } of offices) {
      await expect(page.locator('#office-microphone-help')).toHaveText('Your microphone is on.', {
        timeout: 25_000,
      });
      await expect(page.locator('.office-proximity-audio-output audio')).toHaveCount(1, {
        timeout: 15_000,
      });
      await expect.poll(async () => (await captureState(page)).live).toBe(1);
      const playback = page.getByRole('button', { name: 'Enable speaker audio' });
      if (await playback.isVisible()) await playback.click();
    }
    const joinChoiceToLiveAudioMs = Date.now() - started;
    await startRemoteAudioProbe(memberPage);
    await expect
      .poll(async () => (await readRemoteAudioProbe(memberPage)).activeSamples, { timeout: 20_000 })
      .toBeGreaterThan(3);
    const receivedAudioSamples = (await readRemoteAudioProbe(memberPage)).activeSamples;
    await stopRemoteAudioProbe(memberPage);
    await ownerPage.getByRole('button', { name: 'Mute proximity microphone', exact: true }).click();
    await expect.poll(async () => (await captureState(ownerPage)).live).toBe(0);
    for (const { page } of offices)
      await page.getByRole('button', { name: 'Leave office', exact: true }).click();
    for (const { page } of offices) {
      await expect(
        page.getByRole('button', { name: 'Turn microphone on', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(async () => (await captureState(page)).live).toBe(0);
    }
    await ownerPage.getByRole('button', { name: 'Turn microphone on', exact: true }).click();
    await expect(
      ownerPage.getByRole('button', { name: 'Turn microphone off', exact: true }),
    ).toBeVisible();
    await ownerPage.getByRole('link', { name: 'Back to companies', exact: true }).click();
    await expect.poll(async () => (await captureState(ownerPage)).live).toBe(0);
    const measurements = {
      microphoneOnMs,
      microphoneOffMs,
      joinChoiceToLiveAudioMs,
      receivedAudioSamples,
      offChoicePreserved: true,
      onChoicePublishedWithoutSecondClick: true,
      entryTracksReleasedOnJoin: true,
      tracksReleasedOnExit: true,
    };
    console.info(`OrbStack entry microphone measurements: ${JSON.stringify(measurements)}`);
    await test.info().attach('entry-microphone-measurements', {
      body: JSON.stringify(measurements, null, 2),
      contentType: 'application/json',
    });
  } finally {
    for (const office of offices.reverse()) await office.context.close();
  }
});

test('mounted Vivo talking animation follows live speech, silence, mute and reduced motion on two clients', async ({
  browser,
}) => {
  test.skip(!enabled || !mediaEnabled, 'Requires the OrbStack media-e2e stack.');
  test.setTimeout(150_000);
  const { owner, member, workspaceId } = await getLiveMediaOfficeFixture();
  const offices: Awaited<ReturnType<typeof companyPage>>[] = [];
  try {
    for (const account of [owner, member]) {
      const office = await companyPage(browser, account.client, workspaceId);
      offices.push(office);
      await office.page.evaluate(() => {
        let context: AudioContext | undefined;
        let gain: GainNode | undefined;
        // A real Web Audio capture stream goes through normal LiveKit publication and SFU VAD.
        // Only the microphone source is controlled; no speaker events are mocked.
        Object.assign(window, {
          __setTalkingSource: (audible: boolean) => {
            if (gain && context) gain.gain.setValueAtTime(audible ? 0.35 : 0, context.currentTime);
          },
        });
        navigator.mediaDevices.getUserMedia = async () => {
          context = new AudioContext();
          await context.resume();
          const oscillator = context.createOscillator();
          oscillator.frequency.value = 440;
          gain = context.createGain();
          gain.gain.value = 0;
          const output = context.createMediaStreamDestination();
          oscillator.connect(gain).connect(output);
          oscillator.start();
          return output.stream;
        };
      });
      await office.page.getByRole('button', { name: 'Join', exact: true }).click();
    }
    for (const { page } of offices) {
      await expect(page.getByText('2 people in the office')).toBeVisible();
      await page.getByRole('button', { name: 'Activate proximity microphone' }).click();
    }
    for (const { page } of offices) {
      await expect(page.locator('#office-microphone-help')).toHaveText('Your microphone is on.', {
        timeout: 25_000,
      });
      await expect(page.locator('.office-proximity-audio-output audio')).toHaveCount(1);
    }
    const speaking = (page: Page, self: boolean) =>
      page.locator(`.scene-avatar${self ? '.is-self' : ':not(.is-self)'}[data-speaking="true"]`);
    const source = (page: Page, audible: boolean) =>
      page.evaluate((value) => {
        (window as unknown as { __setTalkingSource: (value: boolean) => void }).__setTalkingSource(
          value,
        );
      }, audible);
    const metrics: Record<string, number> = {};
    for (let speaker = 0; speaker < offices.length; speaker++) {
      const sender = offices[speaker]!.page;
      const receiver = offices[1 - speaker]!.page;
      for (const { page } of offices)
        await expect(page.locator('[data-speaking="true"]')).toHaveCount(0);
      let started = Date.now();
      await source(sender, true);
      await expect(speaking(sender, true)).toHaveCount(1, { timeout: 10_000 });
      await expect(speaking(receiver, false)).toHaveCount(1, { timeout: 10_000 });
      metrics[`client${speaker + 1}SpeechMs`] = Date.now() - started;
      // Both views animate the same participant without animating the silent partner.
      await expect(speaking(sender, false)).toHaveCount(0);
      await expect(speaking(receiver, true)).toHaveCount(0);
      expect(
        await speaking(receiver, false)
          .locator('.scene-speaking-bar')
          .first()
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('scene-speaking-bars');
      await receiver.screenshot({
        path: test.info().outputPath(`client-${speaker + 1}-talking.png`),
      });
      started = Date.now();
      await source(sender, false);
      for (const { page } of offices)
        await expect(page.locator('[data-speaking="true"]')).toHaveCount(0, { timeout: 10_000 });
      metrics[`client${speaker + 1}SilenceMs`] = Date.now() - started;
      await source(sender, true);
      await expect(speaking(receiver, false)).toHaveCount(1, { timeout: 10_000 });
      await receiver.emulateMedia({ reducedMotion: 'reduce' });
      expect(
        await speaking(receiver, false)
          .locator('.scene-speaking-bar')
          .first()
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('none');
      await receiver.emulateMedia({ reducedMotion: 'no-preference' });
      started = Date.now();
      await sender.getByRole('button', { name: 'Mute proximity microphone', exact: true }).click();
      for (const { page } of offices)
        await expect(page.locator('[data-speaking="true"]')).toHaveCount(0, { timeout: 10_000 });
      metrics[`client${speaker + 1}MuteMs`] = Date.now() - started;
      await source(sender, false);
      await sender
        .getByRole('button', { name: 'Unmute proximity microphone', exact: true })
        .click();
      await expect(sender.locator('#office-microphone-help')).toHaveText('Your microphone is on.');
    }
    console.info(`Talking animation two-client measurements: ${JSON.stringify(metrics)}`);
    await test.info().attach('talking-animation-measurements', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    });
  } finally {
    for (const office of offices.reverse()) await office.context.close();
  }
});

test('deployed SPA routes retain auth destinations, reload nested pages and deny mismatched offices', async ({
  browser,
}) => {
  test.skip(!enabled, 'Requires the authorized local OrbStack stack.');
  test.setTimeout(90_000);
  const { owner, workspaceId } = await getLiveMediaOfficeFixture();
  const office = await companyPage(browser, owner.client, workspaceId);
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const entry = new URL(office.page.url()).pathname;
    expect(entry).toMatch(new RegExp(`^/companies/${workspaceId}/offices/[^/]+/entry$`));
    const response = await office.page.reload();
    expect(response?.status()).toBe(200);
    expect(response?.headers()['cache-control']).toContain('no-store');
    const assetPath = await office.page.locator('script[type="module"][src]').getAttribute('src');
    expect(assetPath).toMatch(/^\/assets\//);
    const asset = await office.page.request.get(appOrigin + assetPath);
    expect(asset.headers()['cache-control']).toContain('immutable');
    await expect(
      office.page.getByRole('heading', { name: `Welcome to`, exact: false }),
    ).toBeVisible();
    await expect(office.page).toHaveURL(appOrigin + entry);
    await office.page.goto(`${appOrigin}/account/security`);
    await expect(
      office.page.getByRole('heading', { name: 'Account security', exact: true }),
    ).toBeVisible();
    await office.page.reload();
    await expect(
      office.page.getByRole('heading', { name: 'Account security', exact: true }),
    ).toBeVisible();
    await office.page.goBack();
    await expect(office.page).toHaveURL(appOrigin + entry);
    const page = await anonymous.newPage();
    await page.goto(appOrigin + entry);
    await expect(page).toHaveURL(new RegExp('/login\\?returnTo='));
    await page.getByLabel('Email', { exact: true }).fill(owner.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(appOrigin + entry);
    await expect(page.getByRole('textbox', { name: 'Display name' })).toHaveValue(
      owner.account.displayName,
    );
    await page.goto(
      `${appOrigin}/companies/${workspaceId}/offices/11111111-1111-4111-8111-111111111111/entry`,
    );
    await expect(
      page.getByRole('heading', { name: 'Office not found or access denied' }),
    ).toBeVisible();
    await page.goto(appOrigin + '/a-missing-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    console.info(
      'OrbStack SPA routing: native login return, nested reload, no-store HTML, browser Back, office ID authorization and unknown page all passed.',
    );
  } finally {
    await anonymous.close();
    await office.context.close();
  }
});
