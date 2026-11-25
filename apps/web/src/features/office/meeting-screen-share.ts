import { OFFICE_LIMITS } from '@gather/contracts/limits';

export type MeetingScreenShareState = {
  status: 'idle' | 'capturing' | 'authorizing' | 'publishing' | 'live' | 'stopping' | 'error';
  message: string;
};

export type MeetingScreenShareActions = {
  reserve(shareId: string): Promise<void>;
  waitForPermission(signal: AbortSignal): Promise<void>;
  publish(track: MediaStreamTrack, shareId: string): Promise<void>;
  confirm(shareId: string): Promise<void>;
  unpublish(track: MediaStreamTrack): Promise<void>;
  release(shareId: string): Promise<void>;
  isCurrent(): boolean;
};

export type ScreenCapture = (constraints: DisplayMediaStreamOptions) => Promise<MediaStream>;

export function canPublishDesktopScreen(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  hasCapture = typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function',
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
  maxTouchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
) {
  const iPadDesktopMode = platform === 'MacIntel' && maxTouchPoints > 1;
  return hasCapture && !iPadDesktopMode && !/(android|iphone|ipad|ipod|mobile)/i.test(userAgent);
}

function defaultCapture(constraints: DisplayMediaStreamOptions) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia)
    return Promise.reject(new Error('screen_capture_unavailable'));
  return navigator.mediaDevices.getDisplayMedia(constraints);
}

function stateMessage(error: unknown) {
  if (error instanceof Error && ['NotAllowedError', 'AbortError'].includes(error.name))
    return 'Screen sharing was cancelled or permission was denied.';
  if (error instanceof Error && error.message === 'conflict')
    return 'Someone else is presenting in this meeting.';
  if (error instanceof Error && error.message === 'screen_share_permission_timeout')
    return 'Could not confirm screen sharing permission. Try again.';
  if (error instanceof Error && error.message === 'screen_capture_unavailable')
    return 'Screen sharing is unavailable in this browser.';
  return 'Could not start screen sharing. Your meeting audio is still connected.';
}

/** Starts browser capture on the caller's click, then reserves, authorizes, and publishes in order. */
export class MeetingScreenShareController {
  private state: MeetingScreenShareState = { status: 'idle', message: '' };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private shareId: string | null = null;
  private actions: MeetingScreenShareActions | null = null;
  private reservationRequested = false;
  private reserved = false;
  private published = false;
  private reservation: Promise<void> | null = null;
  private cancellation: AbortController | null = null;
  private pending: Promise<void> | null = null;
  private cleanup: Promise<void> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private leaseTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly capture: ScreenCapture = defaultCapture,
    private readonly createShareId: () => string = () => crypto.randomUUID(),
  ) {}

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(actions: MeetingScreenShareActions) {
    if (!['idle', 'error'].includes(this.state.status)) return this.pending ?? Promise.resolve();
    const attempt = ++this.generation;
    const shareId = this.createShareId();
    const cancellation = new AbortController();
    this.actions = actions;
    this.shareId = shareId;
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.leaseTimer = null;
    this.cancellation = cancellation;
    this.reservationRequested = false;
    this.reserved = false;
    this.published = false;
    this.reservation = null;
    this.cleanup = null;

    let capture: Promise<MediaStream>;
    try {
      // Keep this call synchronous with the explicit Share Screen click for browser user activation.
      capture = this.capture({
        video: {
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 15, max: 15 },
        },
        audio: false,
      });
    } catch (error) {
      capture = Promise.reject(error);
    }
    this.setState('capturing');
    const pending = this.startCapturedShare(attempt, shareId, actions, cancellation, capture);
    this.pending = pending;
    void pending.finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    return pending;
  }

  async stop() {
    if (this.state.status === 'idle') return;
    const attempt = ++this.generation;
    this.setState('stopping');
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.leaseTimer = null;
    this.cancellation?.abort();
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    const pending = this.pending;
    if (pending) await pending.catch(() => undefined);
    await this.releaseResources();
    if (attempt === this.generation) this.reset();
  }

  private async startCapturedShare(
    attempt: number,
    shareId: string,
    actions: MeetingScreenShareActions,
    cancellation: AbortController,
    capture: Promise<MediaStream>,
  ) {
    try {
      const stream = await capture;
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('screen_video_track_missing');
      this.track = track;
      track.addEventListener('ended', this.onNativeTrackEnded, { once: true });
      if (!this.isCurrent(attempt, actions)) throw new Error('share_cancelled');

      this.setState('authorizing');
      this.reservationRequested = true;
      this.expiryTimer = setTimeout(
        () => cancellation.abort(new Error('screen_share_permission_timeout')),
        OFFICE_LIMITS.meetingScreenShareStartTimeoutMs,
      );
      this.reservation = actions.reserve(shareId);
      await this.reservation;
      this.reserved = true;
      if (!this.isCurrent(attempt, actions)) throw new Error('share_cancelled');

      await actions.waitForPermission(cancellation.signal);
      if (!this.isCurrent(attempt, actions)) throw new Error('share_cancelled');

      this.setState('publishing');
      await actions.publish(track, shareId);
      this.published = true;
      if (!this.isCurrent(attempt, actions)) throw new Error('share_cancelled');
      await actions.confirm(shareId);
      if (!this.isCurrent(attempt, actions)) throw new Error('share_cancelled');

      if (this.expiryTimer) clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
      this.setState('live');
      this.startLeaseRefresh(attempt, shareId, actions);
    } catch (error) {
      await this.releaseResources();
      if (attempt === this.generation) {
        if (
          cancellation.signal.aborted &&
          cancellation.signal.reason instanceof Error &&
          cancellation.signal.reason.message === 'share_cancelled'
        ) {
          this.reset();
        } else {
          this.setState('error', stateMessage(cancellation.signal.reason ?? error));
        }
      }
    }
  }

  private isCurrent(attempt: number, actions: MeetingScreenShareActions) {
    return attempt === this.generation && !this.cancellation?.signal.aborted && actions.isCurrent();
  }

  private onNativeTrackEnded = () => {
    void this.stop();
  };

  private startLeaseRefresh(attempt: number, shareId: string, actions: MeetingScreenShareActions) {
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.leaseTimer = setInterval(
      () => {
        if (!this.isCurrent(attempt, actions)) {
          void this.stop();
          return;
        }
        void actions.confirm(shareId).catch(() => this.stop());
      },
      Math.max(1000, Math.floor(OFFICE_LIMITS.meetingScreenShareLeaseMs / 3)),
    );
  }

  private releaseResources() {
    if (this.cleanup) return this.cleanup;
    const track = this.track;
    const stream = this.stream;
    const shareId = this.shareId;
    const actions = this.actions;
    const cleanup = (async () => {
      if (this.expiryTimer) clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
      if (this.leaseTimer) clearInterval(this.leaseTimer);
      this.leaseTimer = null;
      if (this.reservationRequested && this.reservation) {
        try {
          await this.reservation;
          this.reserved = true;
        } catch {
          // A rejected reservation never created a server-side slot.
        }
      }
      if (this.published && track && actions) {
        this.published = false;
        await actions.unpublish(track).catch(() => undefined);
      }
      track?.removeEventListener('ended', this.onNativeTrackEnded);
      for (const localTrack of stream?.getTracks() ?? []) {
        if (localTrack.readyState !== 'ended') localTrack.stop();
      }
      this.track = null;
      this.stream = null;
      if (this.reserved && shareId && actions) {
        this.reserved = false;
        await actions.release(shareId).catch(() => undefined);
      }
      this.reservationRequested = false;
      this.reservation = null;
      this.shareId = null;
      this.actions = null;
      this.cancellation = null;
    })();
    this.cleanup = cleanup;
    void cleanup.finally(() => {
      if (this.cleanup === cleanup) this.cleanup = null;
    });
    return cleanup;
  }

  private reset() {
    this.setState('idle');
  }

  private setState(status: MeetingScreenShareState['status'], message = '') {
    this.state = { status, message };
    for (const listener of this.listeners) listener();
  }
}
