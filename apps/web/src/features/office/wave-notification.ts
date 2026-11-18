import type { OfficeWave } from '@gather/contracts';

type ToneContext = AudioContext;

/** A tiny, synthesized two note cue. Blocked waves are skipped; a later gesture unlocks audio
 * only for future waves. */
export class WaveNotificationSound {
  private context: ToneContext | null = null;
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private oscillators: OscillatorNode[] = [];
  private gainNodes: GainNode[] = [];
  private pendingVolumes: (() => number)[] = [];
  private unlockListener: (() => void) | null = null;

  play(volume: number, currentVolume: () => number = () => volume) {
    if (volume <= 0) return;
    if (this.active) {
      this.pendingVolumes.push(currentVolume);
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      if (context.state !== 'running') {
        this.listenForUnlock(context);
        return;
      }

      const output = context.createGain();
      this.gainNodes.push(output);
      output.gain.value = Math.min(1, Math.max(0, volume)) * 0.28;
      output.connect(context.destination);
      const start = context.currentTime;
      const notes: readonly [number, number][] = [
        [0, 880],
        [0.095, 1174.66],
      ];
      for (const [offset, frequency] of notes) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        this.oscillators.push(oscillator);
        this.gainNodes.push(envelope);
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        envelope.gain.setValueAtTime(0.0001, start + offset);
        envelope.gain.exponentialRampToValueAtTime(1, start + offset + 0.012);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.09);
        oscillator.connect(envelope);
        envelope.connect(output);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.095);
      }
      this.active = true;
      this.timer = setTimeout(() => this.finish(), 220);
    } catch {
      this.finish();
    }
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const oscillator of this.oscillators) {
      try {
        oscillator.stop();
      } catch {
        // It may already have finished.
      }
      oscillator.disconnect();
    }
    this.oscillators = [];
    this.disconnectCueNodes();
    this.pendingVolumes = [];
    this.active = false;
    this.removeUnlockListeners();
    if (this.context) {
      void this.context.close().catch(() => undefined);
      this.context = null;
    }
  }

  private finish() {
    for (const oscillator of this.oscillators) oscillator.disconnect();
    this.oscillators = [];
    this.disconnectCueNodes();
    this.timer = null;
    this.active = false;
    while (this.pendingVolumes.length) {
      const nextVolume = this.pendingVolumes.shift()!;
      const volume = nextVolume();
      if (volume <= 0) continue;
      this.play(volume, nextVolume);
      return;
    }
  }

  private listenForUnlock(context: ToneContext) {
    if (this.unlockListener || typeof window === 'undefined') return;
    const unlock = () => {
      if (this.context !== context) return;
      try {
        void context
          .resume()
          .then(() => {
            if (context.state === 'running') this.removeUnlockListeners();
          })
          .catch(() => undefined);
      } catch {
        // Autoplay restrictions should never affect the visual wave notice.
      }
    };
    this.unlockListener = unlock;
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
  }

  private removeUnlockListeners() {
    if (!this.unlockListener || typeof window === 'undefined') return;
    window.removeEventListener('pointerdown', this.unlockListener);
    window.removeEventListener('keydown', this.unlockListener);
    window.removeEventListener('touchstart', this.unlockListener);
    this.unlockListener = null;
  }

  private disconnectCueNodes() {
    for (const node of this.gainNodes) node.disconnect();
    this.gainNodes = [];
  }
}

/** Consume each observed event exactly once, even when muted or when it was not addressed locally. */
export function notifyReceivedWaves(
  waves: readonly OfficeWave[],
  recipientParticipationId: string | null,
  seen: Set<string>,
  notify: () => void,
) {
  for (const wave of waves) {
    if (seen.has(wave.eventId)) continue;
    seen.add(wave.eventId);
    if (seen.size > 256) seen.delete(seen.values().next().value!);
    if (recipientParticipationId && wave.recipientParticipationId === recipientParticipationId) {
      notify();
    }
  }
}
