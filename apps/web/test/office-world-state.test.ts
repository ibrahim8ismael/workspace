import { describe, expect, it } from 'vitest';
import type { WorldSnapshot } from '@gather/contracts';
import { applyWorldDelta } from '../src/features/office/world-state';

const epoch = '3c2c80f4-e83a-4dc5-a733-cfe126a5ec94';
const aliceId = '5cd178a6-d921-4a92-9e0f-816c830d7361';

const alice = {
  participationId: aliceId,
  displayName: 'Alice Example',
  appearance: { bodyId: 'default', paletteId: 'default' },
  position: { x: 96, y: 128 },
  facing: 'south' as const,
  availability: 'available' as const,
  seatId: null,
  lastProcessedInputSequence: 0,
};

const snapshot: WorldSnapshot = {
  officeEpoch: epoch,
  stateVersion: 0,
  serverTime: 100,
  participants: [alice],
  seats: [],
};

describe('applyWorldDelta', () => {
  it('applies a contiguous participant update', () => {
    const result = applyWorldDelta(snapshot, {
      officeEpoch: epoch,
      baseVersion: 0,
      stateVersion: 1,
      serverTime: 120,
      participants: [{ ...alice, position: { x: 128, y: 128 } }],
      removedParticipationIds: [],
      seats: [],
    });

    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.snapshot.stateVersion).toBe(1);
      expect(result.snapshot.participants[0]?.position.x).toBe(128);
    }
  });

  it('preserves the last valid snapshot and requests recovery for a gap', () => {
    const result = applyWorldDelta(snapshot, {
      officeEpoch: epoch,
      baseVersion: 1,
      stateVersion: 2,
      serverTime: 120,
      participants: [],
      removedParticipationIds: [],
      seats: [],
    });

    expect(result).toEqual({ kind: 'resync', snapshot });
  });

  it('rejects a delta from a different runtime epoch', () => {
    const result = applyWorldDelta(snapshot, {
      officeEpoch: 'c202a2f9-d489-4da2-b6a8-f8b658f2268a',
      baseVersion: 0,
      stateVersion: 1,
      serverTime: 120,
      participants: [],
      removedParticipationIds: [],
      seats: [],
    });

    expect(result).toEqual({ kind: 'resync', snapshot });
  });
});
