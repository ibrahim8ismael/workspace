import { z } from 'zod';
import { idSchema, secretSchema } from './auth.js';
import { workspaceDtoSchema } from './responses.js';
import {
  contentHashSchema,
  mapVersionSchema,
  protocolVersionSchema,
  MAP_FORMAT_VERSION,
  MAP_TILE_SIZE,
  officeMapIdSchema,
} from '../versions.js';
import { OFFICE_LIMITS } from '../limits.js';

export const worldPointSchema = z.object({ x: z.number().min(0), y: z.number().min(0) }).strict();
const tilePointSchema = z
  .object({ tx: z.number().int().min(0), ty: z.number().int().min(0) })
  .strict();
const tileRectSchema = z
  .object({
    tx: z.number().int().min(0),
    ty: z.number().int().min(0),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
  })
  .strict();
export const workspaceGeometrySchema = z
  .object({
    mapId: z.literal('workspace'),
    tileSize: z.literal(MAP_TILE_SIZE),
    widthTiles: z
      .number()
      .int()
      .min(1)
      .max(OFFICE_LIMITS.maxWorldDimension / MAP_TILE_SIZE),
    heightTiles: z
      .number()
      .int()
      .min(1)
      .max(OFFICE_LIMITS.maxWorldDimension / MAP_TILE_SIZE),
    spawn: worldPointSchema,
    blockedEdges: z
      .array(z.tuple([tilePointSchema, tilePointSchema]))
      .max(OFFICE_LIMITS.maxWorkspaceRooms * 28),
    objects: z.array(z.never()).max(0),
    zones: z
      .array(
        z
          .object({
            zoneId: z
              .string()
              .min(1)
              .max(80)
              .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
            label: z.string().min(1).max(80),
            kind: z.literal('meeting'),
            bounds: tileRectSchema,
          })
          .strict(),
      )
      .min(1)
      .max(OFFICE_LIMITS.maxWorkspaceRooms),
  })
  .strict();
const mapGeometryPathPattern =
  /^\/maps\/(?:commons|vivo|workspace)-v1-(?:[1-9][0-9]{0,2}-)?[a-f0-9]{64}\.json$/;
export const mapManifestSchema = z
  .object({
    formatVersion: z.literal(MAP_FORMAT_VERSION),
    mapId: officeMapIdSchema,
    mapVersion: mapVersionSchema,
    contentHash: contentHashSchema,
    coordinateUnits: z.literal('pixels'),
    tileSize: z.literal(MAP_TILE_SIZE),
    bounds: z
      .object({
        width: z.number().int().min(1).max(OFFICE_LIMITS.maxWorldDimension),
        height: z.number().int().min(1).max(OFFICE_LIMITS.maxWorldDimension),
      })
      .strict(),
    spawn: worldPointSchema,
    geometryPath: z.string().regex(mapGeometryPathPattern),
    roomCount: z.number().int().min(1).max(OFFICE_LIMITS.maxWorkspaceRooms).optional(),
    assetManifestVersion: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9_-]*$/),
  })
  .strict()
  .superRefine((value, ctx) => {
    const workspaceVersion = `workspace-v1-${value.roomCount}-${value.contentHash}`;
    if (
      value.mapId === 'workspace'
        ? value.roomCount === undefined || value.mapVersion !== workspaceVersion
        : value.roomCount !== undefined ||
          value.mapVersion !== `${value.mapId}-v1-${value.contentHash}`
    )
      ctx.addIssue({ code: 'custom', path: ['mapVersion'], message: 'Map hash/version mismatch' });
    if (value.geometryPath !== `/maps/${value.mapVersion}.json`)
      ctx.addIssue({
        code: 'custom',
        path: ['geometryPath'],
        message: 'Map path/version mismatch',
      });
    if (value.spawn.x >= value.bounds.width || value.spawn.y >= value.bounds.height)
      ctx.addIssue({ code: 'custom', path: ['spawn'], message: 'Spawn outside map bounds' });
  });

/** Detail only; existing workspace create/list response shapes remain unchanged. */
export const officeWorkspaceDetailResponseSchema = z
  .object({
    workspace: workspaceDtoSchema
      .extend({
        officeId: idSchema,
        revision: z.number().int().min(0),
        roomCount: z.number().int().min(1).max(OFFICE_LIMITS.maxWorkspaceRooms),
      })
      .strict(),
  })
  .strict();

export const officeBootstrapResponseSchema = z
  .object({
    officeId: idSchema,
    workspaceId: idSchema,
    mapVersion: mapVersionSchema,
    protocolVersion: protocolVersionSchema,
    manifest: mapManifestSchema,
    geometry: workspaceGeometrySchema.optional(),
  })
  .strict()
  .refine((value) => value.mapVersion === value.manifest.mapVersion, {
    path: ['mapVersion'],
    message: 'Bootstrap/manifest version mismatch',
  })
  .superRefine((value, ctx) => {
    if (value.manifest.mapId === 'workspace') {
      if (!value.geometry) {
        ctx.addIssue({
          code: 'custom',
          path: ['geometry'],
          message: 'Generated geometry required',
        });
        return;
      }
      if (
        value.geometry.widthTiles * MAP_TILE_SIZE !== value.manifest.bounds.width ||
        value.geometry.heightTiles * MAP_TILE_SIZE !== value.manifest.bounds.height ||
        value.geometry.tileSize !== value.manifest.tileSize ||
        value.geometry.spawn.x !== value.manifest.spawn.x ||
        value.geometry.spawn.y !== value.manifest.spawn.y ||
        value.geometry.zones.length !== value.manifest.roomCount
      )
        ctx.addIssue({ code: 'custom', path: ['geometry'], message: 'Geometry/manifest mismatch' });
    } else if (value.geometry) {
      ctx.addIssue({ code: 'custom', path: ['geometry'], message: 'Static maps omit geometry' });
    }
  });

export const joinTicketRequestSchema = z
  .object({ mapVersion: mapVersionSchema, protocolVersion: protocolVersionSchema })
  .strict();
export const joinTicketResponseSchema = z
  .object({ ticket: secretSchema, expiresAt: z.iso.datetime() })
  .strict();
export const officeSocketAuthSchema = z
  .object({ ticket: secretSchema, protocolVersion: protocolVersionSchema })
  .strict();

/** CP05 extension: never accept this as an ordinary CP03 ticket request. */
export const takeoverReferenceSchema = z
  .object({ participationId: idSchema, officeEpoch: idSchema, reference: secretSchema })
  .strict();
export const takeoverReferenceRequestSchema = z
  .object({
    participationId: idSchema,
    officeEpoch: idSchema,
    mapVersion: mapVersionSchema,
    protocolVersion: protocolVersionSchema,
  })
  .strict();
export const takeoverReferenceResponseSchema = takeoverReferenceSchema
  .extend({ expiresAt: z.iso.datetime() })
  .strict();
export const takeoverTicketRequestSchema = joinTicketRequestSchema
  .extend({ takeover: takeoverReferenceSchema })
  .strict();

export type OfficeBootstrapResponse = z.infer<typeof officeBootstrapResponseSchema>;
export type JoinTicketRequest = z.infer<typeof joinTicketRequestSchema>;
export type JoinTicketResponse = z.infer<typeof joinTicketResponseSchema>;
export type TakeoverReference = z.infer<typeof takeoverReferenceSchema>;
export type TakeoverReferenceRequest = z.infer<typeof takeoverReferenceRequestSchema>;
export type TakeoverReferenceResponse = z.infer<typeof takeoverReferenceResponseSchema>;
export type TakeoverTicketRequest = z.infer<typeof takeoverTicketRequestSchema>;
