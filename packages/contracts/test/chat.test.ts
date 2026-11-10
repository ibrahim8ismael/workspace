import { describe, expect, it } from 'vitest';
import {
  OFFICE_CHAT_PAGE_SIZE,
  OFFICE_CHAT_RETENTION_DAYS,
  officeMessageSchema,
  officeMessagesResponseSchema,
  sendOfficeMessageSchema,
} from '../src/index.js';

const validMessage = {
  id: '11111111-1111-4111-8111-111111111111',
  senderId: '22222222-2222-4222-8222-222222222222',
  senderName: 'Test User',
  text: 'A message from the office',
  createdAt: '2026-11-10T12:00:00.000Z',
};

describe('office chat contracts', () => {
  it('freezes the approved page size and retention duration', () => {
    expect(OFFICE_CHAT_PAGE_SIZE).toBe(100);
    expect(OFFICE_CHAT_RETENTION_DAYS).toBe(90);
  });

  it('accepts bounded nonempty messages with a client retry ID', () => {
    expect(
      sendOfficeMessageSchema.safeParse({
        clientMessageId: '33333333-3333-4333-8333-333333333333',
        text: '  hello  ',
      }).success,
    ).toBe(true);
    expect(
      sendOfficeMessageSchema.safeParse({
        clientMessageId: '33333333-3333-4333-8333-333333333333',
        text: '   ',
      }).success,
    ).toBe(false);
    expect(
      sendOfficeMessageSchema.safeParse({
        clientMessageId: '33333333-3333-4333-8333-333333333333',
        text: 'x'.repeat(4001),
      }).success,
    ).toBe(false);
  });

  it('rejects invalid message projections and histories beyond the response bound', () => {
    expect(officeMessageSchema.safeParse(validMessage).success).toBe(true);
    expect(officeMessageSchema.safeParse({ ...validMessage, senderId: 'not-a-uuid' }).success).toBe(
      false,
    );
    expect(
      officeMessagesResponseSchema.safeParse({ messages: Array(101).fill(validMessage) }).success,
    ).toBe(false);
  });
});
