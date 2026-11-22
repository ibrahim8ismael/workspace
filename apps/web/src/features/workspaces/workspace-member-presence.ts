import type { OfficeClientState } from '../office/office-client';

export type WorkspaceMemberIdentity = { userId: string; displayName: string };
export type OfficePresenceParticipant = {
  participationId: string;
  userId?: string;
  displayName?: string;
  availability: 'available' | 'busy' | 'away';
  reconnecting?: boolean;
};

export type WorkspacePresenceSource = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Pick<OfficeClientState, 'status' | 'snapshot'>;
};

export type WorkspacePresenceSnapshot = {
  connection: 'waiting' | 'live' | 'reconnecting';
  participants: readonly OfficePresenceParticipant[];
};

const OFFLINE_GRACE_MS = 7000;

/**
 * Keeps the people directory on its own, semantic update stream. World position deltas do not
 * notify this store; only membership, availability, reconnect, and grace-period changes do.
 */
export class WorkspacePresenceStore {
  private readonly listeners = new Set<() => void>();
  private readonly members = new Map<string, OfficePresenceParticipant>();
  private readonly offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private currentUserIds = new Set<string>();
  private officeEpoch: string | null = null;
  private connection: WorkspacePresenceSnapshot['connection'] = 'waiting';
  private unsubscribeSource: (() => void) | null = null;
  private value: WorkspacePresenceSnapshot = { connection: 'waiting', participants: [] };

  constructor(
    private readonly source: WorkspacePresenceSource,
    private readonly offlineGraceMs = OFFLINE_GRACE_MS,
  ) {
    const current = source.getSnapshot();
    if (current.status === 'connected' && current.snapshot) this.sync(current);
    else if (current.snapshot && ['connecting', 'disconnected', 'error'].includes(current.status)) {
      this.sync({ ...current, status: 'connected' });
      this.currentUserIds.clear();
      this.connection = 'reconnecting';
      for (const userId of this.members.keys()) this.startOfflineTimer(userId);
      this.publish();
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.value;

  start() {
    if (this.unsubscribeSource) return;
    this.unsubscribeSource = this.source.subscribe(() => this.sync(this.source.getSnapshot()));
    this.sync(this.source.getSnapshot());
  }

  stop() {
    this.unsubscribeSource?.();
    this.unsubscribeSource = null;
    this.clearTimers();
  }

  private sync(state: Pick<OfficeClientState, 'status' | 'snapshot'>) {
    if (state.status === 'idle' || state.status === 'ended') {
      this.reset();
      return;
    }

    if (state.status === 'connected' && state.snapshot) {
      if (this.officeEpoch && this.officeEpoch !== state.snapshot.officeEpoch) this.reset(false);
      this.officeEpoch = state.snapshot.officeEpoch;
      this.currentUserIds = new Set();
      for (const participant of state.snapshot.participants) {
        if (!participant.userId) continue;
        this.currentUserIds.add(participant.userId);
        this.cancelOfflineTimer(participant.userId);
        const next: OfficePresenceParticipant = {
          userId: participant.userId,
          participationId: participant.participationId,
          displayName: participant.displayName,
          availability: participant.availability,
          reconnecting: false,
        };
        const previous = this.members.get(participant.userId);
        if (!previous || !samePresence(previous, next)) this.members.set(participant.userId, next);
      }
      for (const userId of this.members.keys()) {
        if (!this.currentUserIds.has(userId)) this.startOfflineTimer(userId);
      }
      this.connection = 'live';
      this.publish();
      return;
    }

    if (['connecting', 'disconnected', 'error'].includes(state.status) && this.members.size > 0) {
      this.currentUserIds.clear();
      this.connection = 'reconnecting';
      for (const userId of this.members.keys()) this.startOfflineTimer(userId);
      this.publish();
    }
  }

  private startOfflineTimer(userId: string) {
    if (this.offlineTimers.has(userId)) return;
    const participant = this.members.get(userId);
    if (participant && !participant.reconnecting) {
      this.members.set(userId, { ...participant, reconnecting: true });
    }
    const timer = setTimeout(() => {
      this.offlineTimers.delete(userId);
      if (this.currentUserIds.has(userId)) return;
      this.members.delete(userId);
      this.publish();
    }, this.offlineGraceMs);
    this.offlineTimers.set(userId, timer);
  }

  private cancelOfflineTimer(userId: string) {
    const timer = this.offlineTimers.get(userId);
    if (timer) clearTimeout(timer);
    this.offlineTimers.delete(userId);
  }

  private clearTimers() {
    for (const timer of this.offlineTimers.values()) clearTimeout(timer);
    this.offlineTimers.clear();
  }

  private reset(notify = true) {
    this.clearTimers();
    this.members.clear();
    this.currentUserIds.clear();
    this.officeEpoch = null;
    this.connection = 'waiting';
    if (notify) this.publish();
    else this.value = { connection: 'waiting', participants: [] };
  }

  private publish() {
    const participants = [...this.members.values()].sort((left, right) =>
      (left.displayName ?? '').localeCompare(right.displayName ?? ''),
    );
    if (
      this.value.connection === this.connection &&
      this.value.participants.length === participants.length &&
      this.value.participants.every((participant, index) =>
        samePresence(participant, participants[index]!),
      )
    )
      return;
    this.value = { connection: this.connection, participants };
    for (const listener of this.listeners) listener();
  }
}

function samePresence(left: OfficePresenceParticipant, right: OfficePresenceParticipant) {
  return (
    left.userId === right.userId &&
    left.participationId === right.participationId &&
    left.displayName === right.displayName &&
    left.availability === right.availability &&
    Boolean(left.reconnecting) === Boolean(right.reconnecting)
  );
}

export function deriveWorkspacePresence<TMember extends WorkspaceMemberIdentity>(
  members: readonly TMember[],
  participants: readonly OfficePresenceParticipant[],
  meetingParticipationIds: ReadonlySet<string>,
) {
  const uniqueMembers: TMember[] = [];
  const memberIds = new Set<string>();
  for (const member of members) {
    if (memberIds.has(member.userId)) continue;
    memberIds.add(member.userId);
    uniqueMembers.push(member);
  }
  const participantsByUser = new Map(
    participants.flatMap((participant) =>
      participant.userId ? [[participant.userId, participant] as const] : [],
    ),
  );
  const online = uniqueMembers.flatMap((member) => {
    const participant = participantsByUser.get(member.userId);
    return participant
      ? [
          {
            member,
            participant,
            inMeeting: meetingParticipationIds.has(participant.participationId),
          },
        ]
      : [];
  });
  const onlineIds = new Set(online.map(({ member }) => member.userId));
  return {
    online,
    offline: uniqueMembers.filter((member) => !onlineIds.has(member.userId)),
  };
}
