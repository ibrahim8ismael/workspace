import type { MediaTokenResponse } from '@gather/contracts';

export type ProximityAudioStatus =
  'off' | 'connecting' | 'live' | 'muted' | 'reconnecting' | 'error';

export type ProximityRemoteAudioTrack = {
  readonly kind: string;
  attach(): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement[];
};

export interface ProximityRoom {
  connect(serverUrl: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  onTrackSubscribed(
    listener: (track: ProximityRemoteAudioTrack, identity: string) => void,
  ): () => void;
  onTrackUnsubscribed(listener: (track: ProximityRemoteAudioTrack) => void): () => void;
  onDisconnected(listener: () => void): () => void;
  onReconnecting(listener: () => void): () => void;
  onReconnected(listener: () => void): () => void;
}

type RoomFactory = () => Promise<ProximityRoom>;
type StateListener = (status: ProximityAudioStatus, error?: string) => void;
type RemoteTrackBinder = (track: ProximityRemoteAudioTrack, identity: string) => () => void;

function mediaError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError')
    return 'Microphone access was denied. Allow microphone access in your browser and try again.';
  if (name === 'NotFoundError') return 'No microphone was found on this device.';
  return 'Could not connect proximity audio. Check microphone access and your connection.';
}

export async function createLiveKitProximityRoom(
  onDisconnectReason?: (reason: unknown) => void,
): Promise<ProximityRoom> {
  const { Room, RoomEvent, Track } = await import('livekit-client');
  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
    publishDefaults: { stopMicTrackOnMute: true, preConnectBuffer: false },
  });
  return {
    connect: async (serverUrl, token) => {
      await room.connect(serverUrl, token);
    },
    disconnect: async () => {
      await room.disconnect();
    },
    setMicrophoneEnabled: async (enabled) => {
      await room.localParticipant.setMicrophoneEnabled(enabled);
    },
    onTrackSubscribed: (listener) => {
      const handler = (
        track: import('livekit-client').RemoteTrack,
        _publication: unknown,
        participant: { identity: string },
      ) => {
        if (track.kind === Track.Kind.Audio) listener(track, participant.identity);
      };
      room.on(RoomEvent.TrackSubscribed, handler);
      return () => room.off(RoomEvent.TrackSubscribed, handler);
    },
    onTrackUnsubscribed: (listener) => {
      const handler = (track: import('livekit-client').RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) listener(track);
      };
      room.on(RoomEvent.TrackUnsubscribed, handler);
      return () => room.off(RoomEvent.TrackUnsubscribed, handler);
    },
    onDisconnected: (listener) => {
      const handler = (reason?: unknown) => {
        onDisconnectReason?.(reason);
        listener();
      };
      room.on(RoomEvent.Disconnected, handler);
      return () => room.off(RoomEvent.Disconnected, handler);
    },
    onReconnecting: (listener) => {
      room.on(RoomEvent.Reconnecting, listener);
      return () => room.off(RoomEvent.Reconnecting, listener);
    },
    onReconnected: (listener) => {
      room.on(RoomEvent.Reconnected, listener);
      return () => room.off(RoomEvent.Reconnected, listener);
    },
  };
}

/** Owns one explicit, microphone-only LiveKit session for one current proximity generation. */
export class ProximityAudioSession {
  private room: ProximityRoom | null = null;
  private request: AbortController | null = null;
  private generation = 0;
  private microphoneEnabled = false;
  private listeners: Array<() => void> = [];
  private remoteTracks = new Map<ProximityRemoteAudioTrack, () => void>();
  private status: ProximityAudioStatus = 'off';

  constructor(
    private readonly onState: StateListener,
    private readonly bindRemoteTrack: RemoteTrackBinder,
    private readonly createRoom: RoomFactory = createLiveKitProximityRoom,
  ) {}

  async start(
    fetchGrant: (signal: AbortSignal) => Promise<MediaTokenResponse>,
    isCurrent: () => boolean,
    expectedVersion: number,
    expectedGeneration: string,
  ) {
    if (['connecting', 'live', 'muted', 'reconnecting'].includes(this.status)) return;
    const attempt = ++this.generation;
    const request = new AbortController();
    this.request = request;
    this.setState('connecting');
    let nextRoom: ProximityRoom | null = null;
    try {
      const grant = await fetchGrant(request.signal);
      if (!this.isCurrent(attempt, isCurrent)) return;
      if (grant.conversationVersion !== expectedVersion || grant.generation !== expectedGeneration)
        throw new Error('conversation_changed');

      nextRoom = await this.createRoom();
      if (!this.isCurrent(attempt, isCurrent)) {
        await nextRoom.disconnect().catch(() => undefined);
        return;
      }
      this.room = nextRoom;
      this.bindRoom(nextRoom, attempt);
      await nextRoom.connect(grant.serverUrl, grant.token);
      if (!this.isCurrent(attempt, isCurrent)) {
        await this.releaseRoom(nextRoom);
        return;
      }
      await nextRoom.setMicrophoneEnabled(true);
      if (!this.isCurrent(attempt, isCurrent)) {
        await this.releaseRoom(nextRoom);
        return;
      }
      this.microphoneEnabled = true;
      this.setState('live');
    } catch (error) {
      if (attempt !== this.generation) return;
      if (nextRoom) await this.releaseRoom(nextRoom);
      this.setState('error', mediaError(error));
    } finally {
      if (this.request === request) this.request = null;
    }
  }

  async toggleMicrophone() {
    const room = this.room;
    if (!room || !['live', 'muted'].includes(this.status)) return;
    const enabled = !this.microphoneEnabled;
    const attempt = this.generation;
    try {
      await room.setMicrophoneEnabled(enabled);
      if (attempt !== this.generation || this.room !== room) return;
      this.microphoneEnabled = enabled;
      this.setState(enabled ? 'live' : 'muted');
    } catch (error) {
      if (attempt !== this.generation || this.room !== room) return;
      await this.releaseRoom(room);
      this.setState('error', mediaError(error));
    }
  }

  async stop() {
    this.generation += 1;
    this.request?.abort();
    this.request = null;
    const room = this.room;
    if (room) await this.releaseRoom(room);
    this.setState('off');
  }

  private isCurrent(attempt: number, isCurrent: () => boolean) {
    return attempt === this.generation && !this.request?.signal.aborted && isCurrent();
  }

  private bindRoom(room: ProximityRoom, attempt: number) {
    this.listeners = [
      room.onTrackSubscribed((track, identity) => {
        if (this.room !== room || attempt !== this.generation || this.remoteTracks.has(track))
          return;
        this.remoteTracks.set(track, this.bindRemoteTrack(track, identity));
      }),
      room.onTrackUnsubscribed((track) => this.detachRemoteTrack(track)),
      room.onDisconnected(() => {
        if (this.room !== room || attempt !== this.generation) return;
        void this.releaseRoom(room).finally(() => {
          if (attempt === this.generation)
            this.setState('error', 'Proximity audio disconnected. Select the microphone to retry.');
        });
      }),
      room.onReconnecting(() => {
        if (this.room === room && attempt === this.generation) this.setState('reconnecting');
      }),
      room.onReconnected(() => {
        if (this.room === room && attempt === this.generation)
          this.setState(this.microphoneEnabled ? 'live' : 'muted');
      }),
    ];
  }

  private async releaseRoom(room: ProximityRoom) {
    if (this.room !== room) return;
    this.room = null;
    for (const unsubscribe of this.listeners.splice(0)) unsubscribe();
    for (const track of this.remoteTracks.keys()) this.detachRemoteTrack(track);
    this.microphoneEnabled = false;
    try {
      await room.setMicrophoneEnabled(false);
    } catch {
      // Disconnect still stops local tracks if LiveKit cannot send the mute update.
    }
    await room.disconnect().catch(() => undefined);
  }

  private detachRemoteTrack(track: ProximityRemoteAudioTrack) {
    const detach = this.remoteTracks.get(track);
    if (!detach) return;
    this.remoteTracks.delete(track);
    detach();
  }

  private setState(status: ProximityAudioStatus, error?: string) {
    this.status = status;
    this.onState(status, error);
  }
}
