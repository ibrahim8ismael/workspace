import { describe, expect, it } from 'vitest';
import {
  conversationUpdateSchema,
  conversationAreasSchema,
  meetingJoinEventSchema,
  proximityOptInEventSchema,
  updateProfileSchema,
  OFFICE_LIMITS,
  meetingInvitationSchema,
  meetingInvitationResponseEventSchema,
} from '../dist/index.js';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const members = [
  a,
  b,
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
];
const conversation = {
  officeEpoch: a,
  conversationId: a,
  kind: 'proximity',
  state: 'active',
  version: 1,
  generation: b,
  mediaReady: true,
  participants: [
    { participationId: a, displayName: 'Person A' },
    { participationId: b, displayName: 'Person B' },
  ],
};

describe('future profile and private conversation shapes', () => {
  it('rejects role/policy changes, empty profiles and arbitrary asset URLs', () => {
    expect(updateProfileSchema.safeParse({ displayName: 'Person' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ displayName: 'Person', role: 'owner' }).success).toBe(
      false,
    );
    expect(
      updateProfileSchema.safeParse({
        appearance: { bodyId: 'https://example.com/avatar', paletteId: 'blue' },
      }).success,
    ).toBe(false);
    expect(
      proximityOptInEventSchema.safeParse({
        eventId: a,
        officeEpoch: b,
        payload: { enabled: true, userId: a },
      }).success,
    ).toBe(false);
  });

  it('does not leak a roster in end notices or accept joining media readiness', () => {
    expect(conversationUpdateSchema.safeParse(conversation).success).toBe(true);
    expect(conversationUpdateSchema.safeParse({ ...conversation, state: 'ended' }).success).toBe(
      false,
    );
    expect(
      conversationUpdateSchema.safeParse({
        ...conversation,
        state: 'ended',
        mediaReady: false,
        participants: [],
      }).success,
    ).toBe(true);
    expect(conversationUpdateSchema.safeParse({ ...conversation, state: 'joining' }).success).toBe(
      false,
    );
    expect(
      conversationUpdateSchema.safeParse({ ...conversation, roomName: 'internal-room' }).success,
    ).toBe(false);
    expect(
      conversationUpdateSchema.safeParse({
        ...conversation,
        participants: [conversation.participants[0], conversation.participants[0]],
      }).success,
    ).toBe(false);
    expect(
      conversationUpdateSchema.safeParse({
        ...conversation,
        kind: 'meeting',
        participants: Array(7).fill(conversation.participants[0]),
      }).success,
    ).toBe(false);
  });

  it('accepts group meeting rosters up to 20 and validates private invitation decisions', () => {
    const roster = Array.from({ length: OFFICE_LIMITS.maxMeetingParticipants }, (_, index) => ({
      participationId: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
      displayName: `Person ${index}`,
    }));
    expect(
      conversationUpdateSchema.safeParse({
        ...conversation,
        kind: 'meeting',
        zoneId: 'vivo-meeting-room',
        participants: roster,
      }).success,
    ).toBe(true);
    expect(
      meetingInvitationResponseEventSchema.safeParse({
        eventId: a,
        officeEpoch: b,
        payload: { invitationId: a, decision: 'accept' },
      }).success,
    ).toBe(true);
    expect(
      meetingInvitationResponseEventSchema.safeParse({
        eventId: a,
        officeEpoch: b,
        payload: { invitationId: a, decision: 'accept', userId: b },
      }).success,
    ).toBe(false);
    expect(
      meetingInvitationSchema.safeParse({
        invitationId: a,
        officeEpoch: b,
        senderParticipationId: a,
        senderDisplayName: 'Person A',
        recipientParticipationId: b,
        recipientDisplayName: 'Person B',
        zoneId: 'meeting-room',
        zoneLabel: 'Meeting Room',
        status: 'pending',
        expiresAt: Date.now(),
      }).success,
    ).toBe(true);
  });

  it('accepts proximity groups from two through the separate six-person group cap', () => {
    const roster = members.slice(0, OFFICE_LIMITS.maxProximityParticipants).map((id, index) => ({
      participationId: id,
      displayName: `Person ${index}`,
    }));
    expect(
      conversationUpdateSchema.safeParse({ ...conversation, participants: roster }).success,
    ).toBe(true);
    expect(
      conversationUpdateSchema.safeParse({
        ...conversation,
        participants: roster.slice(0, 1),
      }).success,
    ).toBe(false);
    expect(
      conversationUpdateSchema.safeParse({
        ...conversation,
        participants: members.map((id, index) => ({
          participationId: id,
          displayName: `Person ${index}`,
        })),
      }).success,
    ).toBe(false);
  });

  it('requires a trusted-zone identity for private meeting rosters and validates public geometry', () => {
    const meeting = {
      ...conversation,
      kind: 'meeting' as const,
      zoneId: 'vivo-meeting-room',
      participants: [{ participationId: a, displayName: 'Person A' }],
    };
    expect(conversationUpdateSchema.safeParse(meeting).success).toBe(true);
    expect(conversationUpdateSchema.safeParse({ ...meeting, zoneId: undefined }).success).toBe(
      false,
    );
    expect(
      conversationUpdateSchema.safeParse({
        ...meeting,
        participants: members.slice(0, OFFICE_LIMITS.maxMeetingParticipants).map((id, index) => ({
          participationId: id,
          displayName: `Person ${index}`,
        })),
      }).success,
    ).toBe(true);

    const areas = {
      officeEpoch: a,
      sequence: 2,
      areas: [
        {
          areaId: b,
          version: 3,
          shape: 'circle' as const,
          center: { x: 64, y: 96 },
          radius: 192,
          state: 'active' as const,
        },
      ],
    };
    expect(conversationAreasSchema.safeParse(areas).success).toBe(true);
    expect(
      conversationAreasSchema.safeParse({ ...areas, areas: [areas.areas[0], areas.areas[0]] })
        .success,
    ).toBe(false);
    expect(
      meetingJoinEventSchema.safeParse({
        eventId: a,
        officeEpoch: b,
        payload: { zoneId: 'vivo-meeting-room', radius: 200 },
      }).success,
    ).toBe(false);
  });
});
