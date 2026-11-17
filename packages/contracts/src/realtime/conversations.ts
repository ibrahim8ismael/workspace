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
      .max(Math.max(OFFICE_LIMITS.maxMeetingParticipants, OFFICE_LIMITS.maxProximityParticipants)),
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
    if (
      value.kind === 'proximity' &&
      value.state !== 'ended' &&
      (value.participants.length < 2 ||
        value.participants.length > OFFICE_LIMITS.maxProximityParticipants)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['participants'],
        message: 'Proximity participant count is outside the permitted range',
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

export const meetingInviteEventSchema = officeCommandSchema(
  z.object({ targetParticipationId: idSchema, zoneId: staticIdSchema }).strict(),
);
export const meetingInvitationResponseEventSchema = officeCommandSchema(
  z.object({ invitationId: idSchema, decision: z.enum(['accept', 'decline']) }).strict(),
);
export const meetingInvitationCancelEventSchema = officeCommandSchema(
  z.object({ invitationId: idSchema }).strict(),
);
export const meetingInvitationSchema = z
  .object({
    invitationId: idSchema,
    officeEpoch: idSchema,
    senderParticipationId: idSchema,
    senderDisplayName: z.string().min(2).max(80),
    recipientParticipationId: idSchema,
    recipientDisplayName: z.string().min(2).max(80),
    zoneId: staticIdSchema,
    zoneLabel: z.string().min(1).max(80),
    status: z.enum([
      'pending',
      'accepted',
      'declined',
      'expired',
      'cancelled',
      'arriving',
      'joined',
    ]),
    expiresAt: z.number().int().min(0),
    reason: z
      .enum(['destination_unavailable', 'destination_full', 'obstructed', 'disconnected'])
      .optional(),
  })
  .strict();

export type ConversationUpdate = z.infer<typeof conversationUpdateSchema>;
export type MeetingInvitation = z.infer<typeof meetingInvitationSchema>;
