import { z } from 'zod';
import { idSchema } from '../http/auth.js';
import { mapVersionSchema, protocolVersionSchema } from '../versions.js';
import { httpErrorCodeSchema, officeErrorCodeSchema } from '../errors.js';
import { fitsJsonByteLimit, OFFICE_LIMITS } from '../limits.js';

export const sequenceSchema = z.number().int().min(0).max(4294967295);
export const stateVersionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const serverTimeSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const staticIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
/** Imported stable seats use <objectId>:<index>; do not force CP02 to rename them. */
export const seatIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_:-]*$/);
export const availabilitySchema = z.enum(['available', 'busy', 'away']);
export const facingSchema = z.enum(['north', 'east', 'south', 'west']);
export const appearanceSchema = z
  .object({ bodyId: staticIdSchema, paletteId: staticIdSchema })
  .strict();

const positionSchema = z
  .object({
    x: z.number().min(0).max(OFFICE_LIMITS.maxWorldDimension),
    y: z.number().min(0).max(OFFICE_LIMITS.maxWorldDimension),
  })
  .strict();
export const publicParticipantSchema = z
  .object({
    participationId: idSchema,
    displayName: z.string().min(2).max(80),
    appearance: appearanceSchema,
    position: positionSchema,
    facing: facingSchema,
    availability: availabilitySchema,
    seatId: seatIdSchema.nullable(),
    lastProcessedInputSequence: sequenceSchema,
  })
  .strict();
const seatOccupancySchema = z
  .object({ seatId: seatIdSchema, occupantParticipationId: idSchema.nullable() })
  .strict();

export const worldSnapshotSchema = z
  .object({
    officeEpoch: idSchema,
    stateVersion: stateVersionSchema,
    serverTime: serverTimeSchema,
    participants: z.array(publicParticipantSchema).max(OFFICE_LIMITS.maxParticipants),
    seats: z.array(seatOccupancySchema).max(OFFICE_LIMITS.maxSeatStateEntries),
  })
  .strict()
  .superRefine((value, ctx) => {
    const participants = new Map(value.participants.map((p) => [p.participationId, p]));
    const seats = new Map(value.seats.map((s) => [s.seatId, s]));
    const occupied = value.seats.filter((s) => s.occupantParticipationId !== null);
    if (participants.size !== value.participants.length || seats.size !== value.seats.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate participant or seat identity' });
    if (new Set(occupied.map((s) => s.occupantParticipationId)).size !== occupied.length)
      ctx.addIssue({ code: 'custom', message: 'Participant occupies multiple seats' });
    for (const seat of occupied) {
      if (participants.get(seat.occupantParticipationId!)?.seatId !== seat.seatId)
        ctx.addIssue({ code: 'custom', path: ['seats'], message: 'Seat/participant mismatch' });
    }
    for (const participant of value.participants) {
      if (
        participant.seatId !== null &&
        seats.get(participant.seatId)?.occupantParticipationId !== participant.participationId
      )
        ctx.addIssue({
          code: 'custom',
          path: ['participants'],
          message: 'Participant/seat mismatch',
        });
    }
  })
  .refine(
    (value) => fitsJsonByteLimit(value, OFFICE_LIMITS.maxSnapshotBytes),
    'Snapshot too large',
  );

export const worldDeltaSchema = z
  .object({
    officeEpoch: idSchema,
    baseVersion: stateVersionSchema,
    stateVersion: stateVersionSchema,
    serverTime: serverTimeSchema,
    participants: z.array(publicParticipantSchema).max(OFFICE_LIMITS.maxParticipants),
    removedParticipationIds: z.array(idSchema).max(OFFICE_LIMITS.maxParticipants),
    seats: z.array(seatOccupancySchema).max(OFFICE_LIMITS.maxSeatStateEntries),
  })
  .strict()
  .superRefine((value, ctx) => {
    const changed = new Set(value.participants.map((p) => p.participationId));
    if (
      value.stateVersion <= value.baseVersion ||
      changed.size !== value.participants.length ||
      new Set(value.removedParticipationIds).size !== value.removedParticipationIds.length ||
      new Set(value.seats.map((s) => s.seatId)).size !== value.seats.length ||
      value.removedParticipationIds.some((id) => changed.has(id))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid delta ordering or duplicate identities' });
  })
  .refine((value) => fitsJsonByteLimit(value, OFFICE_LIMITS.maxSnapshotBytes), 'Delta too large');

/** Bind to locally accepted state, never to epoch/version supplied by an incoming packet. */
export const worldDeltaForStateSchema = (current: { officeEpoch: string; stateVersion: number }) =>
  worldDeltaSchema.refine(
    (value) =>
      value.officeEpoch === current.officeEpoch && value.baseVersion === current.stateVersion,
    'Stale epoch or snapshot gap; resync required',
  );

export const officeReadySchema = z
  .object({
    participationId: idSchema,
    workspaceId: idSchema,
    officeId: idSchema,
    mapVersion: mapVersionSchema,
    protocolVersion: protocolVersionSchema,
    snapshot: worldSnapshotSchema,
  })
  .strict()
  .refine(
    (value) => value.snapshot.participants.some((p) => p.participationId === value.participationId),
    'Ready participation missing from snapshot',
  );

export const officeCommandSchema = <T extends z.ZodType>(payload: T) =>
  z
    .object({ eventId: idSchema, officeEpoch: idSchema, payload })
    .strict()
    .refine(
      (value) => fitsJsonByteLimit(value, OFFICE_LIMITS.maxInboundEventBytes),
      'Event too large',
    );

export const worldInputEventSchema = officeCommandSchema(
  z
    .object({
      sequence: sequenceSchema,
      dx: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
      dy: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    })
    .strict(),
);
export const presenceUpdateEventSchema = officeCommandSchema(
  z.object({ availability: availabilitySchema }).strict(),
);
export const seatSitEventSchema = officeCommandSchema(z.object({ seatId: seatIdSchema }).strict());
export const seatStandEventSchema = officeCommandSchema(z.object({}).strict());
export const worldResyncEventSchema = officeCommandSchema(
  z.object({ stateVersion: stateVersionSchema }).strict(),
);

export const officeCommandAckSchema = z.discriminatedUnion('ok', [
  z.object({ eventId: idSchema, ok: z.literal(true) }).strict(),
  z
    .object({
      eventId: idSchema,
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum([...httpErrorCodeSchema.options, ...officeErrorCodeSchema.options]),
          retryAfterMs: z.number().int().min(0).max(60000).optional(),
        })
        .strict(),
    })
    .strict(),
]);

export const officeAccessEndedSchema = z
  .object({
    officeEpoch: idSchema,
    reason: z.enum(['authorization_ended', 'taken_over', 'office_draining', 'server_unavailable']),
  })
  .strict();

export type WorldSnapshot = z.infer<typeof worldSnapshotSchema>;
export type WorldDelta = z.infer<typeof worldDeltaSchema>;
export type OfficeReady = z.infer<typeof officeReadySchema>;
export type WorldInputEvent = z.infer<typeof worldInputEventSchema>;
