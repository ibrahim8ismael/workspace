import { afterEach, describe, expect, it, vi } from 'vitest';

const socketMocks = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: socketMocks.io }));

import { officeCommandAckSchema } from '@gather/contracts';
import { OfficeClient } from '../src/features/office/office-client';
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OfficeClient wave lifecycle', () => {
  it('deduplicates, expires and clears the active wave on disconnect', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    socketMocks.io.mockReturnValue(socket);
    const api = {
      officeBootstrap: vi.fn().mockResolvedValue({
        workspaceId,
        officeId,
        mapVersion,
        protocolVersion: 2,
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
      protocolVersion: 2,
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
        protocolVersion: 2,
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
      protocolVersion: 2,
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
