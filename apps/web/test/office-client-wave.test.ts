import { afterEach, describe, expect, it, vi } from 'vitest';

const socketMocks = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: socketMocks.io }));

import {
  OFFICE_PROTOCOL_VERSION,
  officeCommandAckSchema,
  type ConversationUpdate,
  type MeetingScreenShareUpdate,
} from '@gather/contracts';
import {
  acceptsMeetingScreenShareUpdate,
  OfficeClient,
} from '../src/features/office/office-client';
import type { ApiClient } from '../src/lib/api';

class FakeSocket {
  connected = true;
  listeners = new Map<
    string,
    ((value: unknown, acknowledge?: (value: unknown) => void) => void)[]
  >();
  emitted: { event: string; payload: unknown }[] = [];

  on(event: string, listener: (value: unknown, acknowledge?: (value: unknown) => void) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, payload: unknown, acknowledge?: (value: unknown) => void) {
    this.emitted.push({ event, payload });
    if (
      event === 'office:wave' &&
      acknowledge &&
      typeof payload === 'object' &&
      payload !== null &&
      'eventId' in payload
    ) {
      acknowledge(officeCommandAckSchema.parse({ eventId: payload.eventId, ok: true }));
    }
    return this;
  }

  disconnect() {
    this.connected = false;
    for (const listener of this.listeners.get('disconnect') ?? []) listener('io client disconnect');
    return this;
  }

  receive(event: string, payload: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

const workspaceId = '11111111-1111-4111-8111-111111111111';
const officeId = '22222222-2222-4222-8222-222222222222';
const epoch = '33333333-3333-4333-8333-333333333333';
const selfId = '44444444-4444-4444-8444-444444444444';
const senderId = '55555555-5555-4555-8555-555555555555';
const eventId = '66666666-6666-4666-8666-666666666666';
const mapVersion = `vivo-v1-${'a'.repeat(64)}`;
const meetingId = '88888888-8888-4888-8888-888888888888';
const shareId = '99999999-9999-4999-8999-999999999999';

function snapshot(stateVersion = 1) {
  return {
    officeEpoch: epoch,
    stateVersion,
    serverTime: stateVersion,
    participants: [selfId, senderId].map((participationId) => ({
      participationId,
      displayName: participationId === selfId ? 'Current Person' : 'Wave Sender',
      appearance: { bodyId: 'commons-worker', paletteId: 'teal' },
      position: { x: 50, y: 50 },
      facing: 'south' as const,
      availability: 'available' as const,
      seatId: null,
      lastProcessedInputSequence: 0,
    })),
    seats: [],
  };
}

function wave() {
  return {
    eventId,
    officeEpoch: epoch,
    senderParticipationId: senderId,
    senderName: 'Wave Sender',
    recipientParticipationId: selfId,
    recipientName: 'Current Person',
    durationMs: 2200 as const,
  };
}

function meeting(participants: string[] = [selfId, senderId], version = 1): ConversationUpdate {
  return {
    officeEpoch: epoch,
    conversationId: meetingId,
    kind: 'meeting',
    state: 'active',
    version,
    generation: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    mediaReady: true,
    zoneId: 'vivo-meeting-room',
    participants: participants.map((participationId) => ({
      participationId,
      displayName: participationId === selfId ? 'Current Person' : 'Wave Sender',
    })),
  };
}

function presentation(version: number, active = true): MeetingScreenShareUpdate {
  return {
    officeEpoch: epoch,
    conversationId: meetingId,
    zoneId: 'vivo-meeting-room',
    version,
    presentation: active
      ? {
          shareId,
          presenterParticipationId: senderId,
          status: 'live',
          startedAt: 100,
        }
      : null,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OfficeClient wave lifecycle', () => {
  it('offers screen-share state only to current meeting participants and preserves stop versions', async () => {
    const socket = new FakeSocket();
    socketMocks.io.mockReturnValue(socket);
    const api = {
      officeBootstrap: vi.fn().mockResolvedValue({
        workspaceId,
        officeId,
        mapVersion,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
        manifest: { mapVersion },
      }),
      officeJoinTicket: vi.fn().mockResolvedValue({ ticket: 'x'.repeat(43) }),
    } as unknown as ApiClient;
    const client = new OfficeClient(api, workspaceId, officeId);
    await client.connect();
    socket.receive('office:ready', {
      participationId: selfId,
      workspaceId,
      officeId,
      mapVersion,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
      snapshot: snapshot(),
    });
    socket.receive('conversation:update', meeting());
    socket.receive('meeting:screen-share:update', {
      ...presentation(1),
      officeEpoch: senderId,
    });
    socket.receive('meeting:screen-share:update', {
      ...presentation(1),
      conversationId: senderId,
    });
    socket.receive('meeting:screen-share:update', {
      ...presentation(1),
      zoneId: 'vivo-other-room',
    });
    expect(client.getSnapshot().meetingScreenShareUpdates).toEqual([]);
    socket.receive('meeting:screen-share:update', presentation(1));
    expect(client.getSnapshot().meetingScreenShareUpdates).toEqual([presentation(1)]);

    socket.receive('meeting:screen-share:update', presentation(2, false));
    socket.receive('meeting:screen-share:update', presentation(1));
    expect(client.getSnapshot().meetingScreenShareUpdates).toEqual([presentation(2, false)]);

    socket.receive('conversation:update', meeting([senderId], 2));
    expect(client.getSnapshot().meetingScreenShareUpdates).toEqual([]);
    socket.receive('meeting:screen-share:update', presentation(3));
    expect(client.getSnapshot().meetingScreenShareUpdates).toEqual([]);
    socket.receive('conversation:update', meeting([selfId, senderId], 3));
    socket.receive('meeting:screen-share:update', presentation(4));
    expect(client.getSnapshot().meetingScreenShareUpdates).toEqual([presentation(4)]);
    socket.disconnect();
    expect(client.getSnapshot().meetingScreenShareUpdates).toEqual([]);
    client.close();
  });

  it('rejects stale, wrong-office, and wrong-meeting screen-share updates', () => {
    const active = presentation(2);
    expect(acceptsMeetingScreenShareUpdate(undefined, active, epoch)).toBe(true);
    expect(acceptsMeetingScreenShareUpdate(active, presentation(2), epoch)).toBe(false);
    expect(acceptsMeetingScreenShareUpdate(active, presentation(1), epoch)).toBe(false);
    expect(
      acceptsMeetingScreenShareUpdate(active, { ...active, officeEpoch: senderId }, epoch),
    ).toBe(false);
    expect(
      acceptsMeetingScreenShareUpdate(active, { ...active, conversationId: senderId }, epoch),
    ).toBe(false);
  });

  it('deduplicates, expires and clears the active wave on disconnect', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    socketMocks.io.mockReturnValue(socket);
    const api = {
      officeBootstrap: vi.fn().mockResolvedValue({
        workspaceId,
        officeId,
        mapVersion,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
        manifest: { mapVersion },
      }),
      officeJoinTicket: vi.fn().mockResolvedValue({ ticket: 'x'.repeat(43) }),
    } as unknown as ApiClient;
    const client = new OfficeClient(api, workspaceId, officeId);
    await client.connect();
    socket.receive('office:ready', {
      participationId: selfId,
      workspaceId,
      officeId,
      mapVersion,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
      snapshot: snapshot(),
    });
    socket.receive('office:wave', wave());
    socket.receive('office:wave', wave());
    expect(client.getSnapshot().waves).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2199);
    expect(client.getSnapshot().waves).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.getSnapshot().waves).toHaveLength(0);

    socket.receive('office:wave', wave());
    expect(client.getSnapshot().waves).toHaveLength(0);
    socket.receive('office:wave', { ...wave(), eventId: '77777777-7777-4777-8777-777777777777' });
    expect(client.getSnapshot().waves).toHaveLength(1);
    socket.disconnect();
    expect(client.getSnapshot().waves).toHaveLength(0);
    client.close();
  });

  it('drops an animation when a snapshot removes a participant', async () => {
    const socket = new FakeSocket();
    socketMocks.io.mockReturnValue(socket);
    const api = {
      officeBootstrap: vi.fn().mockResolvedValue({
        workspaceId,
        officeId,
        mapVersion,
        protocolVersion: OFFICE_PROTOCOL_VERSION,
        manifest: { mapVersion },
      }),
      officeJoinTicket: vi.fn().mockResolvedValue({ ticket: 'x'.repeat(43) }),
    } as unknown as ApiClient;
    const client = new OfficeClient(api, workspaceId, officeId);
    await client.connect();
    socket.receive('office:ready', {
      participationId: selfId,
      workspaceId,
      officeId,
      mapVersion,
      protocolVersion: OFFICE_PROTOCOL_VERSION,
      snapshot: snapshot(),
    });
    socket.receive('office:wave', wave());
    expect(client.getSnapshot().waves).toHaveLength(1);
    socket.receive('world:snapshot', {
      ...snapshot(2),
      participants: snapshot(2).participants.filter(
        (participant) => participant.participationId === selfId,
      ),
    });
    expect(client.getSnapshot().waves).toHaveLength(0);
    client.close();
  });
});
