import { describe, expect, it } from 'vitest';
import {
  conversationUpdateSchema,
  proximityOptInEventSchema,
  updateProfileSchema,
  OFFICE_LIMITS,
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
});
