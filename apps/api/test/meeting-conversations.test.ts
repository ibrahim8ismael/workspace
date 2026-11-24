import { describe, expect, it } from 'vitest';
import { OFFICE_LIMITS, conversationUpdateSchema } from '@gather/contracts';
import { MeetingConversations } from '../dist/modules/office/runtime/meeting-conversations.js';
import type { ProximityCandidate } from '../dist/modules/office/runtime/proximity-pairing.js';

const epoch = '98ff100b-f4f2-4896-81ef-11106d315b9e';
const zone = {
  zoneId: 'meeting-room',
  label: 'Meeting Room',
  kind: 'meeting' as const,
  bounds: { tx: 1, ty: 1, width: 4, height: 4 },
};

function candidate(
  index: number,
  x = 48,
  y = 48,
  availability: ProximityCandidate['availability'] = 'available',
): ProximityCandidate {
  return {
    participationId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    socketId: `socket-${index}`,
    displayName: `Person ${index}`,
    availability,
    position: { x, y },
  };
}

describe('fixed meeting conversations', () => {
  it('requires explicit admission from a current participant physically inside the trusted room', () => {
    const meetings = new MeetingConversations(epoch, [zone], 32);
    expect(meetings.join(candidate(0, 160, 160), zone.zoneId)).toBe('zone_unavailable');
    expect(meetings.join(candidate(0, 48, 48, 'busy'), zone.zoneId)).toBe('zone_unavailable');
    const joined = meetings.join(candidate(0), zone.zoneId);
    expect(typeof joined).toBe('object');
    if (typeof joined === 'object') {
      expect(joined.notices[0]?.update).toMatchObject({
        kind: 'meeting',
        zoneId: zone.zoneId,
        state: 'joining',
        participants: [{ participationId: candidate(0).participationId }],
      });
    }
  });

  it('is idempotent and keeps one media room identity through group admission', () => {
    const meetings = new MeetingConversations(epoch, [zone], 32);
    const first = candidate(0);
    const firstJoin = meetings.join(first, zone.zoneId);
    if (typeof firstJoin === 'string') throw new Error(firstJoin);
    const conversationId = firstJoin.notices[0]!.update.conversationId;
    const generation1 = firstJoin.notices[0]!.update.generation;
    expect(meetings.join(first, zone.zoneId)).toEqual({ notices: [] });

    const secondJoin = meetings.join(candidate(1, 96, 96), zone.zoneId);
    if (typeof secondJoin === 'string') throw new Error(secondJoin);
    expect(secondJoin.notices[0]?.update).toMatchObject({
      conversationId,
      kind: 'meeting',
      zoneId: zone.zoneId,
      state: 'joining',
      participants: [
        { participationId: first.participationId },
        { participationId: candidate(1, 96, 96).participationId },
      ],
    });
    expect(secondJoin.notices[0]?.update.generation).toBe(generation1);
    expect(meetings.mediaPermits()).toHaveLength(2);
    expect(meetings.mediaPermits().every((permit) => permit.roomLifecycle === 'stable')).toBe(true);
    expect(meetings.mediaPermits().every((permit) => permit.generation === generation1)).toBe(true);
    expect(conversationUpdateSchema.safeParse(secondJoin.notices[0]?.update).success).toBe(true);
  });

  it('enforces the separate twenty-person meeting capacity and preserves one-conversation membership', () => {
    expect(OFFICE_LIMITS.maxMeetingParticipants).toBe(20);
    const meetings = new MeetingConversations(epoch, [zone], 32);
    for (let index = 0; index < OFFICE_LIMITS.maxMeetingParticipants; index += 1) {
      const joined = meetings.join(candidate(index), zone.zoneId);
      expect(typeof joined).toBe('object');
    }
    expect(meetings.join(candidate(20), zone.zoneId)).toBe('room_full');
    expect(meetings.participantIds()).toHaveLength(20);
    expect(meetings.join(candidate(0), 'another-room')).toBe('zone_unavailable');
  });

  it('removes a leaver without rotating the room and accepts their later re-entry', () => {
    const meetings = new MeetingConversations(epoch, [zone], 32);
    const first = candidate(0);
    const second = candidate(1);
    const firstJoin = meetings.join(first, zone.zoneId);
    if (typeof firstJoin === 'string') throw new Error(firstJoin);
    const secondJoin = meetings.join(second, zone.zoneId);
    if (typeof secondJoin === 'string') throw new Error(secondJoin);
    const joining = secondJoin.notices[0]!.update;
    const active = meetings.activateGeneration(joining.generation)[0]!.update;
    expect(active.state).toBe('active');
    expect(
      meetings.mediaConversation(first.participationId, active.conversationId, active.version, [
        first,
        second,
      ]),
    ).not.toBeNull();

    const leave = meetings.leave(first.participationId, active.conversationId, active.version);
    expect(typeof leave).toBe('object');
    if (typeof leave === 'object') {
      expect(leave.notices.map((notice) => notice.update.state)).toEqual(['ended', 'active']);
      const firstEnded = leave.notices[0]!.update;
      const remaining = leave.notices[1]!.update;
      expect(remaining.participants.map((member) => member.participationId)).toEqual([
        second.participationId,
      ]);
      expect(remaining.generation).toBe(active.generation);
      expect(firstEnded.version).toBe(remaining.version);
      expect(meetings.mediaPermits()).toMatchObject([
        { generation: active.generation, identity: second.participationId },
      ]);

      const rejoined = meetings.join(first, zone.zoneId);
      expect(typeof rejoined).toBe('object');
      if (typeof rejoined === 'object') {
        expect(rejoined.notices[0]?.update.version).toBeGreaterThan(firstEnded.version);
        expect(rejoined.notices[0]?.update.participants).toHaveLength(2);
        expect(rejoined.notices[0]?.update.generation).toBe(active.generation);
        const reentryReady = meetings.activateGeneration(active.generation)[0]?.update;
        expect(reentryReady).toMatchObject({
          state: 'active',
          conversationId: active.conversationId,
          generation: active.generation,
        });
      }
    }
  });

  it('revokes a listener when they leave the fixed room or lose availability', () => {
    const meetings = new MeetingConversations(epoch, [zone], 32);
    const member = candidate(0);
    const joined = meetings.join(member, zone.zoneId);
    if (typeof joined === 'string') throw new Error(joined);
    const active = meetings.activateGeneration(joined.notices[0]!.update.generation)[0]!.update;
    expect(
      meetings.mediaConversation(member.participationId, active.conversationId, active.version, [
        member,
      ]),
    ).not.toBeNull();
    const outside = { ...member, position: { x: 160, y: 160 } };
    const removed = meetings.reconcile([outside]);
    expect(removed[0]?.update.state).toBe('ended');
    expect(meetings.mediaPermits()).toEqual([]);
    expect(meetings.hasParticipant(member.participationId)).toBe(false);
  });
});
