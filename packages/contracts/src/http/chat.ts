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

export const spaceChannelIdSchema = z.enum(['general', 'social']);
export const spaceMessageScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('channel'), id: spaceChannelIdSchema }).strict(),
  z.object({ kind: z.literal('dm'), userIds: z.tuple([idSchema, idSchema]) }).strict(),
]);
export const spaceMessageSchema = officeMessageSchema.extend({ scope: spaceMessageScopeSchema });
export const spaceMessagesResponseSchema = z
  .object({ messages: z.array(spaceMessageSchema).max(OFFICE_CHAT_PAGE_SIZE) })
  .strict();
export const spaceMessageResponseSchema = z.object({ message: spaceMessageSchema }).strict();
export type SpaceMessageScope = z.infer<typeof spaceMessageScopeSchema>;
export type SpaceMessage = z.infer<typeof spaceMessageSchema>;
/** DM routes identify the peer; the server derives the canonical participant pair. */
export type SpaceConversation =
  { kind: 'channel'; id: z.infer<typeof spaceChannelIdSchema> } | { kind: 'dm'; userId: string };
