import { describe, expect, it } from 'vitest';
import {
  mediaPolicyInstallAckSchema,
  mediaPolicyPullSchema,
  mediaPolicySnapshotSchema,
  mediaTokenRequestSchema,
  mediaTokenResponseSchema,
} from '../dist/index.js';

const epoch = 'a'.repeat(64);
const nonce = 'b'.repeat(64);
const id = '11111111-1111-4111-8111-111111111111';

describe('media authorization contracts', () => {
  it('accepts only bounded scoped media token requests and responses', () => {
    expect(mediaTokenRequestSchema.parse({ participationId: id, conversationVersion: 1 })).toEqual({
      participationId: id,
      conversationVersion: 1,
    });
    expect(
      mediaTokenRequestSchema.safeParse({
        participationId: id,
        conversationVersion: 1,
        room: 'client-selected-room',
      }).success,
    ).toBe(false);
    expect(
      mediaTokenRequestSchema.safeParse({ participationId: id, conversationVersion: 0 }).success,
    ).toBe(false);
    expect(
      mediaTokenResponseSchema.safeParse({
        serverUrl: 'wss://media.example.test',
        token: 'signed-token',
        expiresAt: '2026-11-10T12:00:00.000Z',
        conversationVersion: 1,
        generation: id,
      }).success,
    ).toBe(true);
  });

  it('binds policy install acknowledgement to a fresh challenge and unique scoped permits', () => {
    expect(mediaPolicyPullSchema.safeParse({ epoch, nonce }).success).toBe(true);
    expect(mediaPolicyPullSchema.safeParse({ epoch: 'stale', nonce }).success).toBe(false);
    expect(mediaPolicyInstallAckSchema.safeParse({ epoch, nonce, sequence: 1 }).success).toBe(true);
    expect(mediaPolicyInstallAckSchema.safeParse({ epoch, nonce, sequence: 0 }).success).toBe(
      false,
    );

    const snapshot = {
      epoch,
      nonce,
      sequence: 1,
      permits: [
        {
          generation: id,
          identity: id,
          room: id,
          version: 1,
          sources: ['microphone'],
        },
      ],
    };
    expect(mediaPolicySnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      mediaPolicySnapshotSchema.safeParse({
        ...snapshot,
        permits: [snapshot.permits[0], snapshot.permits[0]],
      }).success,
    ).toBe(false);
    expect(
      mediaPolicySnapshotSchema.safeParse({
        ...snapshot,
        permits: [{ ...snapshot.permits[0], sources: ['microphone', 'microphone'] }],
      }).success,
    ).toBe(false);
  });
});
