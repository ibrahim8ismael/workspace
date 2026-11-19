import { describe, expect, it } from 'vitest';
import { deriveWorkspacePresence } from '../src/features/workspaces/workspace-member-presence';

describe('workspace member office presence', () => {
  it('deduplicates members and merges live availability and meeting status by tenant identity', () => {
    const members = [
      { userId: 'u1', displayName: 'Ava' },
      { userId: 'u1', displayName: 'Duplicate row' },
      { userId: 'u2', displayName: 'Noah' },
    ];
    const participants = [
      { userId: 'u1', participationId: 'p1', availability: 'busy' as const },
      { userId: 'not-a-member', participationId: 'p2', availability: 'available' as const },
    ];
    const result = deriveWorkspacePresence(members, participants, new Set(['p1']));
    expect(result.online).toEqual([
      { member: members[0], participant: participants[0], inMeeting: true },
    ]);
    expect(result.offline).toEqual([members[2]]);
  });

  it('treats everyone as offline during a disconnected or resynchronizing office session', () => {
    const result = deriveWorkspacePresence([{ userId: 'u1', displayName: 'Ava' }], [], new Set());
    expect(result.online).toEqual([]);
    expect(result.offline).toHaveLength(1);
  });
});
