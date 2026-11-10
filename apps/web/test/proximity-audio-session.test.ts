import { describe, expect, it, vi } from 'vitest';
import {
  ProximityAudioSession,
  type ProximityAudioStatus,
  type ProximityRemoteAudioTrack,
  type ProximityRoom,
} from '../src/features/office/proximity-audio-session';

const grant = {
  serverUrl: 'wss://media.example.test',
  token: 'short-lived-signed-token',
  expiresAt: '2026-11-10T17:00:00.000Z',
  conversationVersion: 2,
  generation: 'a371c42a-aa7d-4082-ad22-74e1816af053',
};

function createRoom() {
  const handlers = {
    subscribed: undefined as
      ((track: ProximityRemoteAudioTrack, identity: string) => void) | undefined,
    unsubscribed: undefined as ((track: ProximityRemoteAudioTrack) => void) | undefined,
    disconnected: undefined as (() => void) | undefined,
    reconnecting: undefined as (() => void) | undefined,
    reconnected: undefined as (() => void) | undefined,
  };
  const room: ProximityRoom = {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    setMicrophoneEnabled: vi.fn(async () => undefined),
    onTrackSubscribed: vi.fn((handler) => {
      handlers.subscribed = handler;
      return () => {
        handlers.subscribed = undefined;
      };
    }),
    onTrackUnsubscribed: vi.fn((handler) => {
      handlers.unsubscribed = handler;
      return () => {
        handlers.unsubscribed = undefined;
      };
    }),
    onDisconnected: vi.fn((handler) => {
      handlers.disconnected = handler;
      return () => {
        handlers.disconnected = undefined;
      };
    }),
    onReconnecting: vi.fn((handler) => {
      handlers.reconnecting = handler;
      return () => {
        handlers.reconnecting = undefined;
      };
    }),
    onReconnected: vi.fn((handler) => {
      handlers.reconnected = handler;
      return () => {
        handlers.reconnected = undefined;
      };
    }),
  };
  return { room, handlers };
}

describe('session-bound proximity audio client', () => {
  it('joins only after an explicit start, then publishes mic-only state and mutes on request', async () => {
    const statuses: ProximityAudioStatus[] = [];
    const fake = createRoom();
    const fetchGrant = vi.fn(async () => grant);
    const session = new ProximityAudioSession(
      (status) => statuses.push(status),
      () => vi.fn(),
      async () => fake.room,
    );

    expect(fetchGrant).not.toHaveBeenCalled();
    await session.start(fetchGrant, () => true, 2, grant.generation);
    expect(fetchGrant).toHaveBeenCalledTimes(1);
    expect(fake.room.connect).toHaveBeenCalledWith(grant.serverUrl, grant.token);
    expect(fake.room.setMicrophoneEnabled).toHaveBeenNthCalledWith(1, true);
    expect(statuses.at(-1)).toBe('live');

    await session.toggleMicrophone();
    expect(fake.room.setMicrophoneEnabled).toHaveBeenNthCalledWith(2, false);
    expect(statuses.at(-1)).toBe('muted');
    await session.stop();
    expect(fake.room.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(fake.room.disconnect).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('off');
  });

  it('rejects a grant from a replaced conversation and never connects it', async () => {
    const statuses: Array<{ status: ProximityAudioStatus; error?: string }> = [];
    const fake = createRoom();
    const session = new ProximityAudioSession(
      (status, error) => statuses.push({ status, ...(error ? { error } : {}) }),
      () => vi.fn(),
      async () => fake.room,
    );

    await session.start(
      async () => ({ ...grant, generation: 'other-generation' }),
      () => true,
      2,
      grant.generation,
    );
    expect(fake.room.connect).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toMatchObject({ status: 'error' });
  });

  it('aborts a pending token request when the office conversation ends', async () => {
    let resolveGrant!: (value: typeof grant) => void;
    let observedSignal: AbortSignal | undefined;
    const fake = createRoom();
    const session = new ProximityAudioSession(
      () => undefined,
      () => vi.fn(),
      async () => fake.room,
    );
    const start = session.start(
      (signal) => {
        observedSignal = signal;
        return new Promise((resolve) => {
          resolveGrant = resolve;
        });
      },
      () => true,
      2,
      grant.generation,
    );

    await session.stop();
    expect(observedSignal?.aborted).toBe(true);
    resolveGrant(grant);
    await start;
    expect(fake.room.connect).not.toHaveBeenCalled();
  });

  it('detaches remote audio when a track is removed and when the room closes', async () => {
    const cleanup = vi.fn();
    const fake = createRoom();
    const session = new ProximityAudioSession(
      () => undefined,
      () => cleanup,
      async () => fake.room,
    );
    const track = { kind: 'audio' } as ProximityRemoteAudioTrack;

    await session.start(
      async () => grant,
      () => true,
      2,
      grant.generation,
    );
    fake.handlers.subscribed?.(track, 'remote-participation');
    expect(cleanup).not.toHaveBeenCalled();
    fake.handlers.unsubscribed?.(track);
    expect(cleanup).toHaveBeenCalledTimes(1);
    fake.handlers.subscribed?.(track, 'remote-participation');
    await session.stop();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
