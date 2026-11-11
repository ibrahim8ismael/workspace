import { randomUUID } from 'node:crypto';
import {
  expect,
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
  Created?: string;
  Date?: string;
  To: Array<{ Address: string }>;
};

type OfficeAudioProbe = {
  activeSamples: number;
  lastActiveAt: number;
  firstSilentAfterStopAt: number;
  lastActiveAfterStopAt: number;
  stopRequestedAt: number;
  interval: number;
  context: AudioContext;
  analyser: AnalyserNode;
  samples: Float32Array;
};

declare global {
  interface Window {
    __officeAudioProbe?: OfficeAudioProbe;
  }
}

async function json(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  if (!response.ok()) throw new Error(`Local API request failed (${response.status()}).`);
  return (await response.json()) as Record<string, unknown>;
}

async function mailToken(email: string, subject: string, notBefore: number) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const listResponse = await fetch(`${mailpitOrigin}/api/v1/messages?start=0&limit=50`);
    if (listResponse.ok) {
      const list = (await listResponse.json()) as { messages?: MailpitMessage[] };
      const message = list.messages?.find(
        (candidate) =>
          candidate.Subject.includes(subject) &&
          candidate.To.some((entry) => entry.Address.toLowerCase() === email.toLowerCase()) &&
          new Date(candidate.Created ?? candidate.Date ?? 0).getTime() >= notBefore - 1000,
      );
      if (message) {
        const detailResponse = await fetch(
          `${mailpitOrigin}/api/v1/message/${encodeURIComponent(message.ID)}`,
        );
        if (detailResponse.ok) {
          const detail = (await detailResponse.json()) as { Text?: string; HTML?: string };
          const code = `${detail.Text ?? ''}\n${detail.HTML ?? ''}`.match(
            /One-time code:\s*([A-Za-z0-9_-]{43})/,
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
  const registeredAt = Date.now();
  const register = await client.post('/api/auth/register', {
    data: { email, displayName: `E2E ${email.split('@')[0]}`, password },
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(register.status()).toBe(202);
  const verifyToken = await mailToken(email, 'Verify your email', registeredAt);
  const verified = await client.post('/api/auth/verify-email', {
    data: { token: verifyToken, password },
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(verified.status()).toBe(200);
  const login = await client.post('/api/auth/login', {
    data: { email, password },
    headers: { 'X-CSRF-Token': csrf },
  });
  const loginBody = await json(login);
  csrf = String(loginBody.csrfToken);
  const account = loginBody.account as { id: string; displayName: string };
  return { client, csrf, account };
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

async function participantPosition(page: import('@playwright/test').Page, displayName: string) {
  return page.locator('.office-scene svg.office-map .scene-avatar').evaluateAll((avatars, name) => {
    const avatar = avatars.find((element) => element.getAttribute('aria-label')?.startsWith(name));
    const transform = avatar?.parentElement?.getAttribute('transform') ?? '';
    const coordinates = transform.match(/translate\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)/);
    if (!coordinates) throw new Error('The remote Vivo avatar has no world-position transform.');
    return { x: Number(coordinates[1]), y: Number(coordinates[2]) };
  }, displayName);
}

async function nearestVisibleOpenSeatId(map: Locator) {
  return map.evaluate((svg) => {
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
      interval: 0,
      context,
      analyser,
      samples,
    };
    probe.interval = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const observedAt = Date.now();
      if (samples.some((sample) => Math.abs(sample) > 0.01)) {
        probe.activeSamples += 1;
        probe.lastActiveAt = observedAt;
        if (probe.stopRequestedAt > 0) probe.lastActiveAfterStopAt = observedAt;
      } else if (probe.stopRequestedAt > 0 && probe.firstSilentAfterStopAt === 0) {
        probe.firstSilentAfterStopAt = observedAt;
      }
    }, 20);
    window.__officeAudioProbe = probe;
  });
}

async function readRemoteAudioProbe(page: Page) {
  return page.evaluate(() => ({
    activeSamples: window.__officeAudioProbe?.activeSamples ?? 0,
    lastActiveAt: window.__officeAudioProbe?.lastActiveAt ?? 0,
    firstSilentAfterStopAt: window.__officeAudioProbe?.firstSilentAfterStopAt ?? 0,
    lastActiveAfterStopAt: window.__officeAudioProbe?.lastActiveAfterStopAt ?? 0,
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
) {
  const context = await browser.newContext({
    storageState: await client.storageState(),
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  // Register before navigation: Socket.IO captures WebSocket when its module loads.
  const gapProbe = withGapProbe ? await interceptWorldVersionGap(page) : null;
  await page.goto(appOrigin);
  await expect(page.locator(`[data-workspace-id="${workspaceId}"]`)).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator(`[data-workspace-id="${workspaceId}"]`)
    .getByRole('button', { name: 'Open office' })
    .click();
  await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
  await expect(page.getByText('SIGN-IN STATUS', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Company details' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Employee invitations' })).toHaveCount(0);
  return { context, page, gapProbe };
}

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

    const invitedAt = Date.now();
    const inviteResponse = await postJson(
      owner.client,
      `/api/workspaces/${workspaceId}/invitations`,
      { email: memberEmail },
      owner.csrf,
      true,
    );
    expect(inviteResponse.status()).toBe(201);
    const inviteToken = await mailToken(memberEmail, 'Join a company', invitedAt);
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

    const initialPosition = await participantPosition(memberPage, ownerName);
    await ownerMap.focus();
    await ownerPage.keyboard.down('ArrowRight');
    await new Promise((resolve) => setTimeout(resolve, 900));
    await ownerPage.keyboard.up('ArrowRight');
    await expect
      .poll(async () => {
        const current = await participantPosition(memberPage, ownerName);
        return current.x !== initialPosition.x || current.y !== initialPosition.y;
      })
      .toBe(true);

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

    await ownerSecondPage.getByRole('button', { name: 'Back to companies' }).click();
    await expect(ownerSecondPage.getByRole('heading', { name: 'Your companies' })).toBeVisible();
    await expect(ownerSecondPage.locator('.office-scene svg.office-map')).toHaveCount(0);
    await ownerSecondPage
      .locator(`[data-workspace-id="${secondWorkspaceBody.workspace.id}"]`)
      .getByRole('button', { name: 'Open office' })
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
  test.setTimeout(120_000);

  const ownerEmail = `cp08510-owner-${randomUUID()}@example.test`;
  const memberEmail = `cp08510-member-${randomUUID()}@example.test`;
  const owner = await createAccount(ownerEmail);
  const member = await createAccount(memberEmail);
  let ownerContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  let memberContext: Awaited<ReturnType<typeof companyPage>>['context'] | undefined;
  try {
    const workspaceResponse = await postJson(
      owner.client,
      '/api/workspaces',
      {
        name: `CP08.5.10 ${randomUUID().slice(0, 8)}`,
        slug: `cp08510-${randomUUID().slice(0, 12)}`,
      },
      owner.csrf,
      true,
    );
    expect(workspaceResponse.status()).toBe(201);
    const workspaceBody = (await workspaceResponse.json()) as { workspace: { id: string } };
    const workspaceId = workspaceBody.workspace.id;

    const invitationStartedAt = Date.now();
    const invitation = await postJson(
      owner.client,
      `/api/workspaces/${workspaceId}/invitations`,
      { email: memberEmail },
      owner.csrf,
      true,
    );
    expect(invitation.status()).toBe(201);
    const invitationToken = await mailToken(memberEmail, 'Join a company', invitationStartedAt);
    const accepted = await postJson(
      member.client,
      '/api/invitations/accept',
      { token: invitationToken },
      member.csrf,
      true,
    );
    expect(accepted.status()).toBe(200);

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
    const ownerName = `E2E ${ownerEmail.split('@')[0]}`;
    const memberName = `E2E ${memberEmail.split('@')[0]}`;
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
    await expect(ownerRemoteAudio).toHaveCount(1, { timeout: 15_000 });
    await startRemoteAudioProbe(ownerPage);
    await expect
      .poll(async () => (await readRemoteAudioProbe(ownerPage)).activeSamples, { timeout: 15_000 })
      .toBeGreaterThan(10);
    await expect
      .poll(async () => Date.now() - (await readRemoteAudioProbe(ownerPage)).lastActiveAt, {
        timeout: 5000,
      })
      .toBeLessThan(250);

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

    await ownerPage.getByRole('button', { name: 'Leave office' }).click();
    await memberPage.getByRole('button', { name: 'Leave office' }).click();
  } finally {
    await ownerContext?.close();
    await memberContext?.close();
    await owner.client.dispose();
    await member.client.dispose();
  }
});
