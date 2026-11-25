import {
  officeAccessEndedSchema,
  officeReadySchema,
  officeSocketAuthSchema,
  officeCommandAckSchema,
  officeChatMessageEventSchema,
  spaceMessageSchema,
  type SpaceMessage,
  conversationAreasSchema,
  conversationLeaveEventSchema,
  officeWaveSchema,
  waveEventSchema,
  conversationUpdateSchema,
  meetingInviteEventSchema,
  meetingInvitationResponseEventSchema,
  meetingInvitationCancelEventSchema,
  meetingInvitationSchema,
  meetingJoinEventSchema,
  meetingLeaveEventSchema,
  meetingScreenShareStartEventSchema,
  meetingScreenShareConfirmEventSchema,
  meetingScreenShareStopEventSchema,
  meetingScreenShareFirstFrameEventSchema,
  meetingZonesSchema,
  meetingScreenShareUpdateSchema,
  presenceUpdateEventSchema,
  proximityOptInEventSchema,
  seatSitEventSchema,
  seatStandEventSchema,
  worldInputEventSchema,
  worldSnapshotSchema,
  type OfficeBootstrapResponse,
  type OfficeReady,
  type OfficeMessage,
  type OfficeWave,
  type ConversationUpdate,
  type ConversationAreas,
  type MeetingZones,
  type MeetingScreenShareUpdate,
  type MeetingInvitation,
  type WorldSnapshot,
} from '@gather/contracts';
import { io, type Socket } from 'socket.io-client';
import { ApiClient } from '../../lib/api';
import { applyWorldDelta, isSnapshotMonotonic } from './world-state';

export type OfficeConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'disconnected' | 'ended' | 'error';

export type OfficeClientState = {
  status: OfficeConnectionStatus;
  bootstrap: OfficeBootstrapResponse | null;
  ready: OfficeReady | null;
  snapshot: WorldSnapshot | null;
  message: string;
  chatEvents: OfficeMessage[];
  spaceChatEvents: Record<string, SpaceMessage[]>;
  conversationUpdates: ConversationUpdate[];
  conversationAreas: ConversationAreas | null;
  meetingZones: MeetingZones | null;
  meetingScreenShareUpdates: MeetingScreenShareUpdate[];
  waves: OfficeWave[];
  meetingInvitations: MeetingInvitation[];
};

export type ConversationVersionMarker = {
  readonly officeEpoch: string;
  readonly version: number;
  readonly ended: boolean;
  readonly generation?: string;
};

export function acceptsConversationUpdate(
  previous: ConversationVersionMarker | undefined,
  update: ConversationUpdate,
  officeEpoch: string | null,
  participationId?: string,
) {
  if (officeEpoch && update.officeEpoch !== officeEpoch) return false;
  if (!previous) return true;
  if (previous.officeEpoch !== update.officeEpoch || update.version <= previous.version)
    return false;
  if (!previous.ended) return true;
  return (
    update.kind === 'meeting' &&
    update.state !== 'ended' &&
    Boolean(participationId) &&
    update.participants.some((participant) => participant.participationId === participationId)
  );
}

export function acceptsConversationAreas(
  current: ConversationAreas | null,
  incoming: ConversationAreas,
  officeEpoch: string | null,
) {
  if (officeEpoch && incoming.officeEpoch !== officeEpoch) return false;
  return (
    !current || current.officeEpoch !== incoming.officeEpoch || incoming.sequence > current.sequence
  );
}

export function acceptsMeetingScreenShareUpdate(
  previous:
    Pick<MeetingScreenShareUpdate, 'officeEpoch' | 'conversationId' | 'version'> | undefined,
  update: MeetingScreenShareUpdate,
  officeEpoch: string | null,
) {
  if (!officeEpoch || update.officeEpoch !== officeEpoch) return false;
  if (!previous) return true;
  if (
    previous.officeEpoch !== update.officeEpoch ||
    previous.conversationId !== update.conversationId
  )
    return false;
  return update.version > previous.version;
}

const EMPTY_STATE: OfficeClientState = {
  status: 'idle',
  bootstrap: null,
  ready: null,
  snapshot: null,
  message: '',
  chatEvents: [],
  spaceChatEvents: {},
  conversationUpdates: [],
  conversationAreas: null,
  meetingZones: null,
  meetingScreenShareUpdates: [],
  waves: [],
  meetingInvitations: [],
};

/** Cookie-authenticated HTTP bootstrap followed by a one-use-ticket Socket.IO session. */
export class OfficeClient {
  private state = EMPTY_STATE;
  private socket: Socket | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly conversationVersions = new Map<string, ConversationVersionMarker>();
  private connectGeneration = 0;
  private resyncPending = false;
  private inputSequence = 0;
  private closed = false;
  private readonly waveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly seenWaves = new Set<string>();

  constructor(
    private readonly api: ApiClient,
    private readonly workspaceId: string,
    private readonly officeId: string,
  ) {}

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(next: Partial<OfficeClientState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  async connect() {
    if (this.state.status === 'connecting' || this.state.status === 'connected') return;
    this.closed = false;
    const generation = ++this.connectGeneration;
    this.resyncPending = false;
    this.socket?.disconnect();
    this.socket = null;
    const preserveLastOfficeView = Boolean(
      this.state.bootstrap && this.state.ready && this.state.snapshot,
    );
    this.update({
      status: 'connecting',
      ...(preserveLastOfficeView ? {} : { bootstrap: null, ready: null, snapshot: null }),
      message: '',
      chatEvents: [],
      spaceChatEvents: {},
      conversationUpdates: [],
      conversationAreas: null,
      meetingZones: null,
      meetingScreenShareUpdates: [],
      waves: [],
      meetingInvitations: [],
    });
    this.clearWaves();
    this.conversationVersions.clear();
    try {
      const bootstrap = await this.api.officeBootstrap(this.workspaceId, this.officeId);
      if (!this.isCurrent(generation)) return;
      if (
        bootstrap.workspaceId !== this.workspaceId ||
        bootstrap.officeId !== this.officeId ||
        bootstrap.mapVersion !== bootstrap.manifest.mapVersion
      )
        throw new Error('office_contract_mismatch');
      this.update({ bootstrap });
      const ticket = await this.api.officeJoinTicket(this.workspaceId, this.officeId, {
        mapVersion: bootstrap.mapVersion,
        protocolVersion: bootstrap.protocolVersion,
      });
      if (!this.isCurrent(generation)) return;
      const auth = officeSocketAuthSchema.parse({
        ticket: ticket.ticket,
        protocolVersion: bootstrap.protocolVersion,
      });
      const socket = io('/office', {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
        auth,
      });
      this.socket = socket;
      socket.on('office:ready', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const ready = officeReadySchema.safeParse(raw);
        if (!ready.success || !this.bootstrapMatches(ready.data, bootstrap)) {
          this.fail('The office returned an invalid session.');
          return;
        }
        this.resyncPending = false;
        this.update({
          status: 'connected',
          ready: ready.data,
          snapshot: ready.data.snapshot,
          message: '',
        });
      });
      socket.on('world:delta', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const current = this.state.snapshot;
        if (!current) return;
        const result = applyWorldDelta(current, raw);
        if (result.kind === 'resync') {
          this.requestResync();
          return;
        }
        this.update({
          snapshot: result.snapshot,
          waves: this.wavesForSnapshot(result.snapshot),
        });
      });
      socket.on('office:wave', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const parsed = officeWaveSchema.safeParse(raw);
        const current = this.state.snapshot;
        if (!parsed.success || !current || parsed.data.officeEpoch !== current.officeEpoch) return;
        if (this.seenWaves.has(parsed.data.eventId)) return;
        if (
          !current.participants.some(
            (person) => person.participationId === parsed.data.senderParticipationId,
          ) ||
          !current.participants.some(
            (person) => person.participationId === parsed.data.recipientParticipationId,
          )
        )
          return;
        this.seenWaves.add(parsed.data.eventId);
        if (this.seenWaves.size > 256) this.seenWaves.delete(this.seenWaves.values().next().value!);
        this.update({ waves: [...this.state.waves, parsed.data] });
        const timer = setTimeout(() => {
          this.waveTimers.delete(parsed.data.eventId);
          this.update({
            waves: this.state.waves.filter((wave) => wave.eventId !== parsed.data.eventId),
          });
        }, parsed.data.durationMs);
        this.waveTimers.set(parsed.data.eventId, timer);
      });
      socket.on('chat:message', (raw: unknown) => {
        const parsed = officeChatMessageEventSchema.safeParse(raw);
        if (!parsed.success) return;
        this.update({ chatEvents: mergeChatMessage(this.state.chatEvents, parsed.data) });
      });
      socket.on('space:message', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const parsed = spaceMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const scope = parsed.data.scope;
        const conversationKey =
          scope.kind === 'channel'
            ? `channel:${scope.id}`
            : `dm:${[...scope.userIds].sort().join(':')}`;
        const current = this.state.spaceChatEvents[conversationKey] ?? [];
        this.update({
          spaceChatEvents: {
            ...this.state.spaceChatEvents,
            [conversationKey]: [
              ...current.filter((message) => message.id !== parsed.data.id),
              parsed.data,
            ].slice(-500),
          },
        });
      });
      socket.on('conversation:update', (raw: unknown) => {
        const parsed = conversationUpdateSchema.safeParse(raw);
        if (!parsed.success) return;
        const update = parsed.data;
        const previous = this.conversationVersions.get(update.conversationId);
        if (
          !acceptsConversationUpdate(
            previous,
            update,
            this.state.ready?.snapshot.officeEpoch ?? null,
            this.state.ready?.participationId,
          )
        )
          return;
        this.conversationVersions.set(update.conversationId, {
          officeEpoch: update.officeEpoch,
          version: update.version,
          ended: update.state === 'ended',
          generation: update.generation,
        });
        this.update({
          conversationUpdates: [
            ...this.state.conversationUpdates.filter(
              (candidate) => candidate.conversationId !== update.conversationId,
            ),
            update,
          ].slice(-5),
          meetingScreenShareUpdates:
            update.kind !== 'meeting' ||
            update.state === 'ended' ||
            !update.participants.some(
              (participant) => participant.participationId === this.state.ready?.participationId,
            )
              ? this.state.meetingScreenShareUpdates.filter(
                  (candidate) => candidate.conversationId !== update.conversationId,
                )
              : this.state.meetingScreenShareUpdates,
        });
      });
      socket.on('meeting:screen-share:update', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const parsed = meetingScreenShareUpdateSchema.safeParse(raw);
        if (!parsed.success) return;
        const update = parsed.data;
        const ready = this.state.ready;
        if (
          this.state.status !== 'connected' ||
          !socket.connected ||
          !ready ||
          update.officeEpoch !== ready.snapshot.officeEpoch
        )
          return;
        const meeting = this.state.conversationUpdates.find(
          (candidate) =>
            candidate.kind === 'meeting' && candidate.conversationId === update.conversationId,
        );
        if (
          !meeting ||
          meeting.zoneId !== update.zoneId ||
          meeting.state === 'ended' ||
          !meeting.participants.some(
            (participant) => participant.participationId === ready.participationId,
          )
        )
          return;
        const previous = this.state.meetingScreenShareUpdates.find(
          (candidate) => candidate.conversationId === update.conversationId,
        );
        if (!acceptsMeetingScreenShareUpdate(previous, update, ready.snapshot.officeEpoch)) return;
        this.update({
          meetingScreenShareUpdates: [
            ...this.state.meetingScreenShareUpdates.filter(
              (candidate) => candidate.conversationId !== update.conversationId,
            ),
            update,
          ].slice(-5),
        });
      });
      socket.on('conversation:areas', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const parsed = conversationAreasSchema.safeParse(raw);
        const current = this.state.conversationAreas;
        const epoch = this.state.ready?.snapshot.officeEpoch;
        if (!parsed.success || !acceptsConversationAreas(current, parsed.data, epoch ?? null))
          return;
        this.update({ conversationAreas: parsed.data });
      });
      socket.on('meeting:zones', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const parsed = meetingZonesSchema.safeParse(raw);
        const epoch = this.state.ready?.snapshot.officeEpoch;
        if (!parsed.success || (epoch && parsed.data.officeEpoch !== epoch)) return;
        this.update({ meetingZones: parsed.data });
      });
      socket.on('meeting:invitation', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const parsed = meetingInvitationSchema.safeParse(raw);
        if (!parsed.success || parsed.data.officeEpoch !== this.state.ready?.snapshot.officeEpoch)
          return;
        this.update({
          meetingInvitations: [
            ...this.state.meetingInvitations.filter(
              (invitation) => invitation.invitationId !== parsed.data.invitationId,
            ),
            parsed.data,
          ].slice(-50),
        });
      });
      socket.on('world:snapshot', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const parsed = worldSnapshotSchema.safeParse(raw);
        const current = this.state.snapshot;
        if (!parsed.success || (current && !isSnapshotMonotonic(current, parsed.data))) {
          this.requestResync();
          return;
        }
        this.resyncPending = false;
        this.update({ snapshot: parsed.data, waves: this.wavesForSnapshot(parsed.data) });
      });
      socket.on('office:access-ended', (raw: unknown) => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        const ended = officeAccessEndedSchema.safeParse(raw);
        if (!ended.success) return;
        this.closed = true;
        this.clearWaves();
        socket.disconnect();
        this.update({
          status: 'ended',
          snapshot: null,
          meetingScreenShareUpdates: [],
          message:
            ended.data.reason === 'taken_over'
              ? 'This office session was replaced by another tab.'
              : 'Office access ended. Re-enter to reconnect.',
        });
      });
      socket.on('connect_error', (error) => {
        if (!this.isCurrent(generation)) return;
        this.update({ status: 'error', message: safeSocketMessage(error.message) });
      });
      socket.on('disconnect', () => {
        if (!this.isCurrent(generation) || this.socket !== socket) return;
        this.clearWaves();
        if (!this.closed && this.isCurrent(generation))
          this.update({
            status: 'disconnected',
            meetingInvitations: [],
            meetingScreenShareUpdates: [],
            message: 'Office connection closed.',
          });
      });
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      this.update({ status: 'error', message: safeErrorMessage(error) });
    }
  }

  close() {
    this.closed = true;
    this.connectGeneration += 1;
    this.resyncPending = false;
    this.inputSequence = 0;
    this.conversationVersions.clear();
    this.clearWaves();
    this.socket?.disconnect();
    this.socket = null;
    this.state = EMPTY_STATE;
    for (const listener of this.listeners) listener();
  }

  private bootstrapMatches(ready: OfficeReady, bootstrap: OfficeBootstrapResponse) {
    return (
      ready.workspaceId === bootstrap.workspaceId &&
      ready.officeId === bootstrap.officeId &&
      ready.mapVersion === bootstrap.mapVersion &&
      ready.protocolVersion === bootstrap.protocolVersion
    );
  }

  private isCurrent(generation: number) {
    return !this.closed && generation === this.connectGeneration;
  }

  private requestResync() {
    const socket = this.socket;
    const snapshot = this.state.snapshot;
    if (!socket?.connected || !snapshot || this.resyncPending) return;
    this.resyncPending = true;
    const event = {
      eventId: crypto.randomUUID(),
      officeEpoch: snapshot.officeEpoch,
      payload: { stateVersion: snapshot.stateVersion },
    };
    socket.emit('world:resync', event, (raw: unknown) => {
      const ack = officeCommandAckSchema.safeParse(raw);
      if (!ack.success || !ack.data.ok) this.resyncPending = false;
    });
  }

  move(dx: -1 | 0 | 1, dy: -1 | 0 | 1) {
    const socket = this.socket;
    const ready = this.state.ready;
    const snapshot = this.state.snapshot;
    if (!socket?.connected || !ready || !snapshot || this.state.status !== 'connected') return;
    const participant = snapshot.participants.find(
      (person) => person.participationId === ready.participationId,
    );
    if (!participant) return;
    this.inputSequence = Math.max(this.inputSequence, participant.lastProcessedInputSequence) + 1;
    const event = worldInputEventSchema.parse({
      eventId: crypto.randomUUID(),
      officeEpoch: ready.snapshot.officeEpoch,
      payload: { sequence: this.inputSequence, dx, dy },
    });
    socket.emit('world:input', event);
  }

  setAvailability(availability: 'available' | 'busy' | 'away') {
    return this.sendCommand('presence:update', presenceUpdateEventSchema, {
      availability,
    });
  }

  setProximityOptIn(enabled: boolean) {
    return this.sendCommand('proximity:set-opt-in', proximityOptInEventSchema, { enabled });
  }

  leaveConversation(conversationId: string, conversationVersion: number) {
    return this.sendCommand('conversation:leave', conversationLeaveEventSchema, {
      conversationId,
      conversationVersion,
    });
  }

  joinMeeting(zoneId: string) {
    return this.sendCommand('meeting:join', meetingJoinEventSchema, { zoneId });
  }

  leaveMeeting(conversationId: string, conversationVersion: number) {
    return this.sendCommand('meeting:leave', meetingLeaveEventSchema, {
      conversationId,
      conversationVersion,
    });
  }

  startMeetingScreenShare(conversationId: string, conversationVersion: number, shareId: string) {
    return this.sendCommand('meeting:screen-share:start', meetingScreenShareStartEventSchema, {
      conversationId,
      conversationVersion,
      shareId,
    });
  }

  confirmMeetingScreenShare(conversationId: string, shareId: string) {
    return this.sendCommand('meeting:screen-share:confirm', meetingScreenShareConfirmEventSchema, {
      conversationId,
      shareId,
    });
  }

  stopMeetingScreenShare(conversationId: string, shareId: string) {
    return this.sendCommand('meeting:screen-share:stop', meetingScreenShareStopEventSchema, {
      conversationId,
      shareId,
    });
  }

  reportMeetingScreenShareFirstFrame(conversationId: string, shareId: string, elapsedMs: number) {
    return this.sendCommand(
      'meeting:screen-share:first-frame',
      meetingScreenShareFirstFrameEventSchema,
      {
        conversationId,
        shareId,
        elapsedMs,
      },
    );
  }

  inviteToMeeting(targetParticipationId: string, zoneId: string) {
    return this.sendCommand('meeting:invite', meetingInviteEventSchema, {
      targetParticipationId,
      zoneId,
    });
  }

  respondToMeetingInvitation(invitationId: string, decision: 'accept' | 'decline') {
    return this.sendCommand('meeting:invitation:respond', meetingInvitationResponseEventSchema, {
      invitationId,
      decision,
    });
  }

  cancelMeetingInvitation(invitationId: string) {
    return this.sendCommand('meeting:invitation:cancel', meetingInvitationCancelEventSchema, {
      invitationId,
    });
  }

  sit(seatId: string) {
    return this.sendCommand('seat:sit', seatSitEventSchema, { seatId });
  }

  stand() {
    return this.sendCommand('seat:stand', seatStandEventSchema, {});
  }

  wave(targetParticipationId: string) {
    return this.sendCommand('office:wave', waveEventSchema, { targetParticipationId });
  }

  private clearWaves() {
    for (const timer of this.waveTimers.values()) clearTimeout(timer);
    this.waveTimers.clear();
    this.seenWaves.clear();
    if (this.state.waves.length) this.update({ waves: [] });
  }

  private wavesForSnapshot(snapshot: WorldSnapshot) {
    const waves = this.state.waves.filter(
      (wave) =>
        wave.officeEpoch === snapshot.officeEpoch &&
        snapshot.participants.some(
          (person) => person.participationId === wave.senderParticipationId,
        ) &&
        snapshot.participants.some(
          (person) => person.participationId === wave.recipientParticipationId,
        ),
    );
    const retained = new Set(waves.map((wave) => wave.eventId));
    for (const [eventId, timer] of this.waveTimers) {
      if (retained.has(eventId)) continue;
      clearTimeout(timer);
      this.waveTimers.delete(eventId);
    }
    return waves;
  }

  private sendCommand<T extends { eventId: string; officeEpoch: string }>(
    eventName: string,
    schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
    payload: unknown,
  ) {
    const socket = this.socket;
    const snapshot = this.state.snapshot;
    if (!socket?.connected || this.state.status !== 'connected' || !snapshot)
      return Promise.reject(new Error('office_disconnected'));
    const eventId = crypto.randomUUID();
    const parsed = schema.safeParse({ eventId, officeEpoch: snapshot.officeEpoch, payload });
    if (!parsed.success || !parsed.data) return Promise.reject(new Error('invalid_command'));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('command_timeout')), 3000);
      socket.emit(eventName, parsed.data, (raw: unknown) => {
        clearTimeout(timer);
        const ack = officeCommandAckSchema.safeParse(raw);
        if (!ack.success || ack.data.eventId !== eventId) {
          reject(new Error('invalid_acknowledgement'));
        } else if (!ack.data.ok) {
          reject(new Error(ack.data.error.code));
        } else {
          resolve();
        }
      });
    });
  }

  private fail(message: string) {
    this.closed = true;
    this.socket?.disconnect();
    this.update({ status: 'error', snapshot: null, meetingScreenShareUpdates: [], message });
  }
}

function safeSocketMessage(message: string) {
  return /^[a-z][a-z0-9_]{0,63}$/.test(message)
    ? `Could not enter the office (${message}).`
    : 'Could not enter the office.';
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error && /^[a-z][a-z0-9_]{0,63}$/.test(error.message)
    ? `Could not enter the office (${error.message}).`
    : 'Could not enter the office. Check your connection and try again.';
}

function mergeChatMessage(messages: OfficeMessage[], message: OfficeMessage) {
  return [...messages.filter((candidate) => candidate.id !== message.id), message]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-100);
}
