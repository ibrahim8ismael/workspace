import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldSnapshot } from '@gather/contracts';
import type { OfficeClientState } from '../src/features/office/office-client';
import {
  deriveWorkspacePresence,
  WorkspacePresenceStore,
  type WorkspacePresenceSource,
} from '../src/features/workspaces/workspace-member-presence';

const member = { userId: 'u1', displayName: 'Ava' };
const onlineParticipant = {
  userId: 'u1',
  participationId: 'p1',
  displayName: 'Ava',
  availability: 'available' as const,
};
type PresenceParticipant = {
  userId: string;
  participationId: string;
  displayName: string;
  availability: 'available' | 'busy' | 'away';
};

describe('workspace member office presence', () => {
  afterEach(() => vi.useRealTimers());

  it('deduplicates members and merges live availability and meeting status by tenant identity', () => {
    const members = [
      member,
      { userId: 'u1', displayName: 'Duplicate row' },
      { userId: 'u2', displayName: 'Noah' },
    ];
    const participants = [
      { ...onlineParticipant, availability: 'busy' as const },
      {
        userId: 'not-a-member',
        participationId: 'p2',
        displayName: 'Unknown',
        availability: 'available' as const,
      },
    ];
    const result = deriveWorkspacePresence(members, participants, new Set(['p1']));
    expect(result.online).toEqual([{ member, participant: participants[0], inMeeting: true }]);
    expect(result.offline).toEqual([{ userId: 'u2', displayName: 'Noah' }]);
  });

  it('keeps confirmed presence through a brief disconnect and reconciles a fresh snapshot', () => {
    vi.useFakeTimers();
    const source = new MutablePresenceSource('connected', [onlineParticipant]);
    const store = new WorkspacePresenceStore(source, 7000);
    store.start();

    source.set('disconnected', null);
    expect(store.getSnapshot().connection).toBe('reconnecting');
    expect(store.getSnapshot().participants).toEqual([
      { ...onlineParticipant, reconnecting: true },
    ]);

    source.set('connected', [onlineParticipant]);
    vi.advanceTimersByTime(7000);
    expect(store.getSnapshot()).toEqual({
      connection: 'live',
      participants: [{ ...onlineParticipant, reconnecting: false }],
    });
    store.stop();
  });

  it('rehydrates the last snapshot when the directory remounts during reconnection', () => {
    vi.useFakeTimers();
    const source = new MutablePresenceSource('disconnected', [onlineParticipant]);
    const store = new WorkspacePresenceStore(source, 7000);
    store.start();

    expect(store.getSnapshot().connection).toBe('reconnecting');
    expect(store.getSnapshot().participants[0]?.reconnecting).toBe(true);
    vi.advanceTimersByTime(7000);
    expect(store.getSnapshot().participants).toEqual([]);
    store.stop();
  });

  it('moves a member offline only after the seven second authoritative departure grace', () => {
    vi.useFakeTimers();
    const source = new MutablePresenceSource('connected', [onlineParticipant]);
    const store = new WorkspacePresenceStore(source, 7000);
    store.start();

    source.set('connected', []);
    expect(store.getSnapshot().participants[0]?.reconnecting).toBe(true);
    vi.advanceTimersByTime(6999);
    expect(store.getSnapshot().participants).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot().participants).toEqual([]);
    store.stop();
  });

  it('does not publish movement-only snapshot changes to the directory', () => {
    const source = new MutablePresenceSource('connected', [onlineParticipant]);
    const store = new WorkspacePresenceStore(source);
    store.start();
    let updates = 0;
    const unsubscribe = store.subscribe(() => {
      updates += 1;
    });

    source.move();
    expect(updates).toBe(0);
    source.set('connected', [{ ...onlineParticipant, availability: 'away' }]);
    expect(updates).toBe(1);
    unsubscribe();
    store.stop();
  });
});

class MutablePresenceSource implements WorkspacePresenceSource {
  private readonly listeners = new Set<() => void>();
  private state: Pick<OfficeClientState, 'status' | 'snapshot'>;

  constructor(
    status: OfficeClientState['status'],
    participants: readonly PresenceParticipant[] | null,
  ) {
    this.state = { status, snapshot: snapshot(participants) };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  set(status: OfficeClientState['status'], participants: readonly PresenceParticipant[] | null) {
    this.state = { status, snapshot: snapshot(participants) };
    for (const listener of this.listeners) listener();
  }

  move() {
    const current = this.state.snapshot!;
    const moved = {
      ...current.participants[0]!,
      position: {
        x: current.participants[0]!.position.x + 32,
        y: current.participants[0]!.position.y,
      },
    };
    this.state = {
      status: 'connected',
      snapshot: { ...current, stateVersion: current.stateVersion + 1, participants: [moved] },
    };
    for (const listener of this.listeners) listener();
  }
}

function snapshot(participants: readonly PresenceParticipant[] | null): WorldSnapshot | null {
  return participants
    ? {
        officeEpoch: 'epoch',
        stateVersion: 1,
        serverTime: 1,
        participants: participants.map((participant) => ({
          ...participant,
          appearance: { bodyId: 'worker', paletteId: 'teal' },
          position: { x: 10, y: 10 },
          facing: 'south',
          seatId: null,
          lastProcessedInputSequence: 0,
        })),
        seats: [],
      }
    : null;
}
