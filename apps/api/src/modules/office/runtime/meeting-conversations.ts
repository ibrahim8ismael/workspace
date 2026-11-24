import { randomUUID } from 'node:crypto';
import { OFFICE_LIMITS, conversationUpdateSchema } from '@gather/contracts';
import type { OfficeZoneDefinition } from '@gather/world';
import type { PrivateConversationNotice, ProximityCandidate } from './proximity-pairing.js';

interface MeetingMember {
  readonly participationId: string;
  readonly socketId: string;
  readonly displayName: string;
  readonly position: { readonly x: number; readonly y: number };
}

interface MeetingConversation {
  readonly zoneId: string;
  readonly conversationId: string;
  generation: string;
  version: number;
  state: 'joining' | 'active';
  members: MeetingMember[];
  pendingMemberIds: Set<string>;
}

export type MeetingJoinResult =
  | { readonly notices: PrivateConversationNotice[] }
  | 'zone_unavailable'
  | 'room_full'
  | 'participation_conflict';

/** Ephemeral fixed-zone meetings owned by the same office runtime as proximity conversations. */
export class MeetingConversations {
  private readonly byZone = new Map<string, MeetingConversation>();
  private readonly byParticipant = new Map<string, string>();

  constructor(
    private readonly officeEpoch: string,
    private readonly zones: readonly OfficeZoneDefinition[],
    private readonly tileSize: number,
  ) {}

  join(participant: ProximityCandidate, zoneId: string): MeetingJoinResult {
    const zone = this.zones.find((candidate) => candidate.zoneId === zoneId);
    if (!zone || participant.availability !== 'available' || !this.isInside(participant, zone))
      return 'zone_unavailable';

    const currentZoneId = this.byParticipant.get(participant.participationId);
    if (currentZoneId) {
      const current = this.byZone.get(currentZoneId);
      if (
        currentZoneId === zoneId &&
        current?.members.some((m) => m.participationId === participant.participationId)
      )
        return { notices: [] };
      return 'participation_conflict';
    }

    const current = this.byZone.get(zoneId);
    if (current && current.members.length >= OFFICE_LIMITS.maxMeetingParticipants)
      return 'room_full';
    const member = this.toMember(participant);
    if (!current) {
      const conversation: MeetingConversation = {
        zoneId,
        conversationId: randomUUID(),
        generation: randomUUID(),
        version: 0,
        state: 'joining',
        members: [],
        pendingMemberIds: new Set(),
      };
      this.byZone.set(zoneId, conversation);
      return { notices: this.addMember(conversation, member) };
    }

    return { notices: this.addMember(current, member) };
  }

  leave(
    participationId: string,
    conversationId: string,
    version: number,
  ): { notices: PrivateConversationNotice[] } | 'stale_version' | 'unauthorized' {
    const zoneId = this.byParticipant.get(participationId);
    const conversation = zoneId ? this.byZone.get(zoneId) : undefined;
    if (
      !conversation ||
      conversation.conversationId !== conversationId ||
      conversation.version !== version
    )
      return 'stale_version';
    const member = conversation.members.find(
      (candidate) => candidate.participationId === participationId,
    );
    if (!member) return 'unauthorized';
    const remaining = conversation.members.filter(
      (candidate) => candidate.participationId !== participationId,
    );
    conversation.members = remaining;
    conversation.pendingMemberIds.delete(participationId);
    this.byParticipant.delete(participationId);
    conversation.version += 1;
    const notices = [this.endNotice(conversation, [member], conversation.version)];
    if (remaining.length === 0) this.byZone.delete(zoneId!);
    else notices.push(...this.rosterNotices(conversation));
    return { notices };
  }

  reconcile(candidates: readonly ProximityCandidate[]): PrivateConversationNotice[] {
    const byId = new Map(candidates.map((candidate) => [candidate.participationId, candidate]));
    const notices: PrivateConversationNotice[] = [];
    for (const conversation of [...this.byZone.values()]) {
      const zone = this.zones.find((candidate) => candidate.zoneId === conversation.zoneId);
      if (!zone) continue;
      const retained = conversation.members.filter((member) => {
        const current = byId.get(member.participationId);
        return current && current.availability === 'available' && this.isInside(current, zone);
      });
      if (retained.length !== conversation.members.length) {
        const removed = conversation.members.filter(
          (member) => !retained.some((keep) => keep.participationId === member.participationId),
        );
        conversation.members = retained;
        conversation.version += 1;
        for (const member of removed) {
          this.byParticipant.delete(member.participationId);
          conversation.pendingMemberIds.delete(member.participationId);
        }
        notices.push(this.endNotice(conversation, removed, conversation.version));
        if (retained.length === 0) this.byZone.delete(conversation.zoneId);
        else notices.push(...this.rosterNotices(conversation));
      } else {
        conversation.members = conversation.members.map((member) => {
          const current = byId.get(member.participationId)!;
          return {
            ...member,
            position: current.position,
            socketId: current.socketId,
            displayName: current.displayName,
          };
        });
      }
    }
    return notices;
  }

  participantIds() {
    return [...this.byParticipant.keys()];
  }

  hasParticipant(participationId: string) {
    return this.byParticipant.has(participationId);
  }

  currentZoneFor(participationId: string) {
    return this.byParticipant.get(participationId) ?? null;
  }

  mediaPermits() {
    return [...this.byZone.values()].flatMap((conversation) =>
      conversation.members.map((member) => ({
        generation: conversation.generation,
        identity: member.participationId,
        room: conversation.generation,
        roomLifecycle: 'stable' as const,
        version: 1,
        sources: ['microphone'] as const,
      })),
    );
  }

  mediaConversation(
    participationId: string,
    conversationId: string,
    version: number,
    candidates: readonly ProximityCandidate[],
  ) {
    const zoneId = this.byParticipant.get(participationId);
    const conversation = zoneId ? this.byZone.get(zoneId) : undefined;
    const participant = candidates.find(
      (candidate) => candidate.participationId === participationId,
    );
    const zone = this.zones.find((candidate) => candidate.zoneId === zoneId);
    if (
      !conversation ||
      conversation.state !== 'active' ||
      conversation.pendingMemberIds.has(participationId) ||
      conversation.conversationId !== conversationId ||
      conversation.version !== version ||
      !participant ||
      !zone ||
      participant.availability !== 'available' ||
      !this.isInside(participant, zone)
    )
      return null;
    return {
      conversationId: conversation.conversationId,
      conversationVersion: conversation.version,
      generation: conversation.generation,
      room: conversation.generation,
      kind: 'meeting' as const,
      zoneId: conversation.zoneId,
    };
  }

  activateGeneration(
    generation: string,
    installedIdentities?: ReadonlySet<string>,
  ): PrivateConversationNotice[] {
    const conversation = [...this.byZone.values()].find(
      (candidate) => candidate.generation === generation,
    );
    if (
      !conversation ||
      (installedIdentities !== undefined &&
        !conversation.members.every((member) => installedIdentities.has(member.participationId))) ||
      (conversation.state === 'active' && conversation.pendingMemberIds.size === 0)
    )
      return [];
    conversation.state = 'active';
    conversation.pendingMemberIds.clear();
    conversation.version += 1;
    return [this.notice(conversation)];
  }

  private addMember(conversation: MeetingConversation, member: MeetingMember) {
    conversation.members = [...conversation.members, member].sort((a, b) =>
      a.participationId.localeCompare(b.participationId),
    );
    this.byParticipant.set(member.participationId, conversation.zoneId);
    conversation.pendingMemberIds.add(member.participationId);
    conversation.version += 1;
    const recipients =
      conversation.state === 'active'
        ? [member.socketId]
        : conversation.members.map((candidate) => candidate.socketId);
    return [this.notice(conversation, recipients, 'joining')];
  }

  private rosterNotices(conversation: MeetingConversation) {
    if (conversation.state === 'joining') return [this.notice(conversation)];
    const pending = conversation.members.filter((member) =>
      conversation.pendingMemberIds.has(member.participationId),
    );
    const installed = conversation.members.filter(
      (member) => !conversation.pendingMemberIds.has(member.participationId),
    );
    return [
      ...(installed.length
        ? [
            this.notice(
              conversation,
              installed.map((member) => member.socketId),
              'active',
            ),
          ]
        : []),
      ...(pending.length
        ? [
            this.notice(
              conversation,
              pending.map((member) => member.socketId),
              'joining',
            ),
          ]
        : []),
    ];
  }

  private notice(
    conversation: MeetingConversation,
    socketIds = conversation.members.map((member) => member.socketId),
    state: MeetingConversation['state'] = conversation.state,
  ): PrivateConversationNotice {
    return {
      socketIds,
      update: conversationUpdateSchema.parse({
        officeEpoch: this.officeEpoch,
        conversationId: conversation.conversationId,
        kind: 'meeting',
        zoneId: conversation.zoneId,
        state,
        version: conversation.version,
        generation: conversation.generation,
        mediaReady: state === 'active',
        participants: conversation.members.map(({ participationId, displayName }) => ({
          participationId,
          displayName,
        })),
      }),
    };
  }

  private endNotice(
    conversation: MeetingConversation,
    members: readonly MeetingMember[],
    version = conversation.version + 1,
  ): PrivateConversationNotice {
    return {
      socketIds: members.map((member) => member.socketId),
      update: conversationUpdateSchema.parse({
        officeEpoch: this.officeEpoch,
        conversationId: conversation.conversationId,
        kind: 'meeting',
        zoneId: conversation.zoneId,
        state: 'ended',
        version,
        generation: conversation.generation,
        mediaReady: false,
        participants: [],
      }),
    };
  }

  private isInside(participant: ProximityCandidate, zone: OfficeZoneDefinition) {
    const tx = Math.floor(participant.position.x / this.tileSize);
    const ty = Math.floor(participant.position.y / this.tileSize);
    const { bounds } = zone;
    return (
      tx >= bounds.tx &&
      tx < bounds.tx + bounds.width &&
      ty >= bounds.ty &&
      ty < bounds.ty + bounds.height
    );
  }

  private toMember(candidate: ProximityCandidate): MeetingMember {
    return {
      participationId: candidate.participationId,
      socketId: candidate.socketId,
      displayName: candidate.displayName,
      position: candidate.position,
    };
  }
}
