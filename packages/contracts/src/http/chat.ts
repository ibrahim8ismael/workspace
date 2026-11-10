import { z } from 'zod';
import { displayNameSchema, idSchema } from './auth.js';

export const OFFICE_CHAT_RETENTION_DAYS = 90;
export const OFFICE_CHAT_PAGE_SIZE = 100;

export const sendOfficeMessageSchema = z
  .object({
    clientMessageId: idSchema,
    text: z.string().trim().min(1).max(4000),
  })
  .strict();

export const officeMessageSchema = z
  .object({
    id: idSchema,
    senderId: idSchema,
    senderName: displayNameSchema,
    text: z.string().min(1).max(4000),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const officeMessagesResponseSchema = z
  .object({ messages: z.array(officeMessageSchema).max(OFFICE_CHAT_PAGE_SIZE) })
  .strict();

export const officeMessageResponseSchema = z.object({ message: officeMessageSchema }).strict();

/** Broadcast only to the already-admitted Socket.IO room for this office. */
export const officeChatMessageEventSchema = officeMessageSchema;

export type SendOfficeMessage = z.infer<typeof sendOfficeMessageSchema>;
export type OfficeMessage = z.infer<typeof officeMessageSchema>;
