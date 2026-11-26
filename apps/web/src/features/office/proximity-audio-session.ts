import type { MediaTokenResponse } from '@gather/contracts';
import { meetingScreenShareTrackName } from '@gather/contracts';

export type ProximityAudioStatus =
  'off' | 'connecting' | 'live' | 'muted' | 'reconnecting' | 'error';

export type ProximityRemoteAudioTrack = {
  readonly kind: string;
  attach(): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement[];
};

export type ProximityRemoteScreenTrack = {
  attach(element?: HTMLVideoElement): HTMLMediaElement;
  detach(element?: HTMLVideoElement): HTMLMediaElement[];
};

export type ProximityRemoteScreenShare = {
  track: ProximityRemoteScreenTrack;
  identity: string;
};

export interface ProximityRoom {
  prepareMicrophone?(): Promise<void>;
  connect(serverUrl: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  canPublishScreenShare(): boolean;
  onScreenSharePermissionChanged(listener: (allowed: boolean) => void): () => void;
  publishScreenShare(track: MediaStreamTrack, shareId: string): Promise<void>;
  unpublishScreenShare(track: MediaStreamTrack): Promise<void>;
  onActiveSpeakersChanged?(listener: (identities: string[]) => void): () => void;
  onTrackSubscribed(
    listener: (track: ProximityRemoteAudioTrack, identity: string) => void,
  ): () => void;
  onTrackUnsubscribed(listener: (track: ProximityRemoteAudioTrack) => void): () => void;
  onScreenShareTrackSubscribed(
    listener: (track: ProximityRemoteScreenTrack, identity: string) => void,
  ): () => void;
  onScreenShareTrackUnsubscribed(listener: (track: ProximityRemoteScreenTrack) => void): () => void;
  onDisconnected(listener: () => void): () => void;
  onReconnecting(listener: () => void): () => void;
  onReconnected(listener: () => void): () => void;
}

type RoomFactory = () => Promise<ProximityRoom>;
type StateListener = (status: ProximityAudioStatus, error?: string) => void;
type RemoteTrackBinder = (track: ProximityRemoteAudioTrack, identity: string) => () => void;
export type ProximityAudioStage =
  'authorizing' | 'loading' | 'capturing' | 'connecting' | 'publishing';
export type ProximityAudioDiagnostic = (stage: string, elapsedMs: number) => void;

function mediaError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError')
    return 'Microphone access was denied. Allow microphone access in your browser and try again.';
  if (name === 'NotFoundError') return 'No microphone was found on this device.';
  return 'Could not connect proximity audio. Check microphone access and your connection.';
}

export async function createLiveKitProximityRoom(
  onDisconnectReason?: (reason: unknown) => void,
  onTokenRefreshed?: (token: string) => void,
  rtcConfig?: RTCConfiguration,
): Promise<ProximityRoom> {
  const { EngineEvent, Room, RoomEvent, Track, createLocalAudioTrack } =
    await import('livekit-client');
  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
    publishDefaults: { stopMicTrackOnMute: true, preConnectBuffer: false },
  });
  let preparedMicrophone: import('livekit-client').LocalAudioTrack | undefined;
  let closed = false;
  if (onTokenRefreshed) {
    room.engine.on(EngineEvent.TokenRefreshed, onTokenRefreshed);
  }
  return {
    prepareMicrophone: async () => {
      const track = await createLocalAudioTrack();
      if (closed) {
        track.stop();
        throw new Error('capture_cancelled');
      }
      preparedMicrophone = track;
    },
    connect: async (serverUrl, token) => {
      await room.connect(serverUrl, token, rtcConfig ? { rtcConfig } : undefined);
    },
    disconnect: async () => {
      closed = true;
      preparedMicrophone?.stop();
      preparedMicrophone = undefined;
      await room.disconnect();
    },
    setMicrophoneEnabled: async (enabled) => {
      if (enabled && preparedMicrophone) {
        await room.localParticipant.publishTrack(preparedMicrophone, {
          source: Track.Source.Microphone,
        });
        preparedMicrophone = undefined;
      } else {
        if (!enabled) {
          preparedMicrophone?.stop();
          preparedMicrophone = undefined;
        }
        await room.localParticipant.setMicrophoneEnabled(enabled);
      }
    },
    canPublishScreenShare: () =>
      room.localParticipant.permissions?.canPublishSources?.some(
        (source) => Track.sourceFromProto(source) === Track.Source.ScreenShare,
      ) ?? false,
    onScreenSharePermissionChanged: (listener) => {
      const handler = (_previous: unknown, participant: import('livekit-client').Participant) => {
        if (participant === room.localParticipant)
          listener(
            room.localParticipant.permissions?.canPublishSources?.some(
              (source) => Track.sourceFromProto(source) === Track.Source.ScreenShare,
            ) ?? false,
          );
      };
      room.on(RoomEvent.ParticipantPermissionsChanged, handler);
      return () => room.off(RoomEvent.ParticipantPermissionsChanged, handler);
    },
    publishScreenShare: async (track, shareId) => {
      if (
        !room.localParticipant.permissions?.canPublishSources?.some(
          (source) => Track.sourceFromProto(source) === Track.Source.ScreenShare,
        )
      )
        throw new Error('screen_share_permission_missing');
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.ScreenShare,
        name: meetingScreenShareTrackName(shareId),
      });
    },
    unpublishScreenShare: async (track) => {
      const publication = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (!publication?.track || publication.track.mediaStreamTrack !== track) return;
      await room.localParticipant.unpublishTrack(publication.track, false);
    },
    onActiveSpeakersChanged: (listener) => {
      const handler = (speakers: import('livekit-client').Participant[]) =>
        listener(
          speakers
            .filter(
              (speaker) =>
                speaker.isMicrophoneEnabled &&
                (speaker === room.localParticipant ||
                  room.remoteParticipants.get(speaker.identity) === speaker),
            )
            .map((speaker) => speaker.identity),
        );
      const refresh = () => handler(room.activeSpeakers);
      room.on(RoomEvent.ActiveSpeakersChanged, handler);
      room.on(RoomEvent.TrackMuted, refresh);
      room.on(RoomEvent.TrackUnpublished, refresh);
      room.on(RoomEvent.LocalTrackUnpublished, refresh);
      room.on(RoomEvent.ParticipantDisconnected, refresh);
      return () => {
        room.off(RoomEvent.ActiveSpeakersChanged, handler);
        room.off(RoomEvent.TrackMuted, refresh);
        room.off(RoomEvent.TrackUnpublished, refresh);
        room.off(RoomEvent.LocalTrackUnpublished, refresh);
        room.off(RoomEvent.ParticipantDisconnected, refresh);
      };
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
    onScreenShareTrackSubscribed: (listener) => {
      const handler = (
        track: import('livekit-client').RemoteTrack,
        _publication: unknown,
        participant: { identity: string },
      ) => {
        if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare)
          listener(track, participant.identity);
      };
      room.on(RoomEvent.TrackSubscribed, handler);
      return () => room.off(RoomEvent.TrackSubscribed, handler);
    },
    onScreenShareTrackUnsubscribed: (listener) => {
      const handler = (track: import('livekit-client').RemoteTrack) => {
        if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare)
          listener(track);
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
  private microphoneDesired = false;
  private listeners: Array<() => void> = [];
  private remoteTracks = new Map<ProximityRemoteAudioTrack, () => void>();
  private remoteScreenTracks = new Map<ProximityRemoteScreenTrack, string>();
  private readonly remoteScreenShareListeners = new Set<() => void>();
  private status: ProximityAudioStatus = 'off';
  private screenShare: { room: ProximityRoom; track: MediaStreamTrack } | null = null;

  constructor(
    private readonly onState: StateListener,
    private readonly bindRemoteTrack: RemoteTrackBinder,
    private readonly createRoom: RoomFactory = createLiveKitProximityRoom,
    private readonly onSpeakers: (identities: string[]) => void = () => {},
    private readonly onStage: (stage: ProximityAudioStage) => void = () => {},
    private readonly diagnose: ProximityAudioDiagnostic = (stage, elapsedMs) => {
      if (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('debugVoice')
      )
        console.debug('[proximity-audio]', stage, { elapsedMs, atMs: performance.now() });
    },
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
    const startedAt = performance.now();
    this.onStage('authorizing');
    this.diagnose('conversation-active', 0);
    this.setState('connecting');
    let nextRoom: ProximityRoom | null = null;
    try {
      const grant = await fetchGrant(request.signal);
      this.diagnose('token-returned', performance.now() - startedAt);
      if (!this.isCurrent(attempt, isCurrent)) return;
      if (grant.conversationVersion !== expectedVersion || grant.generation !== expectedGeneration)
        throw new Error('conversation_changed');

      this.onStage('loading');
      nextRoom = await this.createRoom();
      this.diagnose('sdk-ready', performance.now() - startedAt);
      if (!this.isCurrent(attempt, isCurrent)) {
        await nextRoom.disconnect().catch(() => undefined);
        return;
      }
      this.room = nextRoom;
      this.bindRoom(nextRoom, attempt);
      let microphoneError: string | undefined;
      if (this.microphoneDesired) {
        this.onStage('capturing');
        this.diagnose('capture-requested', performance.now() - startedAt);
        // Capture is requested only after an explicit microphone action.
        try {
          await nextRoom.prepareMicrophone?.();
          this.diagnose('capture-resolved', performance.now() - startedAt);
        } catch (error) {
          this.microphoneDesired = false;
          microphoneError = mediaError(error);
        }
      }
      if (!this.isCurrent(attempt, isCurrent)) {
        await this.releaseRoom(nextRoom);
        return;
      }
      this.onStage('connecting');
      await nextRoom.connect(grant.serverUrl, grant.token);
      this.diagnose('room-connected', performance.now() - startedAt);
      if (!this.isCurrent(attempt, isCurrent)) {
        await this.releaseRoom(nextRoom);
        return;
      }
      if (this.microphoneDesired) this.onStage('publishing');
      try {
        await nextRoom.setMicrophoneEnabled(this.microphoneDesired);
        if (this.microphoneDesired)
          this.diagnose('microphone-published', performance.now() - startedAt);
      } catch (error) {
        if (!this.isCurrent(attempt, isCurrent)) {
          await this.releaseRoom(nextRoom);
          return;
        }
        // A denied microphone must not prevent listening to the authorized room.
        this.microphoneDesired = false;
        this.microphoneEnabled = false;
        microphoneError = mediaError(error);
      }
      if (!this.isCurrent(attempt, isCurrent)) {
        await this.releaseRoom(nextRoom);
        return;
      }
      this.microphoneEnabled = this.microphoneDesired;
      this.setState(this.microphoneEnabled ? 'live' : 'muted', microphoneError);
    } catch (error) {
      if (attempt !== this.generation) return;
      if (nextRoom) await this.releaseRoom(nextRoom);
      this.setState('error', mediaError(error));
    } finally {
      if (this.request === request) this.request = null;
    }
  }

  async toggleMicrophone() {
    await this.setMicrophoneEnabled(!this.microphoneDesired);
  }

  isScreenSharePermitted() {
    return this.room?.canPublishScreenShare() ?? false;
  }

  getRemoteScreenShares(): ProximityRemoteScreenShare[] {
    return [...this.remoteScreenTracks].map(([track, identity]) => ({ track, identity }));
  }

  subscribeRemoteScreenShares(listener: () => void) {
    this.remoteScreenShareListeners.add(listener);
    return () => {
      this.remoteScreenShareListeners.delete(listener);
    };
  }

  async waitForScreenSharePermission(signal: AbortSignal) {
    const room = this.room;
    if (!room || !['live', 'muted', 'reconnecting'].includes(this.status))
      throw new Error('media_disconnected');
    if (room.canPublishScreenShare()) return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        unsubscribePermission();
        unsubscribeDisconnect();
        signal.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => {
        const reason = signal.reason;
        finish(reason instanceof Error ? reason : new Error('share_cancelled'));
      };
      const unsubscribePermission = room.onScreenSharePermissionChanged((allowed) => {
        if (allowed) finish();
      });
      const unsubscribeDisconnect = room.onDisconnected(() =>
        finish(new Error('media_disconnected')),
      );
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      else if (room.canPublishScreenShare()) finish();
    });
    if (this.room !== room || !room.canPublishScreenShare())
      throw new Error('screen_share_permission_missing');
  }

  async publishScreenShare(track: MediaStreamTrack, shareId: string) {
    const room = this.room;
    if (!room || !['live', 'muted'].includes(this.status)) throw new Error('media_disconnected');
    if (this.screenShare) throw new Error('screen_share_already_published');
    if (!room.canPublishScreenShare()) throw new Error('screen_share_permission_missing');
    await room.publishScreenShare(track, shareId);
    if (this.room !== room || !room.canPublishScreenShare()) {
      await room.unpublishScreenShare(track).catch(() => undefined);
      throw new Error('screen_share_permission_missing');
    }
    this.screenShare = { room, track };
  }

  async unpublishScreenShare(track: MediaStreamTrack) {
    const active = this.screenShare;
    if (!active || active.track !== track) return;
    this.screenShare = null;
    await active.room.unpublishScreenShare(track).catch(() => undefined);
  }

  clearMicrophoneIntent() {
    this.microphoneDesired = false;
    this.microphoneEnabled = false;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.microphoneDesired = enabled;
    const room = this.room;
    if (!room || this.status === 'connecting') return;
    const attempt = this.generation;
    try {
      await room.setMicrophoneEnabled(enabled);
      if (attempt !== this.generation || this.room !== room) return;
      this.microphoneEnabled = enabled;
      this.setState(enabled ? 'live' : 'muted');
    } catch (error) {
      if (attempt !== this.generation || this.room !== room) return;
      if (enabled) {
        this.microphoneDesired = false;
        this.microphoneEnabled = false;
        this.setState('muted', mediaError(error));
      } else {
        await this.releaseRoom(room);
        this.setState('error', mediaError(error));
      }
    }
  }

  async stop(preserveMicrophoneIntent = false) {
    this.generation += 1;
    this.request?.abort();
    this.request = null;
    if (!preserveMicrophoneIntent) this.microphoneDesired = false;
    const room = this.room;
    if (room) await this.releaseRoom(room);
    this.setState('off');
  }

  private isCurrent(attempt: number, isCurrent: () => boolean) {
    return attempt === this.generation && !this.request?.signal.aborted && isCurrent();
  }

  private bindRoom(room: ProximityRoom, attempt: number) {
    this.listeners = [
      ...(room.onActiveSpeakersChanged
        ? [
            room.onActiveSpeakersChanged((identities) => {
              if (
                this.room === room &&
                attempt === this.generation &&
                ['live', 'muted'].includes(this.status)
              )
                this.onSpeakers(identities);
            }),
          ]
        : []),
      room.onTrackSubscribed((track, identity) => {
        if (this.room !== room || attempt !== this.generation || this.remoteTracks.has(track))
          return;
        this.remoteTracks.set(track, this.bindRemoteTrack(track, identity));
      }),
      room.onTrackUnsubscribed((track) => this.detachRemoteTrack(track)),
      room.onScreenShareTrackSubscribed((track, identity) => {
        if (this.room !== room || attempt !== this.generation || this.remoteScreenTracks.has(track))
          return;
        this.remoteScreenTracks.set(track, identity);
        this.notifyRemoteScreenShares();
      }),
      room.onScreenShareTrackUnsubscribed((track) => this.detachRemoteScreenTrack(track)),
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
    this.onSpeakers([]);
    for (const unsubscribe of this.listeners.splice(0)) unsubscribe();
    for (const track of this.remoteTracks.keys()) this.detachRemoteTrack(track);
    for (const track of [...this.remoteScreenTracks.keys()]) this.detachRemoteScreenTrack(track);
    const screenShare = this.screenShare?.room === room ? this.screenShare : null;
    if (screenShare) {
      this.screenShare = null;
      await room.unpublishScreenShare(screenShare.track).catch(() => undefined);
      if (screenShare.track.readyState !== 'ended') screenShare.track.stop();
    }
    this.microphoneEnabled = false;
    // Disconnect now: never wait for a mute RPC before cutting remote reception.
    const disconnected = room.disconnect().catch(() => undefined);
    void room.setMicrophoneEnabled(false).catch(() => undefined);
    await disconnected;
  }

  private detachRemoteTrack(track: ProximityRemoteAudioTrack) {
    const detach = this.remoteTracks.get(track);
    if (!detach) return;
    this.remoteTracks.delete(track);
    detach();
  }

  private detachRemoteScreenTrack(track: ProximityRemoteScreenTrack) {
    if (!this.remoteScreenTracks.delete(track)) return;
    track.detach();
    this.notifyRemoteScreenShares();
  }

  private notifyRemoteScreenShares() {
    for (const listener of this.remoteScreenShareListeners) listener();
  }

  private setState(status: ProximityAudioStatus, error?: string) {
    if (!['live', 'muted'].includes(status)) this.onSpeakers([]);
    this.status = status;
    this.onState(status, error);
  }
}
