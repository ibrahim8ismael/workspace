/** Guard policy state. Room retirement is confirmed by the caller before a new policy is acked. */
export class PermitState {
  #epoch;
  #clock;
  #sequence = -1;
  #pending = null;
  #permits = new Map();
  #retired;
  #denied = new Set();
  #pendingRetirements = new Set();
  #pendingStableRosters = new Map();
  #pendingSourceDenials = new Set();
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
    const next = this.#prepare({ epoch, nonce, sequence, permits });
    if (!next) return false;
    this.#sequence = sequence;
    this.#permits = next;
    return true;
  }

  /** Retire changed generations and prove their SFU rooms empty before installing replacement grants. */
  async installWithRetirement(snapshot, retireRoom, reconcileStableRoom = async () => true) {
    if (typeof retireRoom !== 'function') return false;
    if (typeof reconcileStableRoom !== 'function') return false;
    const next = this.#prepare(snapshot);
    if (!next) return false;

    const generations = new Set([
      ...[...this.#permits.values()].map((permit) => permit.generation),
      ...[...next.values()].map((permit) => permit.generation),
      ...this.#pendingStableRosters.keys(),
    ]);
    const stableRosters = [];
    for (const generation of generations) {
      const current = [...this.#permits.values()].filter(
        (permit) => permit.generation === generation,
      );
      const replacement = [...next.values()].filter((permit) => permit.generation === generation);
      const currentStableRoom =
        current.length > 0 &&
        current.every(
          (permit) => permit.roomLifecycle === 'stable' && permit.room === current[0].room,
        )
          ? current[0].room
          : null;
      const replacementStableRoom =
        replacement.length > 0 &&
        replacement.every(
          (permit) => permit.roomLifecycle === 'stable' && permit.room === replacement[0].room,
        )
          ? replacement[0].room
          : null;
      const pendingStableRoom = this.#pendingStableRosters.get(generation);
      const stableMeetingRoster =
        replacementStableRoom !== null &&
        (current.length === 0
          ? !pendingStableRoom || pendingStableRoom === replacementStableRoom
          : currentStableRoom === replacementStableRoom);
      if (stableMeetingRoster) {
        const revokedIdentities = current
          .filter((permit) => {
            const updated = replacement.find((candidate) => candidate.identity === permit.identity);
            return !updated || updated.version !== permit.version;
          })
          .map((permit) => permit.identity);
        if (revokedIdentities.length) this.#denyParticipants(generation, revokedIdentities);
        for (const permit of current) {
          const updated = replacement.find((candidate) => candidate.identity === permit.identity);
          if (!updated) continue;
          for (const source of permit.sources)
            if (!updated.sources.includes(source))
              this.#pendingSourceDenials.add(JSON.stringify([generation, permit.identity, source]));
        }
        this.#pendingStableRosters.set(generation, replacementStableRoom);
        stableRosters.push({
          generation,
          permits: replacement.map(({ identity, version, sources }) => ({
            identity,
            version,
            sources,
          })),
        });
        continue;
      }
      if (current.length === 0 && replacement.length > 0 && !pendingStableRoom) continue;
      if (
        !this.#sameGenerationPolicy(current, replacement) ||
        this.#pendingStableRosters.has(generation)
      ) {
        this.#pendingRetirements.add(generation);
        try {
          this.retire(generation);
        } catch {
          return false;
        }
      }
    }

    for (const generation of [...this.#pendingRetirements]) {
      let empty;
      try {
        this.retire(generation);
        empty = await retireRoom(generation);
      } catch {
        return false;
      }
      if (empty !== true) return false;
      this.#pendingRetirements.delete(generation);
      this.#pendingStableRosters.delete(generation);
    }

    for (const { generation, permits } of stableRosters) {
      let reconciled;
      try {
        reconciled = await reconcileStableRoom(generation, permits);
      } catch {
        return false;
      }
      if (reconciled !== true) return false;
      this.#pendingStableRosters.delete(generation);
    }

    if ([...next.values()].some((permit) => this.#denied.has(permit.generation))) return false;
    this.#sequence = snapshot.sequence;
    this.#permits = next;
    this.#pendingSourceDenials.clear();
    return true;
  }

  #prepare({ epoch, nonce, sequence, permits }) {
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
        (permit.roomLifecycle !== undefined &&
          !['rotating', 'stable'].includes(permit.roomLifecycle)) ||
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
    return next;
  }

  #sameGenerationPolicy(current, next) {
    if (current.length !== next.length) return false;
    return current.every((permit) => {
      const replacement = next.find((candidate) => candidate.identity === permit.identity);
      return (
        replacement &&
        replacement.room === permit.room &&
        (replacement.roomLifecycle ?? 'rotating') === (permit.roomLifecycle ?? 'rotating') &&
        replacement.version === permit.version &&
        replacement.sources.length === permit.sources.length &&
        replacement.sources.every((source) => permit.sources.includes(source))
      );
    });
  }
  #denyParticipants(generation, identities) {
    const revoked = new Set(identities);
    for (const [key, permit] of this.#permits)
      if (permit.generation === generation && revoked.has(permit.identity))
        this.#permits.delete(key);
  }
  retire(generation) {
    this.#denied.add(generation);
    for (const [key, permit] of this.#permits)
      if (permit.generation === generation) this.#permits.delete(key);
    if (typeof this.#retired.retire === 'function') this.#retired.retire(generation);
    else this.#retired.add(generation);
  }
  allows({ generation, identity, room, source, version }) {
    const permit = this.#permits.get(JSON.stringify([generation, identity]));
    return Boolean(
      permit &&
      !this.#denied.has(generation) &&
      !this.#retired.has(generation) &&
      !this.#pendingSourceDenials.has(JSON.stringify([generation, identity, source])) &&
      this.#clock() < permit.deadline &&
      permit.room === room &&
      permit.version === version &&
      permit.sources.includes(source),
    );
  }
}
