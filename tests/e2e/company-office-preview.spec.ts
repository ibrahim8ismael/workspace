import type { SpaceMessage } from '@gather/contracts';
import { expect, test } from '@playwright/test';
import { OFFICE_PROTOCOL_VERSION } from '../../packages/contracts/dist/versions.js';

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
  role: 'owner',
  memberCount: 2,
};
const officeId = 'df92b3ad-d3e9-430d-82f5-6e91cbe9dfe2';
const participationId = '8f34d8de-bddb-489d-9cde-f03f1a98b68e';
const teammateParticipationId = '41bbf5d6-37d7-4468-9892-9776ff19e008';
const proximityConversationId = 'd65d5a55-c917-448b-a203-1a226bc76319';
const proximityGeneration = 'a371c42a-aa7d-4082-ad22-74e1816af053';
const officeEpoch = '668bde07-cc48-4623-a58c-2efbc8ac21d5';
const mapVersion = 'vivo-v1-0208da25a5cdc4cbb4036ae04a5bb8796962752a3d84de24961ebc15d8038e7b';
const officeManifest = {
  formatVersion: 1,
  mapId: 'vivo',
  mapVersion,
  contentHash: '0208da25a5cdc4cbb4036ae04a5bb8796962752a3d84de24961ebc15d8038e7b',
  coordinateUnits: 'pixels',
  tileSize: 32,
  bounds: { width: 1664, height: 1600 },
  spawn: { x: 656, y: 1264 },
  geometryPath: `/maps/${mapVersion}.json`,
  assetManifestVersion:
    'vivo-art-v1-cfbbea6919ccb8327b9ea370f2a5bf911d7bc76c328b51789da04d932bb417fb',
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
  test.setTimeout(90_000);
  // This test mocks signaling; supply a silent synthetic capture track without device access.
  await page.addInitScript(() => {
    const captures: MediaStream[] = [];
    Object.assign(window, { __entryCaptures: captures });
    let resolveCapture: (() => void) | undefined;
    const microphoneTest = {
      holdNext: false,
      denyNext: false,
      requests: 0,
      release: () => resolveCapture?.(),
    };
    Object.assign(window, { __microphoneTest: microphoneTest });
    navigator.mediaDevices.getUserMedia = async () => {
      microphoneTest.requests += 1;
      if (microphoneTest.denyNext) {
        microphoneTest.denyNext = false;
        throw new DOMException('Denied', 'NotAllowedError');
      }
      if (microphoneTest.holdNext) {
        microphoneTest.holdNext = false;
        await new Promise<void>((resolve) => {
          resolveCapture = resolve;
        });
      }
      const context = new AudioContext();
      const stream = context.createMediaStreamDestination().stream;
      captures.push(stream);
      return stream;
    };
  });
  let authenticated = false;
  const invitation = {
    id: '16ab92cd-cbd4-44b6-b827-196ae6044937',
    email: 'coworker@example.test',
    expiresAt: '2026-11-16T12:00:00.000Z',
  };
  let invitationStatus: 'pending' | 'revoked' | null = null;
  const unexpectedApiCalls: string[] = [];
  const officeEvents: string[] = [];
  const movementInputs: Array<{ dx: number; dy: number }> = [];
  const sentOfficeMessages: Array<{ clientMessageId: string; text: string }> = [];
  const mediaTokenRequests: Array<{ participationId: string; conversationVersion: number }> = [];
  let liveKitSocketAttempts = 0;
  let holdPair = true;
  let failNextOfficeMessage = true;
  const officeHistory = [
    {
      id: 'c8f3e6ec-0fc0-47f0-9270-a05ad980c5a7',
      senderId: '41bbf5d6-37d7-4468-9892-9776ff19e008',
      senderName: 'Office Teammate',
      text: 'Welcome to the team chat',
      createdAt: '2026-11-10T17:00:00.000Z',
    },
  ];
  let finishDirectSend: (() => void) | undefined;
  const scopedHistory: Record<string, SpaceMessage[]> = {};
  let officeBootstrapRequests = 0;
  let officeTicketRequests = 0;
  let officeConnections = 0;
  let officeServerSocket: import('@playwright/test').WebSocketRoute | undefined;
  let holdNextMediaSocket = false;
  let heldLiveKitSocketClosed = false;
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

    if (path === `/api/workspaces/${workspace.id}/invitations`) {
      if (method === 'GET')
        return json({
          invitations: invitationStatus ? [{ ...invitation, status: invitationStatus }] : [],
        });
      if (method === 'POST') {
        expect(request.postDataJSON()).toEqual({ email: invitation.email });
        expect(request.headers()['idempotency-key']).toBeTruthy();
        invitationStatus = 'pending';
        return json({ invitation }, 201);
      }
    }
    if (
      method === 'DELETE' &&
      path === `/api/workspaces/${workspace.id}/invitations/${invitation.id}`
    ) {
      expect(request.headers()['idempotency-key']).toBeTruthy();
      invitationStatus = 'revoked';
      return json({ message: 'Invitation revoked.' });
    }

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
    if (method === 'GET' && path === `/api/workspaces/${workspace.id}/members`)
      return json({
        members: [
          {
            userId: account.id,
            displayName: account.displayName,
            role: 'owner',
            joinedAt: '2026-11-09T00:00:00.000Z',
          },
          {
            userId: '41bbf5d6-37d7-4468-9892-9776ff19e008',
            displayName: 'Office Teammate',
            role: 'member',
            joinedAt: '2026-11-09T00:00:00.000Z',
          },
        ],
      });
    if (
      method === 'GET' &&
      path === `/api/workspaces/${workspace.id}/offices/${officeId}/channels/general/messages`
    )
      return json({
        messages: officeHistory.map((message) => ({
          ...message,
          scope: { kind: 'channel', id: 'general' },
        })),
      });
    if (
      method === 'POST' &&
      path === `/api/workspaces/${workspace.id}/offices/${officeId}/channels/general/messages`
    ) {
      const body = request.postDataJSON() as { clientMessageId: string; text: string };
      sentOfficeMessages.push(body);
      if (failNextOfficeMessage) {
        failNextOfficeMessage = false;
        return json(
          {
            error: {
              code: 'temporarily_unavailable',
              message: 'temporarily_unavailable',
              requestId,
            },
          },
          503,
        );
      }
      return json({
        message: {
          id: 'd43b20e4-940d-4f56-bd60-b18d6f9fa3dd',
          senderId: account.id,
          senderName: account.displayName,
          text: body.text,
          scope: { kind: 'channel', id: 'general' },
          createdAt: '2026-11-10T17:01:00.000Z',
        },
      });
    }
    if (path.endsWith('/channels/social/messages') || path.includes('/direct-messages/')) {
      if (method === 'GET') return json({ messages: scopedHistory[path] ?? [] });
      const body = request.postDataJSON() as { clientMessageId: string; text: string };
      if (body.text === 'Slow private send')
        await new Promise<void>((resolve) => {
          finishDirectSend = resolve;
        });
      const message: SpaceMessage = {
        id: crypto.randomUUID(),
        senderId: account.id,
        senderName: account.displayName,
        text: body.text,
        createdAt: new Date().toISOString(),
        scope: path.includes('/direct-messages/')
          ? {
              kind: 'dm',
              userIds: [account.id, '41bbf5d6-37d7-4468-9892-9776ff19e008'].sort() as [
                string,
                string,
              ],
            }
          : { kind: 'channel', id: 'social' },
      };
      scopedHistory[path] = [...(scopedHistory[path] ?? []), message];
      return json({ message }, 201);
    }
    if (method === 'POST' && path === `/api/conversations/${proximityConversationId}/media-token`) {
      const body = request.postDataJSON() as {
        participationId: string;
        conversationVersion: number;
      };
      mediaTokenRequests.push(body);
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'e2e-test',
          sub: participationId,
          name: account.displayName,
          exp: Math.floor(Date.now() / 1000) + 60,
          video: {
            room: proximityGeneration,
            roomJoin: true,
            canPublish: true,
            canPublishSources: ['microphone'],
            canSubscribe: true,
            canPublishData: false,
          },
        }),
      ).toString('base64url');
      return json({
        serverUrl: 'wss://media.example.test',
        token: `${header}.${payload}.e2e-test-signature`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        conversationVersion: body.conversationVersion,
        generation: proximityGeneration,
      });
    }
    if (method === 'GET' && path === `/api/workspaces/${workspace.id}/offices/${officeId}`) {
      officeBootstrapRequests += 1;
      return json({
        officeId,
        workspaceId: workspace.id,
        mapVersion,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
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
    officeServerSocket = socket;
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
    let position = { x: 656, y: 1264 };
    const seatIds = ['24c48737:0', '52e00cff:0', 'd8fe8680:0', '88544309:0'];
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
              position: firstSeat ? { x: 624, y: 1168 } : position,
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
            protocolVersion: OFFICE_PROTOCOL_VERSION,
            snapshot: {
              officeEpoch,
              stateVersion: 0,
              serverTime: Date.now(),
              participants: [
                {
                  participationId,
                  displayName: account.displayName,
                  appearance: { bodyId: 'commons-worker', paletteId: 'teal' },
                  position: officeManifest.spawn,
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
              payload?: {
                availability?: string;
                seatId?: string;
                dx?: number;
                dy?: number;
                enabled?: boolean;
              };
            },
          ];
          officeEvents.push(packet[0]);
          if (
            packet[0] === 'world:input' &&
            packet[1].payload?.dx !== undefined &&
            packet[1].payload.dy !== undefined
          ) {
            movementInputs.push({ dx: packet[1].payload.dx, dy: packet[1].payload.dy });
            const { dx, dy } = packet[1].payload;
            if (dx !== 0 || dy !== 0) {
              const scale = 19.2 / Math.hypot(dx, dy);
              position = { x: position.x + dx * scale, y: position.y + dy * scale };
              emitWorldDelta();
            }
          }
          if (ackId) {
            socket.send(
              `43/office,${ackId}[${JSON.stringify({ eventId: packet[1].eventId, ok: true })}]`,
            );
          }
          if (packet[0] === 'presence:update' && packet[1].payload?.availability) {
            availability = packet[1].payload.availability;
            emitWorldDelta();
          } else if (
            packet[0] === 'proximity:set-opt-in' &&
            packet[1].payload?.enabled &&
            !holdPair
          ) {
            const participants = [
              { participationId, displayName: account.displayName },
              { participationId: teammateParticipationId, displayName: 'Office Teammate' },
            ];
            socket.send(
              `42/office,["conversation:update",${JSON.stringify({
                officeEpoch,
                conversationId: proximityConversationId,
                kind: 'proximity',
                state: 'joining',
                version: 1,
                generation: proximityGeneration,
                mediaReady: false,
                participants,
              })}]`,
            );
            socket.send(
              `42/office,["conversation:update",${JSON.stringify({
                officeEpoch,
                conversationId: proximityConversationId,
                kind: 'proximity',
                state: 'active',
                version: 2,
                generation: proximityGeneration,
                mediaReady: true,
                participants,
              })}]`,
            );
          } else if (
            packet[0] === 'proximity:set-opt-in' &&
            !packet[1].payload?.enabled &&
            !holdPair
          ) {
            socket.send(
              `42/office,["conversation:update",${JSON.stringify({
                officeEpoch,
                conversationId: proximityConversationId,
                kind: 'proximity',
                state: 'ended',
                version: 3,
                generation: proximityGeneration,
                mediaReady: false,
                participants: [],
              })}]`,
            );
          } else if (packet[0] === 'conversation:leave') {
            socket.send(
              `42/office,["conversation:update",${JSON.stringify({
                officeEpoch,
                conversationId: proximityConversationId,
                kind: 'proximity',
                state: 'ended',
                version: 3,
                generation: proximityGeneration,
                mediaReady: false,
                participants: [],
              })}]`,
            );
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

  await page.routeWebSocket('wss://media.example.test/**', (socket) => {
    liveKitSocketAttempts += 1;
    if (holdNextMediaSocket) {
      holdNextMediaSocket = false;
      socket.onClose(() => {
        heldLiveKitSocketClosed = true;
      });
      return;
    }
    socket.close({ code: 1001, reason: 'mock media service unavailable' });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeFocused();
  const accountSkipLink = page.getByRole('link', { name: 'Skip to main content' });
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Open Office home' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(accountSkipLink).toBeFocused();
  await expect(accountSkipLink).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill('a long e2e-only password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('E2E Company', { exact: true })).toBeVisible();
  await expect(page.getByText('SIGN-IN STATUS', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Account security' }).click();
  await expect(page.getByRole('heading', { name: 'Account security' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Signed-in sessions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify password' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to companies' }).click();
  await expect(page.getByText('E2E Company', { exact: true })).toBeVisible();
  await expect(page.getByText('SIGN-IN STATUS', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Open office', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company details' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Employee invitations' })).toHaveCount(0);
  await expect(page.getByText('SIGN-IN STATUS', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Welcome to E2E Company' })).toBeVisible();
  await expect(page.getByText('Your camera is off')).toHaveCount(0);
  await expect(page.locator('.office-prejoin-camera')).toHaveCount(0);
  const entryMicrophone = page.getByRole('button', { name: 'Turn microphone on', exact: true });
  await expect(entryMicrophone).toHaveAttribute('aria-pressed', 'false');
  await entryMicrophone.click();
  await expect(
    page.getByRole('button', { name: 'Turn microphone off', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Turn microphone off', exact: true }).click();
  await expect(entryMicrophone).toHaveAttribute('aria-pressed', 'false');
  expect(
    await page.evaluate(() =>
      (window as unknown as { __entryCaptures: MediaStream[] }).__entryCaptures.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'),
      ),
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath('office-entry.png') });
  await expect(page.getByRole('textbox', { name: 'Display name' })).toHaveValue('E2E Person');
  await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
  await expect(page.locator('.office-scene, .office-map-heading')).toHaveCount(0);
  expect(officeBootstrapRequests).toBe(0);
  await expect(page).toHaveURL(`/companies/${workspace.id}/offices/${officeId}/entry`);

  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('1 person in the office')).toBeVisible();
  await expect(page).toHaveURL(`/companies/${workspace.id}/offices/${officeId}`);
  await expect(page.getByText('Live Vivo office', { exact: true })).toBeVisible();
  await expect(page.locator('.office-scene .office-map')).toHaveCount(1);
  await expect.poll(() => officeBootstrapRequests).toBe(1);
  await expect(page.getByRole('group', { name: 'Office connection controls' })).toBeVisible();
  await page.getByRole('link', { name: 'Invite people', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Employee invitations' })).toBeVisible();
  await expect(page.getByText('No invitations have been created for this company.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Employee email' }).fill(invitation.email);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `Invitation created for ${invitation.email}.` }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Company invitations' })).toContainText(
    invitation.email,
  );
  await page.getByRole('button', { name: `Revoke invitation for ${invitation.email}` }).click();
  await page.getByRole('button', { name: 'Confirm revoke' }).click();
  await expect(page.getByRole('list', { name: 'Company invitations' })).toContainText('Revoked');
  await page.getByRole('link', { name: 'Return to office', exact: true }).click();
  await expect(page.getByText('1 person in the office')).toBeVisible();
  expect(officeConnections).toBe(1);
  const officeSkipLink = page.getByRole('link', { name: 'Skip to office map' });
  await officeSkipLink.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#office-map')).toBeFocused();
  await expect(page.getByRole('group', { name: 'Office controls' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Your availability' })).toBeVisible();
  const microphoneButton = page.getByRole('button', { name: 'Activate proximity microphone' });
  await expect(microphoneButton).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Enable nearby voice', exact: true })).toHaveCount(
    0,
  );
  await expect.poll(() => liveKitSocketAttempts).toBe(0);
  // A microphone click requests browser access even while pairing is held and no token exists.
  const captureRequestsBeforePermission = await page.evaluate(() => {
    const controls = (
      window as Window & {
        __microphoneTest: { holdNext: boolean; requests: number };
      }
    ).__microphoneTest;
    controls.holdNext = true;
    return controls.requests;
  });
  await microphoneButton.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __microphoneTest: { requests: number } }).__microphoneTest.requests,
      ),
    )
    .toBe(captureRequestsBeforePermission + 1);
  await expect(page.locator('#office-microphone-help')).toContainText(
    'Waiting for browser microphone access',
  );
  expect(mediaTokenRequests).toHaveLength(0);
  expect(liveKitSocketAttempts).toBe(0);
  await expect(page.locator('#office-microphone-help')).toContainText('check site permissions', {
    timeout: 7000,
  });
  await page.getByRole('button', { name: 'Cancel microphone access', exact: true }).click();
  const capturesBeforeLateGrant = await page.evaluate(() => {
    const count = (window as Window & { __entryCaptures: MediaStream[] }).__entryCaptures.length;
    (window as Window & { __microphoneTest: { release: () => void } }).__microphoneTest.release();
    return count;
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __entryCaptures: MediaStream[] }).__entryCaptures.length,
      ),
    )
    .toBe(capturesBeforeLateGrant + 1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & { __entryCaptures: MediaStream[] }).__entryCaptures.every((stream) =>
          stream.getTracks().every((track) => track.readyState === 'ended'),
        ),
      ),
    )
    .toBe(true);
  await expect(microphoneButton).toHaveAttribute('aria-pressed', 'false');
  expect(mediaTokenRequests).toHaveLength(0);
  expect(liveKitSocketAttempts).toBe(0);
  // Denial is actionable, does not opt in or authorize media, and permits a fresh retry.
  await page.evaluate(() => {
    (window as Window & { __microphoneTest: { denyNext: boolean } }).__microphoneTest.denyNext =
      true;
  });
  await microphoneButton.click();
  await expect(page.locator('#office-microphone-help')).toContainText(
    'Microphone access was denied',
  );
  expect(mediaTokenRequests).toHaveLength(0);
  expect(liveKitSocketAttempts).toBe(0);
  // After consent, the probe is stopped while waiting for a coworker; a second click cancels voice.
  await microphoneButton.click();
  const enabledMicrophone = page.getByRole('button', { name: 'Mute proximity microphone' });
  await expect(enabledMicrophone).toHaveAttribute('aria-pressed', 'true');
  await expect(enabledMicrophone.locator('svg')).toHaveClass(/lucide-mic/);
  await expect(page.locator('#office-microphone-help')).toContainText(
    'no microphone audio is being captured',
  );
  expect(
    await page.evaluate(() =>
      (window as Window & { __entryCaptures: MediaStream[] }).__entryCaptures.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'),
      ),
    ),
  ).toBe(true);
  expect(mediaTokenRequests).toHaveLength(0);
  await enabledMicrophone.click();
  await expect(microphoneButton).toHaveAttribute('aria-pressed', 'false');
  expect(mediaTokenRequests).toHaveLength(0);
  holdPair = false;
  // The same icon now enables voice and starts signaling once a ready pair arrives.
  await microphoneButton.click();
  await expect
    .poll(() => mediaTokenRequests)
    .toEqual([{ participationId, conversationVersion: 2 }]);
  await expect.poll(() => liveKitSocketAttempts).toBeGreaterThan(0);
  await expect(page.getByRole('alert')).toContainText('Proximity audio disconnected');
  const mapAfterMediaError = page.locator('.office-scene svg.office-map');
  await expect(mapAfterMediaError).toHaveCount(1);
  const movementCountAfterMediaError = movementInputs.length;
  await mapAfterMediaError.focus();
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => movementInputs.length).toBeGreaterThan(movementCountAfterMediaError);
  await page.keyboard.up('ArrowRight');
  await expect(mapAfterMediaError).toHaveCount(1);
  await page.getByRole('button', { name: 'Leave conversation' }).click();
  await expect.poll(() => officeEvents.includes('conversation:leave')).toBe(true);
  await expect(page.getByRole('button', { name: 'Leave conversation' })).toHaveCount(0);
  await expect(microphoneButton).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(mapAfterMediaError).toHaveCount(1);
  const movementCountAfterConversationLeave = movementInputs.length;
  await mapAfterMediaError.focus();
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(() => movementInputs.length)
    .toBeGreaterThan(movementCountAfterConversationLeave);
  await page.keyboard.up('ArrowRight');
  await page.getByRole('button', { name: 'Opt out of nearby voice' }).click();
  await expect(
    page.getByText('Nearby voice is off. Your microphone will stay off until you turn it on.'),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Seats' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'People in the office' })).toContainText(
    account.displayName,
  );
  await page.getByRole('link', { name: 'Messages' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to #General' })).toBeVisible();
  await expect(page.getByText('Welcome to the team chat')).toBeVisible();
  await expect(page.getByText('Office Teammate').first()).toBeVisible();
  const officeMessageBox = page.getByRole('textbox', { name: 'Message General' });
  await officeMessageBox.fill('A message that should survive a retry');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.chat-view-status')).toContainText('could not be sent');
  await expect(officeMessageBox).toHaveValue('A message that should survive a retry');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('A message that should survive a retry')).toBeVisible();
  expect(sentOfficeMessages).toHaveLength(2);
  expect(sentOfficeMessages[0]?.text).toBe(sentOfficeMessages[1]?.text);
  expect(sentOfficeMessages[0]?.clientMessageId).toBe(sentOfficeMessages[1]?.clientMessageId);
  await expect(officeMessageBox).toHaveValue('');
  await officeMessageBox.fill('General draft stays here');
  await page.getByRole('button', { name: 'Social', exact: true }).click();
  const socialBox = page.getByRole('textbox', { name: 'Message Social' });
  await expect(socialBox).toHaveValue('');
  await expect(page.getByText('Welcome to the team chat')).toHaveCount(0);
  await socialBox.fill('Social channel message');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Social channel message', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Office Teammate', exact: true }).click();
  const directBox = page.getByRole('textbox', { name: 'Message Office Teammate' });
  await expect(directBox).toBeEnabled();
  await expect(page.getByText('Social channel message', { exact: true })).toHaveCount(0);
  await directBox.fill('Private message to my teammate');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Private message to my teammate', { exact: true })).toBeVisible();
  officeServerSocket?.send(
    `42/office,["space:message",${JSON.stringify({
      id: '92b2c7c6-e6cd-45e1-8e2d-b6b5f7b7dcb1',
      senderId: teammateParticipationId,
      senderName: 'Office Teammate',
      text: 'Realtime private reply',
      createdAt: new Date().toISOString(),
      scope: { kind: 'dm', userIds: [account.id, teammateParticipationId].sort() },
    })}]`,
  );
  await expect(page.getByText('Realtime private reply')).toBeVisible();
  await directBox.fill('Slow private send');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect.poll(() => Boolean(finishDirectSend)).toBe(true);
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(officeMessageBox).toHaveValue('General draft stays here');
  await officeMessageBox.fill('General draft edited during a private send');
  finishDirectSend!();
  await expect
    .poll(() =>
      Object.values(scopedHistory)
        .flat()
        .some((message) => message.text === 'Slow private send'),
    )
    .toBe(true);
  await expect(officeMessageBox).toHaveValue('General draft edited during a private send');
  await expect(page.getByText('Private message to my teammate', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Realtime private reply')).toHaveCount(0);
  await page.getByRole('button', { name: 'Social', exact: true }).click();
  await expect(page.getByText('Social channel message', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Office Teammate', exact: true }).click();
  await expect(page.getByText('Private message to my teammate', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await page.getByRole('link', { name: 'Office', exact: true }).click();
  await expect(page.locator('.office-scene .office-map')).toHaveCount(1);
  await page.getByRole('link', { name: 'Back to companies' }).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Busy', exact: true })).toBeFocused();
  const busyFocusStyle = await page
    .getByRole('button', { name: 'Busy', exact: true })
    .evaluate((button) => getComputedStyle(button).outlineStyle);
  expect(busyFocusStyle).toBe('solid');
  await page.getByRole('button', { name: 'Busy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Busy', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  officeHistory.push({
    id: '7db151ba-fbf2-42a3-ad73-59bdad580f0e',
    senderId: '41bbf5d6-37d7-4468-9892-9776ff19e008',
    senderName: 'Office Teammate',
    text: 'This arrived during the reconnect',
    createdAt: '2026-11-10T17:02:00.000Z',
  });
  expect(interruptOfficeConnection).toBeDefined();
  await interruptOfficeConnection!();
  await expect(page.getByText('Office connection closed.')).toBeVisible();
  await expect(page.locator('.office-scene .office-map')).toHaveCount(0);
  await expect.poll(() => officeEvents.filter((event) => event === 'disconnect').length).toBe(1);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('1 person in the office')).toBeVisible();
  await expect(page.locator('.office-scene .office-map')).toHaveCount(1);
  await page.getByRole('link', { name: 'Messages' }).click();
  await expect(page.getByText('This arrived during the reconnect')).toBeVisible();
  await page.getByRole('link', { name: 'Office', exact: true }).click();
  expect(officeBootstrapRequests).toBe(2);
  expect(officeTicketRequests).toBe(2);
  expect(officeConnections).toBe(2);
  const seatTarget = page.locator('.office-scene [data-seat-id="24c48737:0"]');
  const movementCountBeforeSeat = movementInputs.length;
  await seatTarget.click();
  await expect
    .poll(() =>
      movementInputs.slice(movementCountBeforeSeat).some(({ dx, dy }) => dx !== 0 || dy !== 0),
    )
    .toBe(true);
  await expect.poll(() => officeEvents.includes('seat:sit')).toBe(true);
  await expect.poll(() => seatTarget.getAttribute('aria-label')).toContain('Stand up');
  await seatTarget.click();
  await expect.poll(() => officeEvents.filter((event) => event === 'seat:stand').length).toBe(1);
  const map = page.locator('.office-scene svg.office-map');
  await map.focus();
  await expect(map).toBeFocused();
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => officeEvents.includes('world:input')).toBe(true);
  await page.keyboard.up('ArrowRight');
  await expect.poll(() => movementInputs.at(-1)).toEqual({ dx: 0, dy: 0 });
  await page.getByRole('button', { name: 'Away', exact: true }).focus();
  const inputsBeforeControlKey = movementInputs.length;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  expect(
    movementInputs.slice(inputsBeforeControlKey).every(({ dx, dy }) => dx === 0 && dy === 0),
  ).toBe(true);

  holdNextMediaSocket = true;
  await page.getByRole('button', { name: 'Opt in to nearby voice' }).click();
  await expect(
    page.getByText(
      'In a 2-person conversation with Office Teammate. Turn on your microphone when ready.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Activate proximity microphone' }).click();
  await expect.poll(() => mediaTokenRequests).toHaveLength(2);
  await expect.poll(() => liveKitSocketAttempts).toBe(2);
  await expect.poll(() => heldLiveKitSocketClosed).toBe(false);
  await expect(
    page.getByRole('button', { name: 'Cancel microphone setup', exact: true }),
  ).toBeVisible();
  officeServerSocket?.send(
    `42/office,["office:access-ended",${JSON.stringify({
      officeEpoch,
      reason: 'authorization_ended',
    })}]`,
  );
  await expect(page.getByText('Office access ended. Re-enter to reconnect.')).toBeVisible();
  // Access loss must tear down the pending media attempt owned by the mounted office preview.
  await expect.poll(() => heldLiveKitSocketClosed).toBe(true);
  await expect(page.locator('.office-action-error')).toHaveCount(0);
  await expect(page.locator('.office-scene svg.office-map')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('1 person in the office')).toBeVisible();
  await expect(page.locator('.office-map-heading strong')).toHaveText('Live Vivo office');

  await page.getByRole('button', { name: 'Leave office' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to E2E Company' })).toBeVisible();
  await expect(page.locator('.office-scene .office-map')).toHaveCount(0);
  await expect.poll(() => officeEvents.filter((event) => event === 'disconnect').length).toBe(3);

  // An explicit microphone choice at entry carries into nearby voice after admission.
  holdPair = true;
  await page.getByRole('button', { name: 'Turn microphone on', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Turn microphone off', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Mute proximity microphone', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#office-microphone-help')).toContainText(
    'waiting for a nearby coworker',
  );
  expect(
    await page.evaluate(() =>
      (window as unknown as { __entryCaptures: MediaStream[] }).__entryCaptures.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'),
      ),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Leave office' }).click();
  await expect(page).toHaveURL(`/companies/${workspace.id}/offices/${officeId}/entry`);
  await page.goBack();
  await expect(page).toHaveURL(`/companies/${workspace.id}/offices/${officeId}`);
  await expect(page.getByText('1 person in the office')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(`/companies/${workspace.id}/offices/${officeId}`);
  await expect(page.getByText('1 person in the office')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Activate proximity microphone', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('link', { name: 'Messages', exact: true }).click();
  await expect(page).toHaveURL(`/companies/${workspace.id}/offices/${officeId}/chat`);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Message General' })).toBeVisible();
  await expect(page).toHaveURL(`/companies/${workspace.id}/offices/${officeId}/chat`);
  await page.getByRole('link', { name: 'Office', exact: true }).click();
  await page.getByRole('button', { name: 'Leave office', exact: true }).click();
  // Leaving the entry screen also releases a microphone that was explicitly opened there.
  await page.getByRole('button', { name: 'Turn microphone on', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Turn microphone off', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Back to companies' }).click();
  await expect(page.getByRole('heading', { name: 'Your companies' })).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __entryCaptures: MediaStream[] }).__entryCaptures.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'),
      ),
    ),
  ).toBe(true);
  await expect(page.locator('.office-scene .office-map')).toHaveCount(0);
  expect(unexpectedApiCalls).toEqual([]);
  expect(officeEvents).toContain('connect');
  expect(officeEvents).toContain('presence:update');
  expect(officeEvents).toContain('seat:sit');
  expect(officeEvents).toContain('seat:stand');
  expect(officeEvents).toContain('world:input');
  // Removing the status card must not remove expiry cleanup.
  await page.clock.install({ time: new Date(session.idleExpiresAt) });
  await page.clock.fastForward(1_100);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(
    page.getByText('Your session has expired. Sign in again to continue.'),
  ).toBeVisible();
});
