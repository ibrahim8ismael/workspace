/** Experimental watchdog state; run in an independent process with a fixed-target stop adapter. */
export class SupervisorState {
  #epoch;
  #clock;
  #stop;
  #deadline;
  #sequence = -1;
  #pending = null;
  #tripped = false;
  #stopped = false;
  #stopping = null;
  constructor({ epoch, clock, stop }) {
    if (
      !epoch ||
      typeof epoch !== 'string' ||
      typeof clock !== 'function' ||
      typeof stop !== 'function'
    )
      throw new Error('invalid supervisor configuration');
    this.#epoch = epoch;
    this.#clock = clock;
    this.#stop = stop;
    this.#deadline = clock() + 3000;
  }
  expectInstallation({ nonce, version }) {
    if (
      this.#tripped ||
      this.#pending ||
      typeof nonce !== 'string' ||
      !nonce ||
      !Number.isSafeInteger(version) ||
      version < 0
    )
      return false;
    this.#pending = { nonce, version, deadline: this.#clock() + 3000 };
    return true;
  }
  acknowledge({ epoch, sequence, nonce, version }) {
    const now = this.#clock();
    if (
      this.#tripped ||
      now >= this.#deadline ||
      epoch !== this.#epoch ||
      !Number.isSafeInteger(sequence) ||
      sequence <= this.#sequence
    )
      return false;
    if (
      this.#pending &&
      (now >= this.#pending.deadline ||
        nonce !== this.#pending.nonce ||
        version !== this.#pending.version)
    )
      return false;
    // Only acknowledgements of an outstanding installation demonstrate useful progress.
    if (!this.#pending) return false;
    this.#pending = null;
    this.#sequence = sequence;
    this.#deadline = now + 3000;
    return true;
  }
  async check() {
    if (
      this.#clock() >= this.#deadline ||
      (this.#pending && this.#clock() >= this.#pending.deadline)
    )
      this.#tripped = true;
    if (!this.#tripped) return 'healthy';
    if (this.#stopped) return 'stopped';
    if (this.#stopping) return this.#stopping;
    this.#stopping = (async () => {
      try {
        // No container identity or command is accepted from the guard.
        if ((await Promise.resolve().then(() => this.#stop())) === true) {
          this.#stopped = true;
          return 'stopped';
        }
        return 'stop-unconfirmed';
      } catch {
        return 'stop-unconfirmed';
      } finally {
        this.#stopping = null;
      }
    })();
    return this.#stopping;
  }
}
