import type { SpaceMessage } from '@gather/contracts';
import { expect, test } from '@playwright/test';
import { OFFICE_PROTOCOL_VERSION } from '../../packages/contracts/dist/versions.js';
import { VIVO_GEOMETRY } from '../../packages/world/dist/index.js';

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
const meetingConversationId = 'c720f217-923e-43c6-9a44-95d34d8055c9';
const meetingGeneration = '10e9c483-bd4a-45af-a1d4-4bf419e86055';
const meetingZoneId = 'vivo-e2e-meeting-room';
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
  let workspaceName = workspace.name;
  let workspaceRevision = 0;
  let conflictNextRename = false;
  let workspaceRoomCount = 5;
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
  const meetingMediaTokenRequests: Array<{
    participationId: string;
    conversationVersion: number;
  }> = [];
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
  let setOfficeStateVersion: ((version: number) => void) | undefined;
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
    if (method === 'PATCH' && path === `/api/workspaces/${workspace.id}`) {
      expect(request.headers()['idempotency-key']).toBeTruthy();
      const body = request.postDataJSON() as { name: string; expectedRevision: number };
      expect(body.expectedRevision).toBe(workspaceRevision);
      if (conflictNextRename) {
        conflictNextRename = false;
        workspaceName = 'E2E Updated Elsewhere';
        workspaceRevision += 1;
        return json(
          {
            error: {
              code: 'revision_conflict',
              message: 'revision_conflict',
              requestId,
            },
          },
          409,
        );
      }
      workspaceName = body.name;
      workspaceRevision += 1;
      return json({
        message: 'Space name updated.',
        name: workspaceName,
        revision: workspaceRevision,
      });
    }
    if (
      method === 'PATCH' &&
      path === `/api/workspaces/${workspace.id}/offices/${officeId}/rooms`
    ) {
      expect(request.headers()['idempotency-key']).toBeTruthy();
      const body = request.postDataJSON() as { roomCount: number; expectedRevision: number };
      expect(body.expectedRevision).toBe(workspaceRevision);
      workspaceRoomCount = body.roomCount;
      workspaceRevision += 1;
      return json({
        message: 'Office room count updated.',
        roomCount: workspaceRoomCount,
        revision: workspaceRevision,
      });
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
      return authenticated
        ? json({ workspaces: [{ ...workspace, name: workspaceName }] })
        : json({}, 401);
    if (method === 'GET' && path === `/api/workspaces/${workspace.id}`)
      return authenticated
        ? json({
            workspace: {
              ...workspace,
              name: workspaceName,
              officeId,
              revision: workspaceRevision,
              roomCount: workspaceRoomCount,
            },
          })
        : json({}, 401);
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
    if (
      method === 'POST' &&
      [proximityConversationId, meetingConversationId].some(
        (conversationId) => path === `/api/conversations/${conversationId}/media-token`,
      )
    ) {
      const isMeeting = path.endsWith(`/api/conversations/${meetingConversationId}/media-token`);
      const body = request.postDataJSON() as {
        participationId: string;
        conversationVersion: number;
      };
      if (isMeeting) meetingMediaTokenRequests.push(body);
      else mediaTokenRequests.push(body);
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
            room: isMeeting ? meetingGeneration : proximityGeneration,
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
        generation: isMeeting ? meetingGeneration : proximityGeneration,
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
    setOfficeStateVersion = (version) => {
      stateVersion = version;
    };
    let areaSequence = 0;
    let proximityVersion = 0;
    let proximityConversationActive = false;
    let availability = 'available';
    let sittingAt: string | null = null;
    let position = { x: 656, y: 1264 };
    let meetingActive = false;
    const seatIds = ['24c48737:0', '52e00cff:0', 'd8fe8680:0', '88544309:0'];
    const emitMeetingZones = () => {
      const inside =
        position.x >= 640 && position.x < 768 && position.y >= 1248 && position.y < 1312;
      socket.send(
        `42/office,["meeting:zones",${JSON.stringify({
          workspaceId: workspace.id,
          officeId,
          officeEpoch,
          mapVersion,
          zones: [
            {
              zoneId: meetingZoneId,
              label: 'E2E meeting room',
              bounds: { tx: 20, ty: 39, width: 4, height: 2 },
              tileSize: 32,
              capacity: 6,
              accessPolicy: 'explicit-admission',
              occupancy: inside ? [participationId] : [],
              admittedMembers: meetingActive ? [participationId] : [],
              meeting: meetingActive
                ? { conversationId: meetingConversationId, version: 2, state: 'active' }
                : null,
              entrances: [{ side: 'north', at: 21, state: inside ? 'occupied' : 'open' }],
            },
          ],
        })}]`,
      );
    };
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
              userId: account.id,
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
      emitMeetingZones();
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
            features: { screenSharing: false },
            snapshot: {
              officeEpoch,
              stateVersion: 0,
              serverTime: Date.now(),
              participants: [
                {
                  participationId,
                  userId: account.id,
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
        socket.send(
          `42/office,["conversation:areas",${JSON.stringify({
            officeEpoch,
            sequence: areaSequence,
            areas: [],
          })}]`,
        );
        emitMeetingZones();
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
                zoneId?: string;
                conversationId?: string;
                conversationVersion?: number;
                invitationId?: string;
                decision?: 'accept' | 'decline';
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
            proximityConversationActive = true;
            const joiningVersion = proximityVersion + 1;
            const activeVersion = joiningVersion + 1;
            proximityVersion = activeVersion;
            areaSequence += 1;
            socket.send(
              `42/office,["conversation:areas",${JSON.stringify({
                officeEpoch,
                sequence: areaSequence,
                areas: [
                  {
                    areaId: proximityConversationId,
                    version: areaSequence,
                    shape: 'circle',
                    center: { x: 656, y: 1264 },
                    radius: 64,
                    state: 'active',
                  },
                ],
              })}]`,
            );
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
                version: joiningVersion,
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
                version: activeVersion,
                generation: proximityGeneration,
                mediaReady: true,
                participants,
              })}]`,
            );
          } else if (
            packet[0] === 'proximity:set-opt-in' &&
            !packet[1].payload?.enabled &&
            proximityConversationActive &&
            !holdPair
          ) {
            proximityConversationActive = false;
            const endedVersion = ++proximityVersion;
            areaSequence += 1;
            socket.send(
              `42/office,["conversation:areas",${JSON.stringify({
                officeEpoch,
                sequence: areaSequence,
                areas: [],
              })}]`,
            );
            socket.send(
              `42/office,["conversation:update",${JSON.stringify({
                officeEpoch,
                conversationId: proximityConversationId,
                kind: 'proximity',
                state: 'ended',
                version: endedVersion,
                generation: proximityGeneration,
                mediaReady: false,
                participants: [],
              })}]`,
            );
          } else if (packet[0] === 'conversation:leave') {
            proximityConversationActive = false;
            const endedVersion = ++proximityVersion;
            areaSequence += 1;
            socket.send(
              `42/office,["conversation:areas",${JSON.stringify({
                officeEpoch,
                sequence: areaSequence,
                areas: [],
              })}]`,
            );
            socket.send(
              `42/office,["conversation:update",${JSON.stringify({
                officeEpoch,
                conversationId: proximityConversationId,
                kind: 'proximity',
                state: 'ended',
                version: endedVersion,
                generation: proximityGeneration,
                mediaReady: false,
                participants: [],
              })}]`,
            );
          } else if (packet[0] === 'meeting:join' && packet[1].payload?.zoneId) {
            meetingActive = true;
            emitMeetingZones();
            const participants = [{ participationId, displayName: account.displayName }];
            for (const [state, version, mediaReady] of [
              ['joining', 1, false],
              ['active', 2, true],
            ] as const) {
              socket.send(
                `42/office,["conversation:update",${JSON.stringify({
                  officeEpoch,
                  conversationId: meetingConversationId,
                  kind: 'meeting',
                  zoneId: meetingZoneId,
                  state,
                  version,
                  generation: meetingGeneration,
                  mediaReady,
                  participants,
                })}]`,
              );
            }
          } else if (packet[0] === 'meeting:leave') {
            meetingActive = false;
            emitMeetingZones();
            socket.send(
              `42/office,["conversation:update",${JSON.stringify({
                officeEpoch,
                conversationId: meetingConversationId,
                kind: 'meeting',
                zoneId: meetingZoneId,
                state: 'ended',
                version: (packet[1].payload?.conversationVersion ?? 2) + 1,
                generation: meetingGeneration,
                mediaReady: false,
                participants: [],
              })}]`,
            );
          } else if (
            packet[0] === 'meeting:invitation:respond' &&
            packet[1].payload?.invitationId
          ) {
            const status = packet[1].payload.decision === 'accept' ? 'arriving' : 'declined';
            const response = {
              invitationId: packet[1].payload.invitationId,
              officeEpoch,
              senderParticipationId: teammateParticipationId,
              senderDisplayName: 'Office Teammate',
              recipientParticipationId: participationId,
              recipientDisplayName: account.displayName,
              zoneId: meetingZoneId,
              zoneLabel: 'E2E meeting room',
              status,
              expiresAt: Date.now() + 60_000,
            };
            socket.send(`42/office,["meeting:invitation",${JSON.stringify(response)}]`);
            if (status === 'arriving')
              socket.send(
                `42/office,["meeting:invitation",${JSON.stringify({ ...response, status: 'joined' })}]`,
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
  const rooms = VIVO_GEOMETRY.zones.filter((zone) => zone.kind === 'meeting');
  const roomDoors = page.locator('[data-room-id][data-room-state]');
  await expect(roomDoors).toHaveCount(6);
  const sendRoomOccupancy = (occupants: string[], roomIndex = 0) => {
    officeServerSocket?.send(
      `42/office,["meeting:zones",${JSON.stringify({
        workspaceId: workspace.id,
        officeId,
        officeEpoch,
        mapVersion,
        zones: rooms.map((room, index) => ({
          ...room,
          kind: undefined,
          tileSize: 32,
          capacity: 6,
          accessPolicy: 'explicit-admission',
          occupancy: index === roomIndex ? occupants : [],
          admittedMembers: [],
          meeting: null,
          entrances: [],
        })),
      })}]`,
    );
  };
  for (const room of rooms) {
    await expect(page.getByRole('img', { name: `${room.label} door open` }).first()).toBeAttached();
  }
  const mediaRoomDoors = page.locator(`[data-room-id="${rooms[0]!.zoneId}"]`);
  const lighting = page.locator('.office-scene [data-room-lighting="dimmed"]');
  const roomCenterDimmed = (index: number) => {
    const { tx, ty, width, height } = rooms[index]!.bounds;
    return lighting.locator('rect').evaluateAll(
      (rectangles, { x, y }) =>
        rectangles.some((rectangle) => {
          const bounds = (rectangle as SVGRectElement).getBBox();
          return (
            x >= bounds.x &&
            x < bounds.x + bounds.width &&
            y >= bounds.y &&
            y < bounds.y + bounds.height
          );
        }),
      {
        x: (tx + width / 2) * VIVO_GEOMETRY.tileSize,
        y: (ty + height / 2) * VIVO_GEOMETRY.tileSize,
      },
    );
  };
  // The initial fixture room surrounds spawn. A new shared-area projection clears it.
  await expect(lighting).toHaveCount(1);
  sendRoomOccupancy([]);
  await expect(lighting).toHaveCount(0);
  await expect(mediaRoomDoors).toHaveCount(2);
  const openArt = await mediaRoomDoors.evaluateAll((doors) => doors.map((door) => door.innerHTML));
  sendRoomOccupancy([teammateParticipationId]);
  await expect(
    mediaRoomDoors.filter({ visible: true }).and(page.locator('[data-room-state="closed"]')),
  ).toHaveCount(2);
  await expect(lighting).toHaveCount(0);
  const closedArt = await mediaRoomDoors.evaluateAll((doors) =>
    doors.map((door) => door.innerHTML),
  );
  expect(closedArt.every((art, index) => art !== openArt[index])).toBe(true);
  sendRoomOccupancy([teammateParticipationId, participationId]);
  await expect(lighting).toHaveCount(1);
  await expect(lighting).toHaveAttribute('pointer-events', 'none');
  expect(await roomCenterDimmed(0)).toBe(false);
  expect(await roomCenterDimmed(1)).toBe(true);
  sendRoomOccupancy([participationId], 1);
  await expect.poll(() => roomCenterDimmed(0)).toBe(true);
  expect(await roomCenterDimmed(1)).toBe(false);
  const movementCountWhileDimmed = movementInputs.length;
  await page.locator('.office-map').focus();
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => movementInputs.length).toBeGreaterThan(movementCountWhileDimmed);
  await page.keyboard.up('ArrowRight');
  sendRoomOccupancy([participationId]);
  await expect(mediaRoomDoors.and(page.locator('[data-room-state="closed"]'))).toHaveCount(2);
  sendRoomOccupancy([]);
  await expect(lighting).toHaveCount(0);
  await expect(mediaRoomDoors.and(page.locator('[data-room-state="open"]'))).toHaveCount(2);
  await expect.poll(() => officeBootstrapRequests).toBe(1);
  await expect(page.getByRole('group', { name: 'Office connection controls' })).toBeVisible();
  const memberSidebar = page.locator('#office-member-sidebar');
  await expect(memberSidebar.getByText('Online (1)')).toBeVisible();
  await expect(memberSidebar.getByText('Offline (1)')).toBeVisible();
  const peopleSearch = memberSidebar.getByRole('searchbox', { name: 'Search people' });
  await peopleSearch.fill('Office Teammate');
  await expect(memberSidebar.getByText('Online (0)')).toBeVisible();
  await expect(memberSidebar.getByText('Offline (1)')).toBeVisible();
  await memberSidebar.getByRole('button', { name: 'Office Teammate Offline' }).click();
  await expect(page.getByRole('dialog', { name: 'Member actions' })).toContainText('Offline');
  await page.getByRole('button', { name: 'Close member actions' }).click();
  await memberSidebar.getByRole('button', { name: 'Clear people search' }).click();
  await expect(memberSidebar.getByText('Online (1)')).toBeVisible();
  await memberSidebar.getByRole('button', { name: 'Close member sidebar' }).click();
  await expect(memberSidebar).toBeHidden();
  await page.getByRole('button', { name: 'Open member sidebar' }).click();
  await expect(memberSidebar.getByText('Online (1)')).toBeVisible();
  expect(officeConnections).toBe(1);
  const invitationMicrophoneRequests = await page.evaluate(
    () => (window as Window & { __microphoneTest: { requests: number } }).__microphoneTest.requests,
  );
  const sendMeetingInvitation = (invitationId: string) =>
    officeServerSocket?.send(
      `42/office,["meeting:invitation",${JSON.stringify({
        invitationId,
        officeEpoch,
        senderParticipationId: teammateParticipationId,
        senderDisplayName: 'Office Teammate',
        recipientParticipationId: participationId,
        recipientDisplayName: account.displayName,
        zoneId: meetingZoneId,
        zoneLabel: 'E2E meeting room',
        status: 'pending',
        expiresAt: Date.now() + 60_000,
      })}]`,
    );
  sendMeetingInvitation('c9f5cc47-d7c9-4300-967b-0dfb94d71340');
  await expect(page.getByText('Office Teammate invited you to E2E meeting room.')).toBeVisible();
  expect(mediaTokenRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByText('You arrived at E2E meeting room.')).toBeVisible();
  expect(mediaTokenRequests).toHaveLength(0);
  sendMeetingInvitation('346a6c3e-e1df-491b-a63d-8bb1c48df701');
  await expect(page.getByText('Office Teammate invited you to E2E meeting room.')).toBeVisible();
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await expect(page.getByText('The meeting invitation was declined.')).toBeVisible();
  expect(mediaTokenRequests).toHaveLength(0);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __microphoneTest: { requests: number } }).__microphoneTest.requests,
    ),
  ).toBe(invitationMicrophoneRequests);
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
  const optInButton = page.getByRole('button', { name: 'Opt in to nearby voice' });
  const microphoneButton = page.locator('button[aria-describedby="office-microphone-help"]');
  await expect(optInButton).toBeEnabled();
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
  // Permission is granted from the explicit click; the probe stream is stopped while waiting.
  await microphoneButton.click();
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
  await expect(page.getByRole('button', { name: 'Opt out of nearby voice' })).toBeVisible();
  // Cancel the pending publish intent. This turns proximity opt-in off while there is no group.
  await microphoneButton.click();
  expect(mediaTokenRequests).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Opt in to nearby voice' })).toBeVisible();
  holdPair = false;
  await page.getByRole('button', { name: 'Opt in to nearby voice' }).click();
  // The office creates a group on opt-in; its authorized member connects as a muted listener.
  await expect
    .poll(() => mediaTokenRequests)
    .toEqual([{ participationId, conversationVersion: 2 }]);
  const proximityBoundary = page.locator(`[data-conversation-area="${proximityConversationId}"]`);
  await expect(proximityBoundary).toHaveAttribute('r', '64');
  await expect(proximityBoundary).toHaveAttribute('stroke-dasharray', '2 7');
  await expect.poll(() => liveKitSocketAttempts).toBeGreaterThan(0);
  await expect(page.getByRole('alert')).toContainText('Could not connect proximity audio');
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
  await expect(proximityBoundary).toHaveCount(0);
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
  const meetingGroup = page.getByRole('group', { name: 'Meeting room' });
  await expect(meetingGroup).toContainText('You are inside E2E meeting room');
  await page.getByRole('button', { name: 'Join meeting' }).click();
  await expect(meetingGroup).toContainText('1/6 participants');
  await expect(meetingGroup).toContainText('E2E Person (you)');
  await expect(page.getByRole('button', { name: 'Share screen' })).toHaveCount(0);
  await expect
    .poll(() => meetingMediaTokenRequests)
    .toEqual([{ participationId, conversationVersion: 2 }]);
  await page.getByRole('button', { name: 'Leave meeting' }).click();
  await expect.poll(() => officeEvents.includes('meeting:leave')).toBe(true);
  await expect(page.getByRole('button', { name: 'Join meeting' })).toBeVisible();
  await page.getByRole('button', { name: 'Opt out of nearby voice' }).click();
  await expect(
    page.getByText('Nearby voice is off. Your microphone will stay off until you turn it on.'),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Seats' })).toHaveCount(0);
  await expect(page.locator('#office-member-sidebar').getByText(account.displayName)).toBeVisible();
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
  const busyButton = page.getByRole('button', { name: 'Busy', exact: true });
  await busyButton.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(busyButton).toBeFocused();
  const busyFocusStyle = await busyButton.evaluate(
    (button) => getComputedStyle(button).outlineStyle,
  );
  expect(busyFocusStyle).toBe('solid');
  await busyButton.click();
  await expect(busyButton).toHaveAttribute('aria-pressed', 'true');
  officeHistory.push({
    id: '7db151ba-fbf2-42a3-ad73-59bdad580f0e',
    senderId: '41bbf5d6-37d7-4468-9892-9776ff19e008',
    senderName: 'Office Teammate',
    text: 'This arrived during the reconnect',
    createdAt: '2026-11-10T17:02:00.000Z',
  });
  expect(interruptOfficeConnection).toBeDefined();
  await interruptOfficeConnection!();
  await expect(page.getByText('Reconnecting to live presence…')).toBeVisible();
  await expect(page.locator('.office-scene .office-map')).toHaveCount(1);
  await expect.poll(() => officeEvents.filter((event) => event === 'disconnect').length).toBe(1);
  await expect(page.getByText('1 person in the office')).toBeVisible();
  await expect.poll(() => officeConnections).toBe(2);
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
  await page.locator('button[aria-describedby="office-microphone-help"]').click();
  await expect
    .poll(() => mediaTokenRequests)
    .toEqual([
      { participationId, conversationVersion: 2 },
      { participationId, conversationVersion: 2 },
    ]);
  await expect.poll(() => liveKitSocketAttempts).toBe(3);
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
  await expect(lighting).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Activate proximity microphone', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('link', { name: 'Messages', exact: true }).click();
  await expect(page).toHaveURL(`/companies/${workspace.id}/offices/${officeId}/chat`);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Message General' })).toBeVisible();
  await expect(page).toHaveURL(`/companies/${workspace.id}/offices/${officeId}/chat`);
  await page.getByRole('link', { name: 'Office', exact: true }).click();
  // Observe real oscillator starts in the mounted UI; the socket transport remains mocked.
  await page.evaluate(() => {
    const probe = { notes: [] as number[], blocked: false };
    Object.assign(window, { __waveSoundProbe: probe });
    const state = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state')!;
    Object.defineProperty(AudioContext.prototype, 'state', {
      configurable: true,
      get() {
        return probe.blocked ? 'suspended' : state.get!.call(this);
      },
    });
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () {
      return probe.blocked
        ? Promise.reject(new DOMException('Blocked', 'NotAllowedError'))
        : resume.call(this);
    };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when) {
      if ([880, 1174.6600341796875].includes(this.frequency.value)) {
        probe.notes.push(this.frequency.value);
      }
      return start.call(this, when);
    };
  });
  officeServerSocket?.send(
    `42/office,["world:snapshot",${JSON.stringify({
      officeEpoch,
      stateVersion: 1000000,
      serverTime: Date.now(),
      participants: [participationId, teammateParticipationId].map((id) => ({
        participationId: id,
        userId: id === participationId ? account.id : teammateParticipationId,
        displayName: id === participationId ? account.displayName : 'Office Teammate',
        appearance: { bodyId: 'commons-worker', paletteId: 'teal' },
        position: officeManifest.spawn,
        facing: 'south',
        availability: 'available',
        seatId: null,
        lastProcessedInputSequence: 0,
      })),
      seats: [],
    })}]`,
  );
  setOfficeStateVersion?.(1000000);
  await expect(page.getByText('2 people in the office')).toBeVisible();
  await expect(memberSidebar.getByText('Online (2)')).toBeVisible();
  await expect(memberSidebar.getByText('Offline (0)')).toBeVisible();
  const directoryParticipant = (id: string) => ({
    participationId: id,
    userId: id === participationId ? account.id : teammateParticipationId,
    displayName: id === participationId ? account.displayName : 'Office Teammate',
    appearance: { bodyId: 'commons-worker', paletteId: 'teal' },
    position: officeManifest.spawn,
    facing: 'south',
    availability: 'available',
    seatId: null,
    lastProcessedInputSequence: 0,
  });
  const sendDirectorySnapshot = (version: number, includeTeammate: boolean) => {
    setOfficeStateVersion?.(version);
    officeServerSocket?.send(
      `42/office,["world:snapshot",${JSON.stringify({
        officeEpoch,
        stateVersion: version,
        serverTime: Date.now(),
        participants: [participationId, ...(includeTeammate ? [teammateParticipationId] : [])].map(
          directoryParticipant,
        ),
        seats: [],
      })}]`,
    );
  };
  sendDirectorySnapshot(1000001, false);
  await expect(memberSidebar.getByText('Online (2)')).toBeVisible();
  await expect(memberSidebar.getByText('Reconnecting', { exact: true })).toBeVisible();
  await page.waitForTimeout(7100);
  await expect(memberSidebar.getByText('Online (1)')).toBeVisible();
  await expect(memberSidebar.getByText('Offline (1)')).toBeVisible();
  sendDirectorySnapshot(1000002, true);
  await expect(memberSidebar.getByText('Online (2)')).toBeVisible();
  await expect(memberSidebar.getByText('Offline (0)')).toBeVisible();
  const waveId = 'f3e6c7c8-49f2-49ef-92b6-609ddca1c111';
  const sendWave = (eventId: string, recipientId = participationId) =>
    officeServerSocket?.send(
      `42/office,["office:wave",${JSON.stringify({
        eventId,
        officeEpoch,
        senderParticipationId: teammateParticipationId,
        senderName: 'Office Teammate',
        recipientParticipationId: recipientId,
        recipientName: account.displayName,
        durationMs: 2200,
      })}]`,
    );
  const noteCount = () =>
    page.evaluate(
      () =>
        (window as Window & { __waveSoundProbe: { notes: number[] } }).__waveSoundProbe.notes
          .length,
    );
  sendWave(waveId);
  await expect(page.getByText('Office Teammate waved to you.', { exact: true })).toBeVisible();
  await expect.poll(noteCount).toBe(2);
  // A duplicate and a wave for another member must not schedule more notes.
  sendWave(waveId);
  sendWave('f3e6c7c8-49f2-49ef-92b6-609ddca1c112', teammateParticipationId);
  await page.waitForTimeout(300);
  expect(await noteCount()).toBe(2);
  await page.evaluate(() => localStorage.setItem('office-effects-volume', '0'));
  sendWave('f3e6c7c8-49f2-49ef-92b6-609ddca1c113');
  await expect(page.locator('[data-wave-id="f3e6c7c8-49f2-49ef-92b6-609ddca1c113"]')).toBeVisible();
  expect(await noteCount()).toBe(2);
  await page.evaluate(() => {
    localStorage.setItem('office-effects-volume', '0.7');
    (window as Window & { __waveSoundProbe: { blocked: boolean } }).__waveSoundProbe.blocked = true;
  });
  sendWave('f3e6c7c8-49f2-49ef-92b6-609ddca1c114');
  await expect(page.locator('[data-wave-id="f3e6c7c8-49f2-49ef-92b6-609ddca1c114"]')).toBeVisible();
  expect(await noteCount()).toBe(2);
  await page.evaluate(() => {
    (window as Window & { __waveSoundProbe: { blocked: boolean } }).__waveSoundProbe.blocked =
      false;
  });
  await page.locator('#office-map').click({ position: { x: 10, y: 10 } });
  sendWave('f3e6c7c8-49f2-49ef-92b6-609ddca1c115');
  await expect.poll(noteCount).toBe(4);
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
  await page.getByRole('link', { name: 'Company details' }).click();
  await page.getByRole('link', { name: 'Space settings' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Company' })).toBeVisible();
  await expect(
    page.locator('.space-member-list').getByText('Office Teammate', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Employee invitations' })).toBeVisible();
  await page.getByLabel('Display name').fill('E2E Updated Company');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Space name updated.' })).toBeVisible();
  conflictNextRename = true;
  await page.getByLabel('Display name').fill('E2E Conflict Draft');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('alert')).toContainText('Your draft is preserved');
  await expect(page.getByLabel('Display name')).toHaveValue('E2E Conflict Draft');
  await expect(page.getByRole('heading', { name: 'E2E Updated Elsewhere' })).toBeVisible();
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Space name updated.' })).toBeVisible();
  await page.getByLabel('Meeting room count').fill('20');
  await page.getByRole('button', { name: 'Save room count' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Office layout saved with 20 rooms.' }),
  ).toBeVisible();
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
