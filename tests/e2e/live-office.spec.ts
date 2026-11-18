import { randomUUID } from 'node:crypto';
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

async function mailToken(email: string, subject: string) {
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
          if (code?.[1]) return code[1];
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
  };
  await page.routeWebSocket(/\/socket\.io\//, (webSocket) => {
    probe.interrupted = false;
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
    await expect(memberOwnerRow.locator('small')).toHaveText('available');
    await ownerPage.getByRole('button', { name: 'Away', exact: true }).click();
    await expect(ownerPage.getByRole('button', { name: 'Away', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => gapProbe.state.resyncRequested).toBe(true);
    await expect.poll(() => gapProbe.state.snapshotReceived).toBe(true);
    await expect(memberOwnerRow.locator('small')).toHaveText('away');

    gapProbe.interrupt();
    await expect(memberPage.getByText('Office connection closed.')).toBeVisible({
      timeout: 65_000,
    });
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible({ timeout: 65_000 });
    await memberPage.getByRole('button', { name: 'Join' }).click();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    await expect(
      ownerPage
        .getByRole('region', { name: 'People in the office' })
        .getByRole('listitem')
        .filter({ hasText: ownerName })
        .locator('small'),
    ).toHaveText('away');

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
      .getByRole('region', { name: 'People in the office' })
      .getByRole('list');
    const ownerRoster = ownerSecondPage
      .getByRole('region', { name: 'People in the office' })
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
