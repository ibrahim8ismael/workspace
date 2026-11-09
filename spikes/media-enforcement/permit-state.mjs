/** Experimental guard policy state. No JWT verification or SFU enforcement is provided here. */
export class PermitState {
  #epoch;
  #clock;
  #sequence = -1;
  #pending = null;
  #permits = new Map();
  #retired;
  #denied = new Set();
  constructor(epoch, clock, retirementStore = new Set()) {
    if (typeof epoch !== 'string' || !epoch || typeof clock !== 'function')
      throw new Error('invalid guard configuration');
    this.#retired = retirementStore;
    this.#epoch = epoch;
    this.#clock = clock;
  }
  beginPull(nonce) {
    if (typeof nonce !== 'string' || !nonce) throw new Error('invalid nonce');
    this.#pending = { nonce, startedAt: this.#clock() };
    return { epoch: this.#epoch, nonce };
  }
  install({ epoch, nonce, sequence, permits }) {
    const pending = this.#pending;
    this.#pending = null;
    const now = this.#clock();
    if (
      !pending ||
      epoch !== this.#epoch ||
      nonce !== pending.nonce ||
      !Number.isSafeInteger(sequence) ||
      sequence <= this.#sequence ||
      now < pending.startedAt ||
      now >= pending.startedAt + 5000 ||
      !Array.isArray(permits)
    )
      return false;
    const next = new Map();
    for (const permit of permits) {
      if (
        !permit ||
        typeof permit.generation !== 'string' ||
        !permit.generation ||
        typeof permit.identity !== 'string' ||
        !permit.identity ||
        typeof permit.room !== 'string' ||
        !permit.room ||
        !Number.isSafeInteger(permit.version) ||
        permit.version < 0 ||
        !Array.isArray(permit.sources) ||
        !permit.sources.length ||
        permit.sources.some(
          (source) => !['microphone', 'camera', 'screen_share'].includes(source),
        ) ||
        this.#denied.has(permit.generation) ||
        this.#retired.has(permit.generation)
      )
        return false;
      const key = JSON.stringify([permit.generation, permit.identity]);
      if (next.has(key)) return false;
      next.set(key, {
        ...permit,
        sources: [...permit.sources],
        deadline: pending.startedAt + 5000,
      });
    }
    this.#sequence = sequence;
    this.#permits = next;
    return true;
  }
  retire(generation) {
    this.#denied.add(generation);
    if (typeof this.#retired.retire === 'function') this.#retired.retire(generation);
    else this.#retired.add(generation);
    for (const [key, permit] of this.#permits)
      if (permit.generation === generation) this.#permits.delete(key);
  }
  allows({ generation, identity, room, source, version }) {
    const permit = this.#permits.get(JSON.stringify([generation, identity]));
    return Boolean(
      permit &&
      !this.#denied.has(generation) &&
      !this.#retired.has(generation) &&
      this.#clock() < permit.deadline &&
      permit.room === room &&
      permit.version === version &&
      permit.sources.includes(source),
    );
  }
}
