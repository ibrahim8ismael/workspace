import { randomUUID } from 'node:crypto';
import { OFFICE_LIMITS, conversationUpdateSchema } from '@gather/contracts';
import type { ConversationUpdate } from '@gather/contracts';

export const PROXIMITY_JOIN_RADIUS_TILES = 2;
export const PROXIMITY_LEAVE_RADIUS_TILES = 3;
export const PROXIMITY_EXIT_DEBOUNCE_MS = 500;
export const PROXIMITY_MAX_PARTICIPANTS = OFFICE_LIMITS.maxProximityParticipants;

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

interface GroupMember {
  readonly participationId: string;
  readonly socketId: string;
  readonly displayName: string;
}

interface VoiceGroup {
  readonly conversationId: string;
  generation: string;
  members: GroupMember[];
  version: number;
  outsideSince: Map<string, number>;
  mediaState: 'joining' | 'active';
}

interface GroupCandidate {
  readonly left: ProximityCandidate;
  readonly right: ProximityCandidate;
  readonly distance: number;
  readonly key: string;
}

interface GroupJoinCandidate {
  readonly participationId: string;
  readonly conversationId: string;
  readonly distance: number;
}

/** Deterministic private proximity groups for one office epoch. */
export class ProximityPairing {
  private readonly optedIn = new Set<string>();
  private readonly groups = new Map<string, VoiceGroup>();
  private readonly groupByParticipant = new Map<string, string>();
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

    for (const group of [...this.groups.values()]) {
      const eligibleMembers = group.members.filter((member) => {
        const candidate = byId.get(member.participationId);
        return candidate && this.isEligible(candidate);
      });
      if (eligibleMembers.length !== group.members.length) {
        notices.push(...this.reconfigureGroup(group, eligibleMembers));
        continue;
      }

      const center = this.groupCenter(group.members, byId);
      const outside = new Set<string>();
      for (const member of group.members) {
        const candidate = byId.get(member.participationId)!;
        if (this.distanceTilesToPoint(candidate, center) > PROXIMITY_LEAVE_RADIUS_TILES) {
          outside.add(member.participationId);
          if (!group.outsideSince.has(member.participationId))
            group.outsideSince.set(member.participationId, now);
        } else {
          group.outsideSince.delete(member.participationId);
        }
      }

      const expired = group.members.filter((member) => {
        const outsideSince = group.outsideSince.get(member.participationId);
        return (
          outside.has(member.participationId) &&
          outsideSince !== undefined &&
          now - outsideSince >= PROXIMITY_EXIT_DEBOUNCE_MS
        );
      });
      if (expired.length > 0) {
        const removed = new Set(expired.map((member) => member.participationId));
        notices.push(
          ...this.reconfigureGroup(
            group,
            group.members.filter((member) => !removed.has(member.participationId)),
          ),
        );
      }
    }

    const busy = new Set(this.groupByParticipant.keys());
    notices.push(...this.joinCandidatesIntoGroups(candidates, byId, busy));

    const available = candidates
      .filter((candidate) => this.isEligible(candidate) && !busy.has(candidate.participationId))
      .sort((left, right) => left.participationId.localeCompare(right.participationId));
    const possible: GroupCandidate[] = [];
    for (let leftIndex = 0; leftIndex < available.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < available.length; rightIndex += 1) {
        const left = available[leftIndex]!;
        const right = available[rightIndex]!;
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
      const group = this.startGroup([candidate.left, candidate.right]);
      this.groups.set(group.conversationId, group);
      for (const member of group.members)
        this.groupByParticipant.set(member.participationId, group.conversationId);
      busy.add(candidate.left.participationId);
      busy.add(candidate.right.participationId);
      notices.push(this.notice(group, 'joining', group.version));
    }
    // If several opted-in users become eligible in one world reconciliation, the initial pair
    // and any remaining candidates must be grouped in this same pass.
    notices.push(...this.joinCandidatesIntoGroups(candidates, byId, busy));
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
    const leaving = group.members.find((member) => member.participationId === participationId);
    if (!leaving) return { error: 'unauthorized' };
    for (const member of group.members) {
      if (member.participationId !== participationId)
        this.suppressedPairs.add(this.key(participationId, member.participationId));
    }
    return {
      notices: this.reconfigureGroup(
        group,
        group.members.filter((member) => member.participationId !== participationId),
      ),
    };
  }

  mediaPermits() {
    return [...this.groups.values()].flatMap((group) =>
      group.members.map((member) => ({
        generation: group.generation,
        identity: member.participationId,
        room: group.generation,
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
      !group.members.some((member) => member.participationId === participationId) ||
      group.conversationId !== conversationId ||
      group.version !== version
    )
      return null;
    return {
      conversationId: group.conversationId,
      conversationVersion: group.version,
      generation: group.generation,
      room: group.generation,
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

  private startGroup(candidates: readonly ProximityCandidate[]): VoiceGroup {
    const members = candidates.map((candidate) => this.toGroupMember(candidate));
    members.sort((left, right) => left.participationId.localeCompare(right.participationId));
    return {
      conversationId: randomUUID(),
      generation: randomUUID(),
      members,
      version: 1,
      outsideSince: new Map(),
      mediaState: 'joining',
    };
  }

  private reconfigureGroup(group: VoiceGroup, members: readonly GroupMember[]) {
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
    group.outsideSince = new Map();
    group.mediaState = 'joining';
    for (const member of orderedMembers)
      this.groupByParticipant.set(member.participationId, group.conversationId);

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

  private canJoinGroup(
    candidate: ProximityCandidate,
    members: readonly GroupMember[],
    candidates: ReadonlyMap<string, ProximityCandidate>,
  ) {
    if (members.length === 0) return false;
    for (const member of members) {
      if (
        !candidates.has(member.participationId) ||
        this.suppressedPairs.has(this.key(candidate.participationId, member.participationId))
      )
        return false;
    }
    return (
      this.distanceTilesToPoint(candidate, this.groupCenter(members, candidates)) <=
      PROXIMITY_JOIN_RADIUS_TILES
    );
  }

  private joinCandidatesIntoGroups(
    candidates: readonly ProximityCandidate[],
    byId: ReadonlyMap<string, ProximityCandidate>,
    busy: Set<string>,
  ) {
    const unmatched = candidates
      .filter((candidate) => this.isEligible(candidate) && !busy.has(candidate.participationId))
      .sort((left, right) => left.participationId.localeCompare(right.participationId));
    const proposals: GroupJoinCandidate[] = [];
    for (const candidate of unmatched) {
      for (const group of this.groups.values()) {
        if (group.members.length >= PROXIMITY_MAX_PARTICIPANTS) continue;
        if (!this.canJoinGroup(candidate, group.members, byId)) continue;
        proposals.push({
          participationId: candidate.participationId,
          conversationId: group.conversationId,
          distance: this.distanceTilesToPoint(candidate, this.groupCenter(group.members, byId)),
        });
      }
    }
    proposals.sort(
      (left, right) =>
        left.distance - right.distance ||
        left.conversationId.localeCompare(right.conversationId) ||
        left.participationId.localeCompare(right.participationId),
    );

    const proposedMembers = new Map(
      [...this.groups.values()].map((group) => [group.conversationId, [...group.members]]),
    );
    const changedGroups = new Set<string>();
    for (const proposal of proposals) {
      if (busy.has(proposal.participationId)) continue;
      const group = this.groups.get(proposal.conversationId);
      const members = proposedMembers.get(proposal.conversationId);
      const candidate = byId.get(proposal.participationId);
      if (
        !group ||
        !members ||
        !candidate ||
        members.length >= PROXIMITY_MAX_PARTICIPANTS ||
        !this.canJoinGroup(candidate, members, byId)
      )
        continue;
      members.push(this.toGroupMember(candidate));
      members.sort((left, right) => left.participationId.localeCompare(right.participationId));
      changedGroups.add(group.conversationId);
      busy.add(candidate.participationId);
    }

    const notices: PrivateConversationNotice[] = [];
    for (const conversationId of changedGroups) {
      const group = this.groups.get(conversationId);
      const members = proposedMembers.get(conversationId);
      if (group && members) notices.push(...this.reconfigureGroup(group, members));
    }
    return notices;
  }

  private groupCenter(
    members: readonly GroupMember[],
    candidates: ReadonlyMap<string, ProximityCandidate>,
  ) {
    const positions = members.map((member) => candidates.get(member.participationId)!.position);
    return {
      x: positions.reduce((total, position) => total + position.x, 0) / positions.length,
      y: positions.reduce((total, position) => total + position.y, 0) / positions.length,
    };
  }

  private toGroupMember(candidate: ProximityCandidate): GroupMember {
    return {
      participationId: candidate.participationId,
      socketId: candidate.socketId,
      displayName: candidate.displayName,
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

  private distanceTilesToPoint(
    candidate: ProximityCandidate,
    point: { readonly x: number; readonly y: number },
  ) {
    return (
      Math.hypot(candidate.position.x - point.x, candidate.position.y - point.y) / this.tileSize
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
