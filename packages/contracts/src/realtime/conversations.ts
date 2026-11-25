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
    workspaceId: idSchema,
    officeId: idSchema,
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
            accessPolicy: z.literal('explicit-admission'),
            occupancy: z.array(idSchema).max(OFFICE_LIMITS.maxParticipants),
            admittedMembers: z.array(idSchema).max(OFFICE_LIMITS.maxMeetingParticipants),
            meeting: z
              .object({
                conversationId: idSchema,
                version: stateVersionSchema,
                state: z.enum(['joining', 'active']),
              })
              .strict()
              .nullable(),
            entrances: z
              .array(
                z
                  .object({
                    side: z.enum(['north', 'south', 'east', 'west']),
                    at: z.number().int().nonnegative().max(OFFICE_LIMITS.maxWorldDimension),
                    state: z.enum(['open', 'occupied']),
                  })
                  .strict(),
              )
              .max(32),
          })
          .strict(),
      )
      .max(32),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.zones.map((zone) => zone.zoneId)).size !== value.zones.length)
      ctx.addIssue({ code: 'custom', path: ['zones'], message: 'Duplicate meeting zone' });
    for (const [index, zone] of value.zones.entries()) {
      if (new Set(zone.occupancy).size !== zone.occupancy.length)
        ctx.addIssue({
          code: 'custom',
          path: ['zones', index, 'occupancy'],
          message: 'Duplicate room occupant',
        });
      if (new Set(zone.admittedMembers).size !== zone.admittedMembers.length)
        ctx.addIssue({
          code: 'custom',
          path: ['zones', index, 'admittedMembers'],
          message: 'Duplicate admitted member',
        });
      if (
        new Set(zone.entrances.map(({ side, at }) => `${side}:${at}`)).size !==
        zone.entrances.length
      )
        ctx.addIssue({
          code: 'custom',
          path: ['zones', index, 'entrances'],
          message: 'Duplicate entrance',
        });
    }
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

const meetingScreenShareIdentitySchema = z.object({
  conversationId: idSchema,
  shareId: idSchema,
});
export const MEETING_SCREEN_SHARE_TRACK_NAME_PREFIX = 'gather-meeting-screen-share:';
export const meetingScreenShareTrackName = (shareId: string) =>
  `${MEETING_SCREEN_SHARE_TRACK_NAME_PREFIX}${shareId}`;
export const meetingScreenShareStartEventSchema = officeCommandSchema(
  meetingScreenShareIdentitySchema.extend({ conversationVersion: stateVersionSchema }).strict(),
);
export const meetingScreenShareConfirmEventSchema = officeCommandSchema(
  meetingScreenShareIdentitySchema.strict(),
);
export const meetingScreenShareStopEventSchema = officeCommandSchema(
  meetingScreenShareIdentitySchema.strict(),
);

export const meetingScreenSharePresentationSchema = z
  .object({
    shareId: idSchema,
    presenterParticipationId: idSchema,
    status: z.enum(['starting', 'live']),
    startedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const meetingScreenShareUpdateSchema = z
  .object({
    officeEpoch: idSchema,
    conversationId: idSchema,
    zoneId: staticIdSchema,
    version: stateVersionSchema,
    presentation: meetingScreenSharePresentationSchema.nullable(),
  })
  .strict();

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
export type ConversationAreas = z.infer<typeof conversationAreasSchema>;
export type MeetingScreenSharePresentation = z.infer<typeof meetingScreenSharePresentationSchema>;
export type MeetingScreenShareUpdate = z.infer<typeof meetingScreenShareUpdateSchema>;
export type MeetingZones = z.infer<typeof meetingZonesSchema>;
export type MeetingInvitation = z.infer<typeof meetingInvitationSchema>;
