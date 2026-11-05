/** Calm generative music for a meeting, synthesised in the browser (no recordings, nothing to license).
    Everyone in the room starts from the same shared start time, so they hear the same bar. */
const BPM = 72,
  BEAT = 60 / BPM,
  BAR = BEAT * 4;
// Am9 – Fmaj7 – Cmaj7 – G6, voiced softly (MIDI notes).
const CHORDS = [
  [57, 60, 64, 67, 71],
  [53, 57, 60, 64, 69],
  [48, 55, 59, 64, 67],
  [55, 59, 62, 64, 71],
];
const MELODY = [76, 74, 72, 71, 69, 71, 72, 74, 72, 71, 67, 69, 71, 72, 71, 69];
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

export class MeetingMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private nextBar = 0;
  private barIndex = 0;
  /** Change the loudness while playing. */
  setVolume(volume: number) {
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(volume, this.context.currentTime, 0.05);
  }

  start(startedAt: number, volume = 0.18) {
    this.stop();
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = volume;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    master.connect(filter);
    filter.connect(context.destination);
    this.context = context;
    this.master = master;
    // Align to the shared clock: the bar that is playing now for everyone.
    const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
    this.barIndex = Math.floor(elapsed / BAR);
    this.nextBar = context.currentTime + ((BAR - (elapsed % BAR)) % BAR) + 0.05;
    const schedule = () => {
      if (!this.context) return;
      while (this.nextBar < this.context.currentTime + BAR * 1.5) {
        this.playBar(this.nextBar, this.barIndex++);
        this.nextBar += BAR;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 500);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const context = this.context;
    this.context = null;
    this.master = null;
    if (context) {
      void context.close().catch(() => undefined);
    }
  }

  get playing() {
    return this.context !== null;
  }

  private voice(
    time: number,
    frequency: number,
    length: number,
    gain: number,
    type: OscillatorType,
  ) {
    const context = this.context!,
      oscillator = context.createOscillator(),
      envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain, time + Math.min(0.4, length / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + length);
    oscillator.connect(envelope);
    envelope.connect(this.master!);
    oscillator.start(time);
    oscillator.stop(time + length + 0.05);
  }

  private playBar(time: number, index: number) {
    const chord = CHORDS[index % CHORDS.length];
    for (const note of chord) this.voice(time, hz(note), BAR * 1.05, 0.05, 'triangle'); // warm pad
    this.voice(time, hz(chord[0] - 12), BEAT * 1.8, 0.12, 'sine'); // bass on 1 and 3
    this.voice(time + BEAT * 2, hz(chord[0] - 12), BEAT * 1.8, 0.1, 'sine');
    for (let step = 0; step < 4; step++) {
      // soft keys melody, one note per beat, resting now and then
      if ((index + step) % 5 === 4) continue;
      this.voice(
        time + step * BEAT + 0.02,
        hz(MELODY[(index * 4 + step) % MELODY.length]),
        BEAT * 0.9,
        0.035,
        'sine',
      );
    }
  }
}
