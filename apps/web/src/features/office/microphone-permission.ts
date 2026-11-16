export type MicrophonePermissionState = {
  status: 'off' | 'requesting' | 'granted' | 'error';
  message: string;
};

export type MicrophonePermissionDiagnostic = (stage: string, elapsedMs: number) => void;

/** Requests browser permission from an explicit click, then immediately releases the probe stream. */
export class MicrophonePermission {
  private state: MicrophonePermissionState = { status: 'off', message: '' };
  private generation = 0;
  private pending: Promise<boolean> | null = null;
  private nativeCapture: Promise<boolean> | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly capture = () =>
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    private readonly diagnose: MicrophonePermissionDiagnostic = (stage, elapsedMs) => {
      if (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('debugVoice')
      )
        console.debug('[proximity-audio]', stage, { elapsedMs, atMs: performance.now() });
    },
  ) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  request = (): Promise<boolean> => {
    if (this.pending) return this.pending;
    if (this.state.status === 'granted') return Promise.resolve(true);

    const generation = ++this.generation;
    const startedAt = performance.now();
    this.diagnose('mic-click-permission-requested', 0);
    this.update({ status: 'requesting', message: '' });
    if (!this.nativeCapture) {
      try {
        this.nativeCapture = this.capture().then((stream) => {
          const hasLiveAudio = stream.getAudioTracks().some((track) => track.readyState === 'live');
          stream.getTracks().forEach((track) => track.stop());
          return hasLiveAudio;
        });
      } catch (error) {
        this.nativeCapture = Promise.reject(error);
      }
    }
    const pending = this.nativeCapture
      .then((hasLiveAudio) => {
        this.nativeCapture = null;
        this.diagnose('permission-resolved', performance.now() - startedAt);
        if (generation !== this.generation) return false;
        this.update(
          hasLiveAudio
            ? { status: 'granted', message: '' }
            : {
                status: 'error',
                message: 'No live microphone track was available. Check your device, then retry.',
              },
        );
        return hasLiveAudio;
      })
      .catch((error: unknown) => {
        this.nativeCapture = null;
        if (generation !== this.generation) return false;
        const denied =
          error instanceof Error && ['NotAllowedError', 'SecurityError'].includes(error.name);
        this.update({
          status: 'error',
          message: denied
            ? 'Microphone access was denied. Allow access in your browser or device settings, then retry.'
            : 'Could not open your microphone. Check that a microphone is connected, then retry.',
        });
        return false;
      })
      .finally(() => {
        if (this.pending === pending) this.pending = null;
      });
    this.pending = pending;
    return pending;
  };

  cancel = () => {
    ++this.generation;
    this.pending = null;
    this.update({ status: 'off', message: '' });
  };

  markGranted = () => this.update({ status: 'granted', message: '' });

  reset = () => {
    this.cancel();
  };

  private update(state: MicrophonePermissionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
