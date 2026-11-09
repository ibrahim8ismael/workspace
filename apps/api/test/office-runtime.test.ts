import { describe, expect, it } from 'vitest';
import { OFFICE_LIMITS } from '@gather/contracts';
import { OfficeRuntimeService } from '../dist/modules/office/runtime/office-runtime.service.js';
import type { ConsumedOfficeTicket } from '../dist/modules/office/runtime/office-runtime.service.js';

function ticket(userNumber: number): ConsumedOfficeTicket {
  return {
    userId: `user-${userNumber}`,
    displayName: `User ${userNumber}`,
    sessionId: `session-${userNumber}`,
    workspaceId: '10000000-0000-4000-8000-000000000001',
    officeId: '20000000-0000-4000-8000-000000000001',
    officeEpoch: '5fc87e60-62b8-4cf9-8edc-dcaa2a1d8249',
    mapVersion: `commons-v1-${'a'.repeat(64)}`,
    protocolVersion: 1,
  };
}

describe('office runtime reservations', () => {
  it('caps admission, prevents duplicate actors and frees capacity on release', () => {
    const runtime = new OfficeRuntimeService();
    const reservations = Array.from({ length: OFFICE_LIMITS.maxParticipants }, (_, index) =>
      runtime.reserve(ticket(index + 1), `socket-${index + 1}`),
    );
    expect(reservations.at(-1)?.ready.snapshot.participants).toHaveLength(
      OFFICE_LIMITS.maxParticipants,
    );

    expect(() => runtime.reserve(ticket(1), 'duplicate-socket')).toThrow('participation_conflict');
    expect(() =>
      runtime.reserve(ticket(OFFICE_LIMITS.maxParticipants + 1), 'overflow-socket'),
    ).toThrow('room_full');

    const first = reservations[0]!;
    const removed = runtime.release(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'user-1',
      'socket-1',
      first.participationId,
    );
    expect(removed?.delta.removedParticipationIds).toEqual([first.participationId]);
    expect(() =>
      runtime.reserve(ticket(OFFICE_LIMITS.maxParticipants + 1), 'overflow-socket'),
    ).not.toThrow();
  });
});
