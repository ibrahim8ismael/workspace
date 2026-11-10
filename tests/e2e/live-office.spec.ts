import { randomUUID } from 'node:crypto';
import { expect, request, test, type APIRequestContext, type Browser } from '@playwright/test';

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

async function holdKey(page: import('@playwright/test').Page, key: string, durationMs: number) {
  await page.keyboard.down(key);
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  await page.keyboard.up(key);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function participantPosition(page: import('@playwright/test').Page, displayName: string) {
  return page
    .locator('.office-live-participants li')
    .filter({ hasText: displayName })
    .evaluate((element) => ({
      x: Number(element.getAttribute('data-position-x')),
      y: Number(element.getAttribute('data-position-y')),
    }));
}

async function moveToTile(
  page: import('@playwright/test').Page,
  displayName: string,
  target: { tx: number; ty: number },
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const position = await participantPosition(page, displayName);
    const tx = Math.floor(position.x / 32);
    const ty = Math.floor(position.y / 32);
    const dx = target.tx * 32 + 16 - position.x;
    const dy = target.ty * 32 + 16 - position.y;
    if (tx === target.tx && ty === target.ty) return;
    const useHorizontal = Math.abs(dx) >= Math.abs(dy);
    const distance = useHorizontal ? dx : dy;
    const key = useHorizontal
      ? distance < 0
        ? 'ArrowLeft'
        : 'ArrowRight'
      : distance < 0
        ? 'ArrowUp'
        : 'ArrowDown';
    const durationMs = Math.min(400, Math.max(100, (Math.abs(distance) / 192) * 1000 + 30));
    await holdKey(page, key, durationMs);
  }
  const position = await participantPosition(page, displayName);
  throw new Error(
    `Could not move ${displayName} beside the seat; stopped in tile (${Math.floor(position.x / 32)}, ${Math.floor(position.y / 32)}).`,
  );
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
        if (!probe.droppedDelta && message.includes('"world:delta"')) {
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
  inviteEmail?: string,
  isOwner = false,
) {
  const context = await browser.newContext({
    storageState: await client.storageState(),
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto(appOrigin);
  await expect(page.locator(`[data-workspace-id="${workspaceId}"]`)).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator(`[data-workspace-id="${workspaceId}"]`)
    .getByRole('button', { name: 'Open office' })
    .click();
  await expect(page.getByRole('button', { name: 'Open office preview' })).toBeVisible();
  if (inviteEmail) {
    await expect(page.getByRole('heading', { name: 'Employee invitations' })).toBeVisible();
    await page.getByLabel('Employee email').fill(inviteEmail);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(
      page.getByText(`Invitation created for ${inviteEmail}.`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Revoke invitation for ${inviteEmail}` }).click();
    await expect(
      page.getByRole('group', { name: `Confirm revocation for ${inviteEmail}` }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect(
      page.getByText(`Invitation for ${inviteEmail} was revoked.`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
  } else if (!isOwner) {
    await expect(page.getByRole('heading', { name: 'Employee invitations' })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Open office preview' }).click();
  return { context, page };
}

test('live two-browser admission, movement, collision, and seat contention', async ({
  browser,
}) => {
  test.skip(!enabled, 'Set LIVE_OFFICE_E2E=1 to use the owner-authorized local Docker stack.');
  test.setTimeout(180_000);

  const ownerEmail = `cp065-owner-${randomUUID()}@example.test`;
  const memberEmail = `cp065-member-${randomUUID()}@example.test`;
  const revokedInviteEmail = `cp065-revoked-${randomUUID()}@example.test`;
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

    const ownerOffice = await companyPage(browser, owner.client, workspaceId, revokedInviteEmail);
    ownerContext = ownerOffice.context;
    const memberOffice = await companyPage(browser, member.client, workspaceId);
    memberContext = memberOffice.context;
    const ownerPage = ownerOffice.page;
    const memberPage = memberOffice.page;
    const gapProbe = await interceptWorldVersionGap(memberPage);

    await ownerPage.getByRole('button', { name: 'Enter office' }).click();
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Enter office' }).click();
    await expect(ownerPage.getByText('2 people in the office')).toBeVisible();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    await expect(ownerPage.getByRole('list', { name: 'People in the office' })).toContainText(
      `E2E ${memberEmail.split('@')[0]}`,
    );

    const memberCanvas = memberPage.locator('.live-commons-scene canvas');
    await expect(memberCanvas).toHaveCount(1);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const beforeMovement = await memberCanvas.screenshot();
    await ownerPage.locator('.live-commons-scene canvas').click();
    await ownerPage.keyboard.down('ArrowRight');
    await new Promise((resolve) => setTimeout(resolve, 900));
    await ownerPage.keyboard.up('ArrowRight');
    await expect
      .poll(async () => !(await memberCanvas.screenshot()).equals(beforeMovement), {
        timeout: 5000,
      })
      .toBe(true);

    const ownerName = `E2E ${ownerEmail.split('@')[0]}`;
    gapProbe.arm();
    await ownerPage.getByRole('button', { name: 'Busy' }).click();
    await expect.poll(() => gapProbe.state.droppedDelta).toBe(true);
    await expect(memberPage.locator('[data-availability="busy"]')).toHaveCount(0);
    await ownerPage.getByRole('button', { name: 'Away' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Away' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => gapProbe.state.resyncRequested).toBe(true);
    await expect.poll(() => gapProbe.state.snapshotReceived).toBe(true);
    await expect(memberPage.locator('[data-availability="away"]')).toContainText(ownerName);

    gapProbe.interrupt();
    await expect(memberPage.getByText('Office connection closed.')).toBeVisible({
      timeout: 65_000,
    });
    await expect(ownerPage.getByText('1 person in the office')).toBeVisible({ timeout: 65_000 });
    await memberPage.getByRole('button', { name: 'Enter office' }).click();
    await expect(memberPage.getByText('2 people in the office')).toBeVisible();
    await expect(ownerPage.locator('[data-availability="away"]')).toContainText(ownerName);

    const contestedSeat = 'Sit · commons-northwest-table:1';
    await ownerPage.locator('.live-commons-scene canvas').click();
    const memberName = `E2E ${memberEmail.split('@')[0]}`;
    await moveToTile(ownerPage, ownerName, { tx: 4, ty: 5 });
    await moveToTile(ownerPage, ownerName, { tx: 4, ty: 4 });
    await moveToTile(ownerPage, ownerName, { tx: 5, ty: 3 });
    await memberPage.locator('.live-commons-scene canvas').click();
    await moveToTile(memberPage, memberName, { tx: 4, ty: 5 });
    await moveToTile(memberPage, memberName, { tx: 4, ty: 4 });
    await moveToTile(memberPage, memberName, { tx: 6, ty: 2 });
    await expect
      .poll(async () => {
        const position = await participantPosition(ownerPage, ownerName);
        return [Math.floor(position.x / 32), Math.floor(position.y / 32)];
      })
      .toEqual([5, 3]);
    await expect
      .poll(async () => {
        const position = await participantPosition(memberPage, memberName);
        return [Math.floor(position.x / 32), Math.floor(position.y / 32)];
      })
      .toEqual([6, 2]);
    const ownerSeatButton = ownerPage
      .locator('.office-world-controls button')
      .filter({ hasText: 'commons-northwest-table:1' });
    const memberSeatButton = memberPage
      .locator('.office-world-controls button')
      .filter({ hasText: 'commons-northwest-table:1' });
    await expect(ownerSeatButton).toHaveCount(1, { timeout: 5000 });
    await expect(memberSeatButton).toHaveCount(1, { timeout: 5000 });
    const ownerSeatElement = await ownerSeatButton.elementHandle();
    const memberSeatElement = await memberSeatButton.elementHandle();
    expect(ownerSeatElement).not.toBeNull();
    expect(memberSeatElement).not.toBeNull();
    await Promise.all([
      ownerSeatElement!.evaluate((button) => (button as HTMLButtonElement).click()),
      memberSeatElement!.evaluate((button) => (button as HTMLButtonElement).click()),
    ]);
    const ownerStand = ownerPage.getByRole('button', { name: 'Stand up' });
    const memberStand = memberPage.getByRole('button', { name: 'Stand up' });
    await expect
      .poll(async () => (await ownerStand.count()) + (await memberStand.count()), {
        timeout: 5000,
      })
      .toBe(1);
    await expect(ownerPage.getByRole('button', { name: contestedSeat })).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: contestedSeat })).toHaveCount(0);
    const winnerPage = (await ownerStand.count()) === 1 ? ownerPage : memberPage;
    const winnerName = winnerPage === ownerPage ? ownerName : memberName;
    const seatedRosterEntry =
      '.office-live-participants li[data-seat-id="commons-northwest-table:1"]';
    await expect(ownerPage.locator(seatedRosterEntry)).toContainText(winnerName);
    await expect(memberPage.locator(seatedRosterEntry)).toContainText(winnerName);
    await winnerPage.getByRole('button', { name: 'Stand up' }).click();
    await expect(ownerPage.getByRole('button', { name: contestedSeat })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: contestedSeat })).toBeVisible();

    const winnerCanvas = winnerPage.locator('.live-commons-scene canvas');
    // Reach a clear tile just inside the north wall. Moving straight up from (5, 3) crosses
    // the northwest table's seat tile, so route through (6, 3) before checking the wall. The
    // seat button took keyboard focus, so focus the map again before sending movement input.
    await winnerCanvas.click();
    await moveToTile(winnerPage, winnerName, { tx: 6, ty: 3 });
    await moveToTile(winnerPage, winnerName, { tx: 6, ty: 1 });
    const beforeBoundary = await participantPosition(winnerPage, winnerName);
    const boundaryX = Math.floor(beforeBoundary.x / 32);
    const boundaryY = Math.floor(beforeBoundary.y / 32);
    await winnerCanvas.click();
    await holdKey(winnerPage, 'ArrowUp', 800);
    const atWall = await participantPosition(winnerPage, winnerName);
    expect(Math.floor(atWall.x / 32)).toBe(boundaryX);
    expect(Math.floor(atWall.y / 32)).toBe(boundaryY);

    await ownerPage.getByRole('button', { name: 'Leave office' }).click();
    await expect(ownerPage.getByText('Not connected to the office.')).toBeVisible();
    await expect(memberPage.getByText('1 person in the office')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Leave office' }).click();
    await expect(memberPage.getByText('Not connected to the office.')).toBeVisible();

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
      undefined,
      true,
    );
    ownerSecondContext = ownerSecondOffice.context;
    const ownerSecondPage = ownerSecondOffice.page;
    await memberPage.getByRole('button', { name: 'Enter office' }).click();
    await ownerSecondPage.getByRole('button', { name: 'Enter office' }).click();
    await expect(memberPage.getByText('1 person in the office')).toBeVisible();
    await expect(ownerSecondPage.getByText('1 person in the office')).toBeVisible();
    const memberRoster = memberPage.getByRole('list', { name: 'People in the office' });
    const ownerRoster = ownerSecondPage.getByRole('list', { name: 'People in the office' });
    await expect(memberRoster).toContainText(memberName);
    await expect(memberRoster).not.toContainText(ownerName);
    await expect(ownerRoster).toContainText(ownerName);
    await expect(ownerRoster).not.toContainText(memberName);

    await ownerSecondPage.getByRole('button', { name: 'Back to company details' }).click();
    await expect(
      ownerSecondPage.getByRole('button', { name: 'Open office preview' }),
    ).toBeVisible();
    await expect(ownerSecondPage.locator('.live-commons-scene canvas')).toHaveCount(0);
    await ownerSecondPage.getByRole('button', { name: 'Open office preview' }).click();
    await ownerSecondPage.getByRole('button', { name: 'Enter office' }).click();
    await expect(ownerSecondPage.getByText('1 person in the office')).toBeVisible();
    await expect(ownerSecondPage.locator('.live-commons-scene canvas')).toHaveCount(1);
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
