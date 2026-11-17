import { z } from 'zod';
import { idSchema } from '../http/auth.js';
import { OFFICE_LIMITS } from '../limits.js';
import { mapVersionSchema } from '../versions.js';
import { officeCommandSchema, stateVersionSchema, staticIdSchema } from './office.js';

const participantRosterSchema = z
  .array(z.object({ participationId: idSchema, displayName: z.string().min(2).max(80) }).strict())
  .max(Math.max(OFFICE_LIMITS.maxMeetingParticipants, OFFICE_LIMITS.maxProximityParticipants));

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
    zoneId: staticIdSchema.optional(),
    participants: participantRosterSchema,
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
    if (value.kind === 'meeting' && !value.zoneId)
      ctx.addIssue({ code: 'custom', path: ['zoneId'], message: 'Meeting update needs a zone' });
    if (value.kind === 'proximity' && value.zoneId !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['zoneId'],
        message: 'Proximity update cannot name a zone',
      });
    if (value.state === 'ended' && (value.participants.length !== 0 || value.mediaReady))
      ctx.addIssue({
        code: 'custom',
        message: 'End notice must not contain a roster or media permission',
      });
    if (value.mediaReady && value.state !== 'active')
      ctx.addIssue({ code: 'custom', path: ['mediaReady'], message: 'Media is not active' });
  });

/** Public geometry only. This full snapshot contains no conversation roster or media data. */
export const conversationAreasSchema = z
  .object({
    officeEpoch: idSchema,
    sequence: stateVersionSchema,
    areas: z
      .array(
        z
          .object({
            areaId: idSchema,
            version: stateVersionSchema,
            shape: z.literal('circle'),
            center: z
              .object({
                x: z.number().min(0).max(OFFICE_LIMITS.maxWorldDimension),
                y: z.number().min(0).max(OFFICE_LIMITS.maxWorldDimension),
              })
              .strict(),
            radius: z.number().positive().max(OFFICE_LIMITS.maxWorldDimension),
            state: z.literal('active'),
          })
          .strict(),
      )
      .max(Math.floor(OFFICE_LIMITS.maxParticipants / 2)),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    if (new Set(snapshot.areas.map((area) => area.areaId)).size !== snapshot.areas.length)
      ctx.addIssue({ code: 'custom', path: ['areas'], message: 'Duplicate proximity area' });
  });

export const meetingZonesSchema = z
  .object({
    officeEpoch: idSchema,
    mapVersion: mapVersionSchema,
    zones: z
      .array(
        z
          .object({
            zoneId: staticIdSchema,
            label: z.string().min(1).max(80),
            bounds: z
              .object({
                tx: z.number().int().nonnegative(),
                ty: z.number().int().nonnegative(),
                width: z.number().int().positive(),
                height: z.number().int().positive(),
              })
              .strict(),
            tileSize: z.number().int().positive().max(256),
            capacity: z.number().int().min(1).max(OFFICE_LIMITS.maxMeetingParticipants),
          })
          .strict(),
      )
      .max(32),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.zones.map((zone) => zone.zoneId)).size !== value.zones.length)
      ctx.addIssue({ code: 'custom', path: ['zones'], message: 'Duplicate meeting zone' });
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
export type ConversationAreas = z.infer<typeof conversationAreasSchema>;
export type MeetingZones = z.infer<typeof meetingZonesSchema>;
