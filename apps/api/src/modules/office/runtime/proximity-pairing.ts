import { randomUUID } from 'node:crypto';
import {
  OFFICE_LIMITS,
  conversationAreasSchema,
  conversationUpdateSchema,
} from '@gather/contracts';
import type { ConversationAreas, ConversationUpdate } from '@gather/contracts';

export const PROXIMITY_JOIN_RADIUS_TILES = 2;
export const PROXIMITY_INITIAL_RADIUS_TILES = 2;
export const PROXIMITY_MAX_RADIUS_TILES = 6;
export const PROXIMITY_MAX_PARTICIPANTS = OFFICE_LIMITS.maxProximityParticipants;

export interface ProximityCandidate {
  readonly participationId: string;
  readonly socketId: string;
  readonly displayName: string;
  readonly availability: 'available' | 'busy' | 'away';
  readonly position: { readonly x: number; readonly y: number };
  /** Enclosed room boundary containing the participant, or null in shared office space. */
  readonly roomId?: string | null;
}

export interface PrivateConversationNotice {
  readonly socketIds: readonly string[];
  readonly update: ConversationUpdate;
}

interface GroupMember {
  readonly participationId: string;
  readonly socketId: string;
  readonly displayName: string;
  readonly position: { readonly x: number; readonly y: number };
}

interface VoiceGroup {
  readonly conversationId: string;
  generation: string;
  members: GroupMember[];
  version: number;
  areaVersion: number;
  readonly center: { readonly x: number; readonly y: number };
  radiusTiles: number;
  mediaState: 'joining' | 'active';
  /** The boundary domain in which this conversation was formed. */
  readonly roomId: string | null;
}

interface GroupCandidate {
  readonly left: ProximityCandidate;
  readonly right: ProximityCandidate;
  readonly distance: number;
  readonly key: string;
}

/** One office's deterministic, server-owned proximity conversations and circles. */
export class ProximityPairing {
  private readonly optedIn = new Set<string>();
  private readonly blocked = new Set<string>();
  private readonly groups = new Map<string, VoiceGroup>();
  private readonly groupByParticipant = new Map<string, string>();
  private readonly suppressedPairs = new Set<string>();
  private areaSequence = 0;

  constructor(
    private readonly officeEpoch: string,
    private readonly tileSize: number,
  ) {
    if (!Number.isFinite(tileSize) || tileSize <= 0) throw new Error('invalid_tile_size');
  }

  setOptIn(
    participationId: string,
    enabled: boolean,
    candidates: readonly ProximityCandidate[],
    _now?: number,
  ): PrivateConversationNotice[] {
    void _now;
    if (enabled) this.optedIn.add(participationId);
    else this.optedIn.delete(participationId);
    return this.reconcile(candidates);
  }

  setBlocked(participationId: string, blocked: boolean, candidates: readonly ProximityCandidate[]) {
    if (blocked) this.blocked.add(participationId);
    else this.blocked.delete(participationId);
    return this.reconcile(candidates);
  }

  setBlockedParticipants(
    participationIds: readonly string[],
    candidates: readonly ProximityCandidate[],
  ) {
    this.blocked.clear();
    for (const participationId of participationIds) this.blocked.add(participationId);
    return this.reconcile(candidates);
  }

  reconcile(candidates: readonly ProximityCandidate[]): PrivateConversationNotice[] {
    if (
      this.optedIn.size === 0 &&
      this.groups.size === 0 &&
      this.blocked.size === 0 &&
      this.suppressedPairs.size === 0
    )
      return [];
    const byId = new Map(candidates.map((candidate) => [candidate.participationId, candidate]));
    const notices: PrivateConversationNotice[] = [];
    for (const participationId of this.optedIn) {
      if (!byId.has(participationId)) this.optedIn.delete(participationId);
    }
    for (const participationId of this.blocked) {
      if (!byId.has(participationId)) this.blocked.delete(participationId);
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
        this.distanceTiles(left, right) > PROXIMITY_JOIN_RADIUS_TILES
      ) {
        this.suppressedPairs.delete(key);
      }
    }

    // The fixed center and current radius are the same geometry used for drawing and admission.
    // Crossing its edge removes membership in this reconciliation; there is no positional grace.
    for (const group of [...this.groups.values()]) {
      group.members = group.members.map((member) => {
        const candidate = byId.get(member.participationId);
        return candidate ? { ...member, position: candidate.position } : member;
      });
      const retained = group.members.filter((member) => {
        const candidate = byId.get(member.participationId);
        return (
          candidate !== undefined &&
          this.isEligible(candidate) &&
          (candidate.roomId ?? null) === group.roomId &&
          this.distanceToCenter(candidate, group.center) <= this.radiusWorld(group.radiusTiles)
        );
      });
      if (retained.length !== group.members.length) {
        const shrinkBy = group.members.length - retained.length;
        const target = Math.max(PROXIMITY_INITIAL_RADIUS_TILES, group.radiusTiles - shrinkBy);
        const canShrink = retained.every(
          (member) =>
            this.distanceToCenter(byId.get(member.participationId)!, group.center) <=
            this.radiusWorld(target),
        );
        notices.push(
          ...this.reconfigureGroup(group, retained, canShrink ? target : group.radiusTiles),
        );
      }
    }

    const busy = new Set(this.groupByParticipant.keys());
    const available = candidates
      .filter((candidate) => this.isEligible(candidate) && !busy.has(candidate.participationId))
      .sort((left, right) => left.participationId.localeCompare(right.participationId));

    const possible: GroupCandidate[] = [];
    for (let leftIndex = 0; leftIndex < available.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < available.length; rightIndex += 1) {
        const left = available[leftIndex]!;
        const right = available[rightIndex]!;
        const distance = this.distanceTiles(left, right);
        if ((left.roomId ?? null) !== (right.roomId ?? null)) continue;
        const key = this.key(left.participationId, right.participationId);
        if (distance <= PROXIMITY_JOIN_RADIUS_TILES && !this.suppressedPairs.has(key))
          possible.push({ left, right, distance, key });
      }
    }
    possible.sort(
      (left, right) => left.distance - right.distance || left.key.localeCompare(right.key),
    );

    for (const pair of possible) {
      if (busy.has(pair.left.participationId) || busy.has(pair.right.participationId)) continue;
      const group = this.startGroup(pair.left, pair.right);
      this.groups.set(group.conversationId, group);
      for (const member of group.members) {
        this.groupByParticipant.set(member.participationId, group.conversationId);
        busy.add(member.participationId);
      }
      this.areaSequence += 1;
      notices.push(this.notice(group, 'joining', group.version));
    }

    // A candidate is assigned to at most one overlapping area. Nearest fixed center wins, then ID.
    for (const candidate of candidates
      .filter((person) => this.isEligible(person) && !busy.has(person.participationId))
      .sort((left, right) => left.participationId.localeCompare(right.participationId))) {
      const accepting = [...this.groups.values()]
        .filter(
          (group) =>
            group.roomId === (candidate.roomId ?? null) &&
            group.members.length < PROXIMITY_MAX_PARTICIPANTS &&
            this.distanceToCenter(candidate, group.center) <= this.radiusWorld(group.radiusTiles) &&
            group.members.every(
              (member) =>
                !this.suppressedPairs.has(
                  this.key(candidate.participationId, member.participationId),
                ),
            ),
        )
        .sort(
          (left, right) =>
            this.distanceToCenter(candidate, left.center) -
              this.distanceToCenter(candidate, right.center) ||
            left.conversationId.localeCompare(right.conversationId),
        )[0];
      if (!accepting) continue;
      const radius = Math.min(PROXIMITY_MAX_RADIUS_TILES, accepting.radiusTiles + 1);
      notices.push(
        ...this.reconfigureGroup(
          accepting,
          [...accepting.members, this.toGroupMember(candidate)],
          radius,
        ),
      );
      busy.add(candidate.participationId);
    }

    return notices;
  }

  leave(
    participationId: string,
    conversationId: string,
    version: number,
  ): { error: 'stale_version' | 'unauthorized' } | { notices: PrivateConversationNotice[] } {
    const currentConversationId = this.groupByParticipant.get(participationId);
    const group = currentConversationId ? this.groups.get(currentConversationId) : undefined;
    if (!group || group.conversationId !== conversationId || group.version !== version)
      return { error: 'stale_version' };
    if (!group.members.some((member) => member.participationId === participationId))
      return { error: 'unauthorized' };
    for (const member of group.members) {
      if (member.participationId !== participationId)
        this.suppressedPairs.add(this.key(participationId, member.participationId));
    }
    const retained = group.members.filter((member) => member.participationId !== participationId);
    const shrinkBy = group.members.length - retained.length;
    const target = Math.max(PROXIMITY_INITIAL_RADIUS_TILES, group.radiusTiles - shrinkBy);
    return {
      notices: this.reconfigureGroup(
        group,
        retained,
        this.canContain(retained, group.center, target) ? target : group.radiusTiles,
      ),
    };
  }

  currentAreas(): ConversationAreas {
    return conversationAreasSchema.parse({
      officeEpoch: this.officeEpoch,
      sequence: this.areaSequence,
      areas: [...this.groups.values()]
        .sort((left, right) => left.conversationId.localeCompare(right.conversationId))
        .map((group) => ({
          areaId: group.conversationId,
          version: group.areaVersion,
          shape: 'circle' as const,
          center: group.center,
          radius: this.radiusWorld(group.radiusTiles),
          state: 'active' as const,
        })),
    });
  }

  hasParticipant(participationId: string) {
    return this.groupByParticipant.has(participationId);
  }

  mediaPermits() {
    return [...this.groups.values()].flatMap((group) =>
      group.members.map((member) => ({
        generation: group.generation,
        identity: member.participationId,
        room: group.generation,
        roomLifecycle: 'rotating' as const,
        version: 1,
        sources: ['microphone'] as const,
      })),
    );
  }

  mediaConversation(participationId: string, conversationId: string, version: number) {
    const currentConversationId = this.groupByParticipant.get(participationId);
    const group = currentConversationId ? this.groups.get(currentConversationId) : undefined;
    if (
      !group ||
      group.mediaState !== 'active' ||
      group.conversationId !== conversationId ||
      group.version !== version
    )
      return null;
    return {
      conversationId: group.conversationId,
      conversationVersion: group.version,
      generation: group.generation,
      room: group.generation,
      kind: 'proximity' as const,
      zoneId: undefined,
    };
  }

  activateGeneration(generation: string): PrivateConversationNotice[] {
    const group = [...this.groups.values()].find(
      (candidate) => candidate.generation === generation,
    );
    if (!group || group.mediaState === 'active') return [];
    group.mediaState = 'active';
    group.version += 1;
    return [this.notice(group, 'active', group.version)];
  }

  private startGroup(left: ProximityCandidate, right: ProximityCandidate): VoiceGroup {
    const members = [this.toGroupMember(left), this.toGroupMember(right)].sort((a, b) =>
      a.participationId.localeCompare(b.participationId),
    );
    return {
      conversationId: randomUUID(),
      generation: randomUUID(),
      members,
      version: 1,
      areaVersion: 1,
      center: {
        x: (left.position.x + right.position.x) / 2,
        y: (left.position.y + right.position.y) / 2,
      },
      radiusTiles: PROXIMITY_INITIAL_RADIUS_TILES,
      mediaState: 'joining',
      roomId: left.roomId ?? null,
    };
  }

  private reconfigureGroup(
    group: VoiceGroup,
    members: readonly GroupMember[],
    radiusTiles: number,
  ) {
    const orderedMembers = [...members].sort((left, right) =>
      left.participationId.localeCompare(right.participationId),
    );
    if (orderedMembers.length < 2) return this.endGroup(group);

    const oldMembers = group.members;
    const oldGeneration = group.generation;
    const version = group.version + 1;
    const currentIds = new Set(orderedMembers.map((member) => member.participationId));
    const removed = oldMembers.filter((member) => !currentIds.has(member.participationId));
    for (const member of oldMembers) this.groupByParticipant.delete(member.participationId);

    group.generation = randomUUID();
    group.members = orderedMembers;
    group.version = version;
    group.areaVersion += 1;
    group.radiusTiles = Math.max(
      PROXIMITY_INITIAL_RADIUS_TILES,
      Math.min(PROXIMITY_MAX_RADIUS_TILES, radiusTiles),
    );
    group.mediaState = 'joining';
    for (const member of orderedMembers)
      this.groupByParticipant.set(member.participationId, group.conversationId);
    this.areaSequence += 1;

    const notices: PrivateConversationNotice[] = [this.notice(group, 'joining', version)];
    if (removed.length > 0) {
      notices.push(
        this.endNotice(
          group.conversationId,
          oldGeneration,
          version,
          removed.map((member) => member.socketId),
        ),
      );
    }
    return notices;
  }

  private endGroup(group: VoiceGroup) {
    this.groups.delete(group.conversationId);
    for (const member of group.members) this.groupByParticipant.delete(member.participationId);
    this.areaSequence += 1;
    return [
      this.endNotice(
        group.conversationId,
        group.generation,
        group.version + 1,
        group.members.map((member) => member.socketId),
      ),
    ];
  }

  private notice(group: VoiceGroup, state: 'joining' | 'active', version: number) {
    return {
      socketIds: group.members.map((member) => member.socketId),
      update: conversationUpdateSchema.parse({
        officeEpoch: this.officeEpoch,
        conversationId: group.conversationId,
        kind: 'proximity',
        state,
        version,
        generation: group.generation,
        mediaReady: state === 'active',
        participants: group.members.map(({ participationId, displayName }) => ({
          participationId,
          displayName,
        })),
      }),
    };
  }

  private endNotice(
    conversationId: string,
    generation: string,
    version: number,
    socketIds: readonly string[],
  ): PrivateConversationNotice {
    return {
      socketIds,
      update: conversationUpdateSchema.parse({
        officeEpoch: this.officeEpoch,
        conversationId,
        kind: 'proximity',
        state: 'ended',
        version,
        generation,
        mediaReady: false,
        participants: [],
      }),
    };
  }

  private canContain(
    members: readonly GroupMember[],
    center: { x: number; y: number },
    radiusTiles: number,
  ) {
    return members.every(
      (member) => this.distancePoints(member.position, center) <= this.radiusWorld(radiusTiles),
    );
  }

  private toGroupMember(candidate: ProximityCandidate): GroupMember {
    return {
      participationId: candidate.participationId,
      socketId: candidate.socketId,
      displayName: candidate.displayName,
      position: candidate.position,
    };
  }

  private isEligible(candidate: ProximityCandidate) {
    return (
      this.optedIn.has(candidate.participationId) &&
      !this.blocked.has(candidate.participationId) &&
      candidate.availability === 'available'
    );
  }

  private distanceTiles(left: ProximityCandidate, right: ProximityCandidate) {
    return (
      Math.hypot(left.position.x - right.position.x, left.position.y - right.position.y) /
      this.tileSize
    );
  }

  private distanceToCenter(
    candidate: ProximityCandidate,
    point: { readonly x: number; readonly y: number },
  ) {
    return this.distancePoints(candidate.position, point);
  }

  private distancePoints(
    candidate: { readonly x: number; readonly y: number },
    point: { readonly x: number; readonly y: number },
  ) {
    return Math.hypot(candidate.x - point.x, candidate.y - point.y);
  }

  private radiusWorld(radiusTiles: number) {
    return radiusTiles * this.tileSize;
  }

  private key(leftId: string, rightId: string) {
    return leftId < rightId ? `${leftId}|${rightId}` : `${rightId}|${leftId}`;
  }

  private splitKey(key: string): [string, string] {
    const separator = key.indexOf('|');
    return [key.slice(0, separator), key.slice(separator + 1)];
  }
}
