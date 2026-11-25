import { describe, expect, it, vi } from 'vitest';
import { RemoteParticipant, Room, RoomEvent, Track } from 'livekit-client';
import {
  ProximityAudioSession,
  createLiveKitProximityRoom,
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
  it('reports verified local and remote LiveKit speakers, including mute and departure', async () => {
    const roomListener = vi.spyOn(Room.prototype, 'on');
    try {
      const adapter = await createLiveKitProximityRoom();
      const speakers = vi.fn();
      const unsubscribe = adapter.onActiveSpeakersChanged!(speakers);
      const room = roomListener.mock.contexts.find(
        (context): context is Room => context instanceof Room,
      )!;
      const local = room.localParticipant;
      local.identity = 'local-person';
      const localMic = vi.spyOn(local, 'isMicrophoneEnabled', 'get').mockReturnValue(true);
      const remote = new RemoteParticipant(room.engine.client, 'PA_remote', 'remote-person');
      vi.spyOn(remote, 'isMicrophoneEnabled', 'get').mockReturnValue(true);
      room.remoteParticipants.set(remote.identity, remote);
      room.activeSpeakers = [local, remote];

      room.emit(RoomEvent.ActiveSpeakersChanged, room.activeSpeakers);
      expect(speakers).toHaveBeenLastCalledWith(['local-person', 'remote-person']);
      localMic.mockReturnValue(false);
      room.emit(RoomEvent.TrackMuted, { source: Track.Source.Microphone } as never, local);
      expect(speakers).toHaveBeenLastCalledWith(['remote-person']);
      room.remoteParticipants.delete(remote.identity);
      room.emit(RoomEvent.ParticipantDisconnected, remote);
      expect(speakers).toHaveBeenLastCalledWith([]);

      unsubscribe();
      room.emit(RoomEvent.ActiveSpeakersChanged, []);
      expect(speakers).toHaveBeenCalledTimes(3);
    } finally {
      roomListener.mockRestore();
    }
  });

  it('forwards current speakers and clears them on reconnect and stop, ignoring stale callbacks', async () => {
    const fake = createRoom();
    let emit: ((identities: string[]) => void) | undefined;
    const unsubscribe = vi.fn();
    fake.room.onActiveSpeakersChanged = (listener) => {
      emit = listener;
      return unsubscribe;
    };
    const speakers = vi.fn();
    const session = new ProximityAudioSession(
      () => {},
      () => vi.fn(),
      async () => fake.room,
      speakers,
    );
    await session.start(
      async () => grant,
      () => true,
      2,
      grant.generation,
    );
    emit?.(['local-person', 'remote-person']);
    expect(speakers).toHaveBeenLastCalledWith(['local-person', 'remote-person']);
    fake.handlers.reconnecting?.();
    expect(speakers).toHaveBeenLastCalledWith([]);
    emit?.(['remote-person']);
    expect(speakers).toHaveBeenLastCalledWith([]);
    fake.handlers.reconnected?.();
    emit?.(['remote-person']);
    expect(speakers).toHaveBeenLastCalledWith(['remote-person']);
    await session.stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
    emit?.(['remote-person']);
    expect(speakers).toHaveBeenLastCalledWith([]);
  });

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
    expect(fake.room.prepareMicrophone).toBeUndefined();
    expect(fake.room.setMicrophoneEnabled).toHaveBeenNthCalledWith(1, false);
    expect(statuses.at(-1)).toBe('muted');

    await session.setMicrophoneEnabled(true);
    expect(fake.room.setMicrophoneEnabled).toHaveBeenNthCalledWith(2, true);
    expect(statuses.at(-1)).toBe('live');
    await session.setMicrophoneEnabled(false);
    expect(fake.room.setMicrophoneEnabled).toHaveBeenNthCalledWith(3, false);
    expect(statuses.at(-1)).toBe('muted');
    await session.stop();
    expect(fake.room.disconnect).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('off');
  });

  it('reports authorization, capture, connection, publication stages and elapsed diagnostics', async () => {
    const fake = createRoom();
    fake.room.prepareMicrophone = vi.fn(async () => undefined);
    const stages: string[] = [];
    const diagnostics: Array<[string, number]> = [];
    const session = new ProximityAudioSession(
      () => undefined,
      () => vi.fn(),
      async () => fake.room,
      () => {},
      (stage) => stages.push(stage),
      (stage, elapsedMs) => diagnostics.push([stage, elapsedMs]),
    );

    await session.setMicrophoneEnabled(true);
    await session.start(
      async () => grant,
      () => true,
      2,
      grant.generation,
    );

    expect(stages).toEqual(['authorizing', 'loading', 'capturing', 'connecting', 'publishing']);
    expect(diagnostics.map(([stage]) => stage)).toEqual([
      'conversation-active',
      'token-returned',
      'sdk-ready',
      'capture-requested',
      'capture-resolved',
      'room-connected',
      'microphone-published',
    ]);
    expect(diagnostics.every(([, elapsedMs]) => Number.isFinite(elapsedMs))).toBe(true);
    expect(JSON.stringify(diagnostics)).not.toContain(grant.token);
    await session.stop();
  });

  it('keeps the authorized listener connected when a later microphone enable is denied', async () => {
    const fake = createRoom();
    const order: string[] = [];
    fake.room.prepareMicrophone = vi.fn(async () => {
      order.push('capture');
    });
    vi.mocked(fake.room.connect).mockImplementation(async () => {
      order.push('connect');
    });
    const statuses: Array<{ status: ProximityAudioStatus; error?: string }> = [];
    const session = new ProximityAudioSession(
      (status, error) => statuses.push({ status, error }),
      () => vi.fn(),
      async () => fake.room,
    );
    await session.start(
      async () => grant,
      () => true,
      2,
      grant.generation,
    );
    expect(order).toEqual(['connect']);
    vi.mocked(fake.room.setMicrophoneEnabled).mockImplementationOnce(async (enabled) => {
      if (enabled) throw new DOMException('Denied', 'NotAllowedError');
    });
    await session.setMicrophoneEnabled(true);
    expect(fake.room.disconnect).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual({
      status: 'muted',
      error: 'Microphone access was denied. Allow microphone access in your browser and try again.',
    });
    await session.stop();
  });

  it('preserves an explicit mute across a conversation generation replacement', async () => {
    const fake = createRoom();
    const session = new ProximityAudioSession(
      () => undefined,
      () => vi.fn(),
      async () => fake.room,
    );
    await session.setMicrophoneEnabled(true);
    await session.start(
      async () => grant,
      () => true,
      2,
      grant.generation,
    );
    expect(fake.room.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    await session.setMicrophoneEnabled(false);
    await session.stop(true);
    await session.start(
      async () => ({ ...grant, conversationVersion: 3 }),
      () => true,
      3,
      grant.generation,
    );
    expect(fake.room.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    await session.stop();
  });

  it('cancels a pending token request when the office conversation ends', async () => {
    const fake = createRoom();
    const session = new ProximityAudioSession(
      () => undefined,
      () => vi.fn(),
      async () => fake.room,
    );
    let resolveGrant!: (value: typeof grant) => void;
    let observedSignal: AbortSignal | undefined;
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

  it('attaches every remote group member once and cleans up each track on leave', async () => {
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const bindRemoteTrack = vi.fn((_track: ProximityRemoteAudioTrack, identity: string) =>
      identity === 'member-b' ? firstCleanup : secondCleanup,
    );
    const fake = createRoom();
    const session = new ProximityAudioSession(
      () => undefined,
      bindRemoteTrack,
      async () => fake.room,
    );
    const firstTrack = { kind: 'audio' } as ProximityRemoteAudioTrack;
    const secondTrack = { kind: 'audio' } as ProximityRemoteAudioTrack;
    await session.start(
      async () => grant,
      () => true,
      2,
      grant.generation,
    );

    fake.handlers.subscribed?.(firstTrack, 'member-b');
    fake.handlers.subscribed?.(firstTrack, 'member-b');
    fake.handlers.subscribed?.(secondTrack, 'member-c');
    expect(bindRemoteTrack).toHaveBeenCalledTimes(2);
    await session.stop();
    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(secondCleanup).toHaveBeenCalledTimes(1);
  });
});
