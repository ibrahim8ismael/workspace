import { randomUUID } from 'node:crypto';
import { conversationUpdateSchema } from '@gather/contracts';
import type { ConversationUpdate } from '@gather/contracts';

export const PROXIMITY_JOIN_RADIUS_TILES = 2;
export const PROXIMITY_LEAVE_RADIUS_TILES = 3;
export const PROXIMITY_EXIT_DEBOUNCE_MS = 500;

export interface ProximityCandidate {
  readonly participationId: string;
  readonly socketId: string;
  readonly displayName: string;
  readonly availability: 'available' | 'busy' | 'away';
  readonly position: { readonly x: number; readonly y: number };
}

export interface PrivateConversationNotice {
  readonly socketIds: readonly string[];
  readonly update: ConversationUpdate;
}

interface VoicePair {
  readonly conversationId: string;
  readonly generation: string;
  readonly memberIds: readonly [string, string];
  readonly socketIds: readonly [string, string];
  readonly participants: readonly [
    { participationId: string; displayName: string },
    { participationId: string; displayName: string },
  ];
  version: number;
  outsideSince: number | null;
  mediaState: 'joining' | 'active';
}

interface PairCandidate {
  readonly left: ProximityCandidate;
  readonly right: ProximityCandidate;
  readonly distance: number;
  readonly key: string;
}

/** Deterministic private one-to-one voice pairing for a single office epoch. */
export class ProximityPairing {
  private readonly optedIn = new Set<string>();
  private readonly pairs = new Map<string, VoicePair>();
  private readonly pairByParticipant = new Map<string, string>();
  private readonly suppressedPairs = new Set<string>();

  constructor(
    private readonly officeEpoch: string,
    private readonly tileSize: number,
  ) {}

  setOptIn(
    participationId: string,
    enabled: boolean,
    candidates: readonly ProximityCandidate[],
    now: number,
  ): PrivateConversationNotice[] {
    if (enabled) this.optedIn.add(participationId);
    else this.optedIn.delete(participationId);
    return this.reconcile(candidates, now);
  }

  reconcile(candidates: readonly ProximityCandidate[], now: number): PrivateConversationNotice[] {
    const byId = new Map(candidates.map((candidate) => [candidate.participationId, candidate]));
    const notices: PrivateConversationNotice[] = [];
    for (const participationId of this.optedIn) {
      if (!byId.has(participationId)) this.optedIn.delete(participationId);
    }

    for (const key of this.suppressedPairs) {
      const [leftId, rightId] = this.splitKey(key);
      const left = byId.get(leftId);
      const right = byId.get(rightId);
      if (
        !left ||
        !right ||
        !this.isEligible(left) ||
        !this.isEligible(right) ||
        this.distanceTiles(left, right) > PROXIMITY_LEAVE_RADIUS_TILES
      )
        this.suppressedPairs.delete(key);
    }

    for (const [key, pair] of this.pairs) {
      const left = byId.get(pair.memberIds[0]);
      const right = byId.get(pair.memberIds[1]);
      if (!left || !right || !this.isEligible(left) || !this.isEligible(right)) {
        notices.push(this.endPair(key, pair));
        continue;
      }

      if (this.distanceTiles(left, right) <= PROXIMITY_LEAVE_RADIUS_TILES) {
        pair.outsideSince = null;
      } else if (pair.outsideSince === null) {
        pair.outsideSince = now;
      } else if (now - pair.outsideSince >= PROXIMITY_EXIT_DEBOUNCE_MS) {
        notices.push(this.endPair(key, pair));
      }
    }

    const busy = new Set(this.pairByParticipant.keys());
    const eligible = candidates
      .filter((candidate) => this.isEligible(candidate) && !busy.has(candidate.participationId))
      .sort((left, right) => left.participationId.localeCompare(right.participationId));
    const possible: PairCandidate[] = [];
    for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
        const left = eligible[leftIndex]!;
        const right = eligible[rightIndex]!;
        const distance = this.distanceTiles(left, right);
        const key = this.key(left.participationId, right.participationId);
        if (distance <= PROXIMITY_JOIN_RADIUS_TILES && !this.suppressedPairs.has(key))
          possible.push({ left, right, distance, key });
      }
    }
    possible.sort(
      (left, right) => left.distance - right.distance || left.key.localeCompare(right.key),
    );

    for (const candidate of possible) {
      if (busy.has(candidate.left.participationId) || busy.has(candidate.right.participationId))
        continue;
      const pair = this.startPair(candidate);
      this.pairs.set(candidate.key, pair);
      this.pairByParticipant.set(candidate.left.participationId, candidate.key);
      this.pairByParticipant.set(candidate.right.participationId, candidate.key);
      busy.add(candidate.left.participationId);
      busy.add(candidate.right.participationId);
      notices.push(this.notice(pair, 'joining', pair.version));
    }
    return notices;
  }

  leave(
    participationId: string,
    conversationId: string,
    version: number,
  ): { error: 'stale_version' | 'unauthorized' } | { notices: PrivateConversationNotice[] } {
    const key = this.pairByParticipant.get(participationId);
    const pair = key ? this.pairs.get(key) : undefined;
    if (!key || !pair || pair.conversationId !== conversationId || pair.version !== version)
      return { error: 'stale_version' };
    if (!pair.memberIds.includes(participationId)) return { error: 'unauthorized' };
    this.suppressedPairs.add(key);
    return { notices: [this.endPair(key, pair)] };
  }

  mediaPermits() {
    return [...this.pairs.values()].flatMap((pair) =>
      pair.memberIds.map((identity) => ({
        generation: pair.generation,
        identity,
        room: pair.generation,
        version: 1,
        sources: ['microphone'] as const,
      })),
    );
  }

  mediaConversation(participationId: string, conversationId: string, version: number) {
    const key = this.pairByParticipant.get(participationId);
    const pair = key ? this.pairs.get(key) : undefined;
    if (
      !pair ||
      pair.mediaState !== 'active' ||
      !pair.memberIds.includes(participationId) ||
      pair.conversationId !== conversationId ||
      pair.version !== version
    )
      return null;
    return {
      conversationId: pair.conversationId,
      conversationVersion: pair.version,
      generation: pair.generation,
      room: pair.generation,
    };
  }

  activateGeneration(generation: string): PrivateConversationNotice[] {
    const pair = [...this.pairs.values()].find((candidate) => candidate.generation === generation);
    if (!pair || pair.mediaState === 'active') return [];
    pair.mediaState = 'active';
    pair.version += 1;
    return [this.notice(pair, 'active', pair.version)];
  }

  private startPair(candidate: PairCandidate): VoicePair {
    const [left, right] = [candidate.left, candidate.right];
    return {
      conversationId: randomUUID(),
      generation: randomUUID(),
      memberIds: [left.participationId, right.participationId],
      socketIds: [left.socketId, right.socketId],
      participants: [
        { participationId: left.participationId, displayName: left.displayName },
        { participationId: right.participationId, displayName: right.displayName },
      ],
      version: 1,
      outsideSince: null,
      mediaState: 'joining',
    };
  }

  private endPair(key: string, pair: VoicePair): PrivateConversationNotice {
    this.pairs.delete(key);
    this.pairByParticipant.delete(pair.memberIds[0]);
    this.pairByParticipant.delete(pair.memberIds[1]);
    pair.version += 1;
    return this.notice(pair, 'ended', pair.version);
  }

  private notice(pair: VoicePair, state: 'joining' | 'active' | 'ended', version: number) {
    return {
      socketIds: pair.socketIds,
      update: conversationUpdateSchema.parse({
        officeEpoch: this.officeEpoch,
        conversationId: pair.conversationId,
        kind: 'proximity',
        state,
        version,
        generation: pair.generation,
        mediaReady: state === 'active',
        participants: state === 'ended' ? [] : pair.participants,
      }),
    };
  }

  private isEligible(candidate: ProximityCandidate) {
    return this.optedIn.has(candidate.participationId) && candidate.availability === 'available';
  }

  private distanceTiles(left: ProximityCandidate, right: ProximityCandidate) {
    return (
      Math.hypot(left.position.x - right.position.x, left.position.y - right.position.y) /
      this.tileSize
    );
  }

  private key(leftId: string, rightId: string) {
    return leftId < rightId ? `${leftId}|${rightId}` : `${rightId}|${leftId}`;
  }

  private splitKey(key: string): [string, string] {
    const separator = key.indexOf('|');
    return [key.slice(0, separator), key.slice(separator + 1)];
  }
}
