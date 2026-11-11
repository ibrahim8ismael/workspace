import type { ProximityRemoteAudioTrack } from './proximity-audio-session';

/** Tracks actual element playback; subscription alone does not mean a browser is playing sound. */
export class RemoteAudioPlayback {
  private elements = new Set<HTMLAudioElement>();
  private blocked = new Set<HTMLAudioElement>();

  constructor(private readonly onBlocked: (blocked: boolean) => void) {}

  attach(track: ProximityRemoteAudioTrack, identity: string, container: HTMLDivElement | null) {
    const element = track.attach() as HTMLAudioElement;
    element.autoplay = true;
    element.muted = false;
    element.volume = 1;
    element.dataset.participantId = identity;
    element.setAttribute('aria-label', `Audio from ${identity}`);
    container?.appendChild(element);
    this.elements.add(element);
    void this.play(element);
    return () => {
      this.elements.delete(element);
      this.blocked.delete(element);
      track.detach(element);
      element.remove();
      this.onBlocked(this.blocked.size > 0);
    };
  }

  /** Call directly from a click so all play() calls retain the browser's user activation. */
  async resume() {
    await Promise.all([...this.elements].map((element) => this.play(element)));
  }

  private async play(element: HTMLAudioElement) {
    try {
      await element.play();
      this.blocked.delete(element);
    } catch {
      if (this.elements.has(element)) this.blocked.add(element);
    }
    this.onBlocked(this.blocked.size > 0);
  }
}
