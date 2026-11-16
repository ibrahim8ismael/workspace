export type EntryMicrophoneState = {
  status: 'off' | 'requesting' | 'on' | 'error';
  message: string;
};

/** Owns local-only capture until entry. Nothing is published from this controller. */
export class EntryMicrophone {
  private state: EntryMicrophoneState = { status: 'off', message: '' };
  private stream: MediaStream | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();

  constructor(
    private readonly capture = () =>
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
  ) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async toggle() {
    if (this.state.status === 'on' || this.state.status === 'requesting') {
      this.stop();
      return;
    }
    const generation = ++this.generation;
    this.update({ status: 'requesting', message: '' });
    try {
      const stream = await this.capture();
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const audio = stream.getAudioTracks();
      if (!audio.some((track) => track.readyState === 'live')) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('No live microphone track');
      }
      this.stream = stream;
      audio.forEach((track) => track.addEventListener('ended', this.onEnded));
      this.update({ status: 'on', message: '' });
    } catch (error) {
      if (generation !== this.generation) return;
      const denied =
        error instanceof Error && ['NotAllowedError', 'SecurityError'].includes(error.name);
      this.update({
        status: 'error',
        message: denied
          ? 'Microphone access was denied. Allow access in your browser and try again, or join with your microphone off.'
          : 'Could not open your microphone. Check your device and try again, or join with your microphone off.',
      });
    }
  }

  stop = () => {
    ++this.generation;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((track) => {
      track.removeEventListener('ended', this.onEnded);
      track.stop();
    });
    this.update({ status: 'off', message: '' });
  };

  private onEnded = () => {
    this.stop();
    this.update({
      status: 'error',
      message: 'Your microphone disconnected. Check your device and try again.',
    });
  };

  private update(state: EntryMicrophoneState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
