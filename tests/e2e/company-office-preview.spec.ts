import { expect, test } from '@playwright/test';

const account = {
  id: '0d6c9f3e-4a2f-46cc-a66a-5f10d61c72ea',
  email: 'e2e@example.test',
  displayName: 'E2E Person',
  verifiedAt: '2026-11-09T00:00:00.000Z',
};
const workspace = {
  id: '7b839c68-a211-48f2-a38f-d15e7558a4ea',
  name: 'E2E Company',
  slug: 'e2e-company',
  role: 'member',
  memberCount: 2,
};
const officeId = 'df92b3ad-d3e9-430d-82f5-6e91cbe9dfe2';
const participationId = '8f34d8de-bddb-489d-9cde-f03f1a98b68e';
const officeEpoch = '668bde07-cc48-4623-a58c-2efbc8ac21d5';
const mapVersion = 'commons-v1-d980be0345e864c38446a3f4effeaf12534e4ae68c10926e3c190d69c1958364';
const officeManifest = {
  formatVersion: 1,
  mapId: 'commons',
  mapVersion,
  contentHash: 'd980be0345e864c38446a3f4effeaf12534e4ae68c10926e3c190d69c1958364',
  coordinateUnits: 'pixels',
  tileSize: 32,
  bounds: { width: 768, height: 512 },
  spawn: { x: 368, y: 272 },
  geometryPath: `/maps/${mapVersion}.json`,
  assetManifestVersion:
    'commons-art-v1-c8b015529d31999841c00e9b5962f226f694467b811540d5eb9c01740951770f',
};
const sessionStart = Date.now();
const session = {
  id: 'f53b45ad-403c-4e68-82a4-f631313bc94b',
  current: true,
  createdAt: new Date(sessionStart - 60_000).toISOString(),
  absoluteExpiresAt: new Date(sessionStart + 2 * 60 * 60_000).toISOString(),
  idleExpiresAt: new Date(sessionStart + 60 * 60_000).toISOString(),
};
const requestId = 'dbe6efea-048d-4b34-9111-d43880daf189';

test('mocked-API UI E2E: sign in, open the company preview, and return cleanly', async ({
  page,
}) => {
  let authenticated = false;
  const unexpectedApiCalls: string[] = [];
  const officeEvents: string[] = [];
  const movementInputs: Array<{ dx: number; dy: number }> = [];
  let officeBootstrapRequests = 0;
  let officeTicketRequests = 0;
  let officeConnections = 0;
  let interruptOfficeConnection: (() => Promise<void>) | undefined;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (method === 'GET' && path === '/api/auth/csrf') return json({ csrfToken: 'A'.repeat(43) });
    if (method === 'GET' && path === '/api/auth/me')
      return authenticated
        ? json({ account })
        : json({ error: { code: 'unauthorized', message: 'unauthorized', requestId } }, 401);
    if (method === 'POST' && path === '/api/auth/login') {
      authenticated = true;
      return json({ account, csrfToken: 'B'.repeat(43) });
    }
    if (method === 'GET' && path === '/api/auth/sessions')
      return authenticated ? json({ sessions: [session] }) : json({}, 401);
    if (method === 'GET' && path === '/api/workspaces')
      return authenticated ? json({ workspaces: [workspace] }) : json({}, 401);
    if (method === 'GET' && path === `/api/workspaces/${workspace.id}`)
      return authenticated ? json({ workspace: { ...workspace, officeId } }) : json({}, 401);
    if (method === 'GET' && path === `/api/workspaces/${workspace.id}/offices/${officeId}`) {
      officeBootstrapRequests += 1;
      return json({
        officeId,
        workspaceId: workspace.id,
        mapVersion,
        protocolVersion: 1,
        manifest: officeManifest,
      });
    }
    if (
      method === 'POST' &&
      path === `/api/workspaces/${workspace.id}/offices/${officeId}/join-ticket`
    ) {
      officeTicketRequests += 1;
      return json(
        { ticket: 'T'.repeat(43), expiresAt: new Date(Date.now() + 20_000).toISOString() },
        201,
      );
    }

    unexpectedApiCalls.push(`${method} ${path}`);
    return json({ error: { code: 'not_found', message: 'not_found', requestId } }, 404);
  });

  await page.routeWebSocket(/\/socket\.io\//, (socket) => {
    officeConnections += 1;
    if (officeConnections === 1)
      interruptOfficeConnection = () =>
        socket.close({ code: 1011, reason: 'simulated office transport interruption' });
    socket.onClose(() => officeEvents.push('disconnect'));
    socket.send(
      '0{"sid":"e2e-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":100000}',
    );
    let stateVersion = 0;
    let availability = 'available';
    let sittingAt: string | null = null;
    const seatIds = [
      'commons-northwest-table:0',
      'commons-northwest-table:1',
      'commons-southeast-table:0',
      'commons-southeast-table:1',
    ];
    const emitWorldDelta = () => {
      const firstSeat = sittingAt === seatIds[0];
      socket.send(
        `42/office,["world:delta",${JSON.stringify({
          officeEpoch,
          baseVersion: stateVersion,
          stateVersion: ++stateVersion,
          serverTime: Date.now(),
          participants: [
            {
              participationId,
              displayName: account.displayName,
              appearance: { bodyId: 'commons-worker', paletteId: 'teal' },
              position: firstSeat ? { x: 80, y: 80 } : { x: 368, y: 272 },
              facing: 'south',
              availability,
              seatId: sittingAt,
              lastProcessedInputSequence: 0,
            },
          ],
          removedParticipationIds: [],
          seats: seatIds.map((seatId) => ({
            seatId,
            occupantParticipationId: seatId === sittingAt ? participationId : null,
          })),
        })}]`,
      );
    };
    socket.onMessage((message) => {
      if (typeof message !== 'string') return;
      if (message.startsWith('40/office,')) {
        officeEvents.push('connect');
        socket.send('40/office,{"sid":"e2e-office"}');
        socket.send(
          `42/office,["office:ready",${JSON.stringify({
            participationId,
            workspaceId: workspace.id,
            officeId,
            mapVersion,
            protocolVersion: 1,
            snapshot: {
              officeEpoch,
              stateVersion: 0,
              serverTime: Date.now(),
              participants: [
                {
                  participationId,
                  displayName: account.displayName,
                  appearance: { bodyId: 'commons-worker', paletteId: 'teal' },
                  position: { x: 368, y: 272 },
                  facing: 'south',
                  availability: 'available',
                  seatId: null,
                  lastProcessedInputSequence: 0,
                },
              ],
              seats: seatIds.map((seatId) => ({ seatId, occupantParticipationId: null })),
            },
          })}]`,
        );
        return;
      }
      if (message.startsWith('42/office,')) {
        try {
          const packetStart = message.indexOf('[');
          const ackId = message.slice('42/office,'.length, packetStart);
          const packet = JSON.parse(message.slice(packetStart)) as [
            string,
            {
              eventId?: string;
              payload?: { availability?: string; seatId?: string; dx?: number; dy?: number };
            },
          ];
          officeEvents.push(packet[0]);
          if (
            packet[0] === 'world:input' &&
            packet[1].payload?.dx !== undefined &&
            packet[1].payload.dy !== undefined
          ) {
            movementInputs.push({ dx: packet[1].payload.dx, dy: packet[1].payload.dy });
          }
          if (ackId) {
            socket.send(
              `43/office,${ackId}[${JSON.stringify({ eventId: packet[1].eventId, ok: true })}]`,
            );
          }
          if (packet[0] === 'presence:update' && packet[1].payload?.availability) {
            availability = packet[1].payload.availability;
            emitWorldDelta();
          } else if (packet[0] === 'seat:sit' && packet[1].payload?.seatId) {
            sittingAt = packet[1].payload.seatId;
            emitWorldDelta();
          } else if (packet[0] === 'seat:stand') {
            sittingAt = null;
            emitWorldDelta();
          }
        } catch {
          officeEvents.push('invalid-packet');
        }
      }
    });
  });

  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill('a long e2e-only password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('E2E Company', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open office' }).click();
  await expect(page.getByRole('heading', { name: 'Company details' })).toBeVisible();
  await expect(
    page.getByRole('definition').filter({ hasText: 'gather/e2e-company' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Open office preview' }).click();
  await expect(page.getByText('Not connected to the office.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter office' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Text chat is unavailable' })).toBeVisible();
  await expect(page.getByLabel('Message office-preview')).toBeDisabled();
  await expect(page.locator('.commons-scene canvas')).toHaveCount(1);
  await expect(page.getByText('Avatar standing.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sit' })).toBeEnabled();
  await page.getByRole('button', { name: 'Sit' }).click();
  await expect(page.getByText('Avatar sitting.')).toBeVisible();

  await page.getByRole('button', { name: 'Enter office' }).click();
  await expect(page.getByText('1 person in the office')).toBeVisible();
  await expect(page.getByText('Live office map. Use arrow keys or WASD to move.')).toBeVisible();
  await expect(page.locator('.live-commons-scene canvas')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Office connection controls' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Office controls' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Your availability' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Seats' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'People in the office' })).toContainText(
    account.displayName,
  );
  await page
    .getByRole('group', { name: 'Live Commons office map with server-positioned participants' })
    .focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Busy' })).toBeFocused();
  const busyFocusStyle = await page
    .getByRole('button', { name: 'Busy' })
    .evaluate((button) => getComputedStyle(button).outlineStyle);
  expect(busyFocusStyle).toBe('solid');
  await page.getByRole('button', { name: 'Busy' }).click();
  await expect(page.getByRole('button', { name: 'Busy' })).toHaveAttribute('aria-pressed', 'true');
  expect(interruptOfficeConnection).toBeDefined();
  await interruptOfficeConnection!();
  await expect(page.getByText('Office connection closed.')).toBeVisible();
  await expect(page.locator('.live-commons-scene canvas')).toHaveCount(0);
  await expect.poll(() => officeEvents.filter((event) => event === 'disconnect').length).toBe(1);
  await page.getByRole('button', { name: 'Enter office' }).click();
  await expect(page.getByText('1 person in the office')).toBeVisible();
  await expect(page.locator('.live-commons-scene canvas')).toHaveCount(1);
  expect(officeBootstrapRequests).toBe(2);
  expect(officeTicketRequests).toBe(2);
  expect(officeConnections).toBe(2);
  await page.getByRole('button', { name: 'Sit · commons-northwest-table:0' }).click();
  await expect(page.getByRole('button', { name: 'Stand up' })).toBeVisible();
  await page.getByRole('button', { name: 'Stand up' }).click();
  await expect(page.getByRole('button', { name: 'Sit · commons-northwest-table:0' })).toBeVisible();
  const map = page.getByRole('group', {
    name: 'Live Commons office map with server-positioned participants',
  });
  await map.focus();
  await expect(map).toBeFocused();
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => officeEvents.includes('world:input')).toBe(true);
  await page.keyboard.up('ArrowRight');
  await expect.poll(() => movementInputs.at(-1)).toEqual({ dx: 0, dy: 0 });
  await page.getByRole('button', { name: 'Busy' }).focus();
  const inputsBeforeControlKey = movementInputs.length;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  expect(movementInputs).toHaveLength(inputsBeforeControlKey);
  await page.getByRole('button', { name: 'Leave office' }).click();
  await expect(page.getByText('Not connected to the office.')).toBeVisible();
  await expect.poll(() => officeEvents.filter((event) => event === 'disconnect').length).toBe(2);

  await page.getByRole('button', { name: 'Back to company details' }).click();
  await expect(page.getByRole('heading', { name: 'Company details' })).toBeVisible();
  await expect(page.locator('.commons-scene canvas')).toHaveCount(0);
  expect(unexpectedApiCalls).toEqual([]);
  expect(officeEvents).toContain('connect');
  expect(officeEvents).toContain('presence:update');
  expect(officeEvents).toContain('seat:sit');
  expect(officeEvents).toContain('seat:stand');
  expect(officeEvents).toContain('world:input');
});
