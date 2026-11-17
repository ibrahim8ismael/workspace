import { randomUUID } from 'node:crypto';
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';

const enabled = process.env['LIVE_OFFICE_E2E'] === '1';
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
            /One-time code:\s*([A-Za-z0-9_-]{43}|[A-Za-z0-9]{8}|[0-9]{6})\b/,
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
    data: { email, displayName: email.includes('owner') ? 'Omar Hassan' : 'Nora Ali', password },
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(register.status()).toBe(202);
  const verifyToken = await mailToken(email, 'Verify your email', registeredAt);
  const verified = await client.post('/api/auth/verify-email', {
    data: { email, token: verifyToken, password },
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

async function openOffice(browser: Browser, client: APIRequestContext, workspaceId: string) {
  const context = await browser.newContext({
    storageState: await client.storageState(),
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto(appOrigin);
  await page
    .locator(`[data-workspace-id="${workspaceId}"]`)
    .getByRole('link', { name: 'Open office', exact: true })
    .click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  return { context, page };
}

async function position(page: Page, name: string) {
  return page.locator('.scene-avatar').evaluateAll((els, label) => {
    const avatar = els.find((el) => el.getAttribute('aria-label')?.startsWith(label));
    const coords = avatar?.parentElement
      ?.getAttribute('transform')
      ?.match(/translate\((-?[\d.]+)\s+(-?[\d.]+)\)/);
    if (!coords) throw new Error('Avatar position missing');
    return { x: Number(coords[1]), y: Number(coords[2]) };
  }, name);
}

test('live selected member actions: two-user card, wave, go to and mobile', async ({
  browser,
}, testInfo) => {
  test.skip(!enabled, 'Requires the local live-office stack and Mailpit.');
  test.setTimeout(100_000);
  const { owner, member, workspaceId } = await getLiveMediaOfficeFixture();
  const a = await openOffice(browser, owner.client, workspaceId);
  const b = await openOffice(browser, member.client, workspaceId);
  testInfo.setTimeout(100_000);
  a.page.setDefaultTimeout(10000);
  b.page.setDefaultTimeout(10000);
  const errors: string[] = [];
  for (const page of [a.page, b.page]) page.on('pageerror', (e) => errors.push(e.message));
  const avatarBonA = a.page
    .locator('.scene-avatar')
    .filter({ hasText: member.account.displayName });
  try {
    await expect(a.page.getByText('2 people in the office', { exact: true })).toBeVisible();
    // Separate avatars before selection to avoid overlapping spawn positions.
    const map = a.page.locator('svg.office-map');
    await map.focus();
    await a.page.keyboard.down('ArrowRight');
    await a.page.waitForTimeout(650);
    await a.page.keyboard.up('ArrowRight');
    await avatarBonA.click();
    const card = a.page.getByRole('dialog', { name: 'Member actions' });
    await expect(card).toBeVisible();
    await expect(card).toContainText(member.account.displayName);
    await expect(card.getByRole('button', { name: /Go to/ })).toBeEnabled();
    const wave = card.getByRole('button', { name: /Wave/ });
    await wave.click();
    await expect(
      b.page.getByText(`${owner.account.displayName} waved to you.`, { exact: true }),
    ).toBeVisible();
    await expect(wave).toBeEnabled();
    await expect(wave).toHaveText('');
    const notice = b.page.locator('.office-wave-toast');
    let lastWaveId = await notice.getAttribute('data-wave-id');
    for (let i = 0; i < 3; i++) {
      await wave.click();
      await expect(notice).not.toHaveAttribute('data-wave-id', lastWaveId!);
      lastWaveId = await notice.getAttribute('data-wave-id');
    }
    await expect(a.page.locator('.scene-wave-hand')).toHaveCount(0);
    await expect(b.page.locator('.scene-wave-hand')).toHaveCount(0);
    await a.page.screenshot({
      path: testInfo.outputPath('member-card-desktop.png'),
      fullPage: true,
    });
    await a.page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await avatarBonA.focus();
    await a.page.keyboard.press('Enter');
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /Close/ }).click();
    await expect(card).toHaveCount(0);
    // Move farther away, then verify real authoritative Go to movement visible to the peer.
    await map.focus();
    await a.page.keyboard.down('ArrowRight');
    await a.page.waitForTimeout(750);
    await a.page.keyboard.up('ArrowRight');
    const before = await position(b.page, owner.account.displayName);
    await avatarBonA.click();
    const goTo = card.getByRole('button', { name: /Go to/ });
    await goTo.focus();
    await a.page.keyboard.press('Enter');
    await expect(a.page.locator('#office-map')).toBeFocused();
    // No extra click/focus: movement keys must take over immediately after Go to.
    await a.page.keyboard.down('ArrowRight');
    await a.page.waitForTimeout(250);
    await a.page.keyboard.up('ArrowRight');
    await expect(card.getByText('Movement stopped.', { exact: true })).toBeVisible();
    const stopped = await position(b.page, owner.account.displayName);
    await a.page.waitForTimeout(300);
    const afterStop = await position(b.page, owner.account.displayName);
    expect(Math.hypot(stopped.x - afterStop.x, stopped.y - afterStop.y)).toBeLessThan(12);
    await goTo.click();
    await expect(a.page.locator('#office-map')).toBeFocused();
    await expect
      .poll(async () =>
        Math.hypot(
          (await position(b.page, owner.account.displayName)).x - before.x,
          (await position(b.page, owner.account.displayName)).y - before.y,
        ),
      )
      .toBeGreaterThan(20);
    await expect
      .poll(
        async () => {
          const own = await position(b.page, owner.account.displayName),
            target = await position(b.page, member.account.displayName);
          return Math.hypot(own.x - target.x, own.y - target.y);
        },
        { timeout: 15000 },
      )
      .toBeLessThan(64);
    const targetPos = await position(b.page, member.account.displayName),
      ownPos = await position(b.page, owner.account.displayName);
    expect(Math.hypot(ownPos.x - targetPos.x, ownPos.y - targetPos.y)).toBeGreaterThan(8);
    await b.page
      .locator('.office-person-select')
      .filter({ hasText: owner.account.displayName })
      .click();
    const reverseCard = b.page.getByRole('dialog', { name: 'Member actions' });
    await reverseCard.getByRole('button', { name: /Wave/ }).click();
    await expect(
      a.page.getByText(`${member.account.displayName} waved to you.`, { exact: true }),
    ).toBeVisible();
    await a.page.setViewportSize({ width: 390, height: 844 });
    await expect(card).toBeVisible();
    expect(
      await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await a.page.screenshot({
      path: testInfo.outputPath('member-card-mobile.png'),
      fullPage: true,
    });
    await expect(card.getByRole('button', { name: /Wave/ })).toBeEnabled();
    await card.getByRole('button', { name: /Wave/ }).click();
    await expect(
      b.page.getByText(`${owner.account.displayName} waved to you.`, { exact: true }),
    ).toBeVisible();
    await b.context.close();
    await expect(a.page.getByText('1 person in the office', { exact: true })).toBeVisible();
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
