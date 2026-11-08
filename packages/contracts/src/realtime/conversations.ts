import { z } from 'zod';
import { idSchema } from '../http/auth.js';
import { OFFICE_LIMITS } from '../limits.js';
import { officeCommandSchema, stateVersionSchema, staticIdSchema } from './office.js';

/** Private to the currently authorized conversation members, never the office room. */
export const conversationUpdateSchema = z
  .object({
    officeEpoch: idSchema,
    conversationId: idSchema,
    kind: z.enum(['proximity', 'meeting']),
    state: z.enum(['joining', 'active', 'retiring', 'ended']),
    version: stateVersionSchema,
    generation: idSchema,
    mediaReady: z.boolean(),
    participants: z
      .array(
        z.object({ participationId: idSchema, displayName: z.string().min(2).max(80) }).strict(),
      )
      .max(OFFICE_LIMITS.maxMeetingParticipants),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.participants.map((p) => p.participationId)).size !== value.participants.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['participants'],
        message: 'Duplicate conversation member',
      });
    if (value.kind === 'proximity' && value.state !== 'ended' && value.participants.length !== 2)
      ctx.addIssue({
        code: 'custom',
        path: ['participants'],
        message: 'Proximity requires a pair',
      });
    if (value.kind === 'meeting' && value.state !== 'ended' && value.participants.length === 0)
      ctx.addIssue({ code: 'custom', path: ['participants'], message: 'Meeting has no members' });
    if (value.state === 'ended' && (value.participants.length !== 0 || value.mediaReady))
      ctx.addIssue({
        code: 'custom',
        message: 'End notice must not contain a roster or media permission',
      });
    if (value.mediaReady && value.state !== 'active')
      ctx.addIssue({ code: 'custom', path: ['mediaReady'], message: 'Media is not active' });
  });

export const proximityOptInEventSchema = officeCommandSchema(
  z.object({ enabled: z.boolean() }).strict(),
);
export const conversationLeaveEventSchema = officeCommandSchema(
  z.object({ conversationId: idSchema, conversationVersion: stateVersionSchema }).strict(),
);
export const meetingJoinEventSchema = officeCommandSchema(
  z.object({ zoneId: staticIdSchema }).strict(),
);
export const meetingLeaveEventSchema = conversationLeaveEventSchema;

export type ConversationUpdate = z.infer<typeof conversationUpdateSchema>;
