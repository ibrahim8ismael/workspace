import {
  officeAccessEndedSchema,
  officeReadySchema,
  officeSocketAuthSchema,
  officeCommandAckSchema,
  worldSnapshotSchema,
  type OfficeBootstrapResponse,
  type OfficeReady,
  type WorldSnapshot,
} from '@gather/contracts';
import { io, type Socket } from 'socket.io-client';
import { ApiClient } from '../../lib/api';
import { applyWorldDelta } from './world-state';

export type OfficeConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'disconnected' | 'ended' | 'error';

export type OfficeClientState = {
  status: OfficeConnectionStatus;
  bootstrap: OfficeBootstrapResponse | null;
  ready: OfficeReady | null;
  snapshot: WorldSnapshot | null;
  message: string;
};

const EMPTY_STATE: OfficeClientState = {
  status: 'idle',
  bootstrap: null,
  ready: null,
  snapshot: null,
  message: '',
};

/** Cookie-authenticated HTTP bootstrap followed by a one-use-ticket Socket.IO session. */
export class OfficeClient {
  private state = EMPTY_STATE;
  private socket: Socket | null = null;
  private readonly listeners = new Set<() => void>();
  private connectGeneration = 0;
  private resyncPending = false;
  private closed = false;

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
    this.update({
      status: 'connecting',
      bootstrap: null,
      ready: null,
      snapshot: null,
      message: '',
    });
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
        const current = this.state.snapshot;
        if (!current) return;
        const result = applyWorldDelta(current, raw);
        if (result.kind === 'resync') {
          this.requestResync();
          return;
        }
        this.update({ snapshot: result.snapshot });
      });
      socket.on('world:snapshot', (raw: unknown) => {
        const parsed = worldSnapshotSchema.safeParse(raw);
        const current = this.state.snapshot;
        if (!parsed.success || (current && parsed.data.officeEpoch !== current.officeEpoch)) {
          this.requestResync();
          return;
        }
        this.resyncPending = false;
        this.update({ snapshot: parsed.data });
      });
      socket.on('office:access-ended', (raw: unknown) => {
        const ended = officeAccessEndedSchema.safeParse(raw);
        if (!ended.success) return;
        this.closed = true;
        socket.disconnect();
        this.update({
          status: 'ended',
          snapshot: null,
          message:
            ended.data.reason === 'taken_over'
              ? 'This office session was replaced by another tab.'
              : 'Office access ended. Re-enter to reconnect.',
        });
      });
      socket.on('connect_error', (error) => {
        if (!this.isCurrent(generation)) return;
        this.update({ status: 'error', snapshot: null, message: safeSocketMessage(error.message) });
      });
      socket.on('disconnect', () => {
        if (!this.closed && this.isCurrent(generation))
          this.update({
            status: 'disconnected',
            snapshot: null,
            message: 'Office connection closed.',
          });
      });
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      this.update({ status: 'error', snapshot: null, message: safeErrorMessage(error) });
    }
  }

  close() {
    this.closed = true;
    this.connectGeneration += 1;
    this.resyncPending = false;
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

  private fail(message: string) {
    this.closed = true;
    this.socket?.disconnect();
    this.update({ status: 'error', snapshot: null, message });
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
