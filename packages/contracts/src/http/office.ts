import { z } from 'zod';
import { idSchema, secretSchema } from './auth.js';
import { workspaceDtoSchema } from './responses.js';
import {
  contentHashSchema,
  mapVersionSchema,
  protocolVersionSchema,
  MAP_FORMAT_VERSION,
  MAP_TILE_SIZE,
  MVP_MAP_ID,
} from '../versions.js';
import { OFFICE_LIMITS } from '../limits.js';

export const worldPointSchema = z.object({ x: z.number().min(0), y: z.number().min(0) }).strict();
export const mapManifestSchema = z
  .object({
    formatVersion: z.literal(MAP_FORMAT_VERSION),
    mapId: z.literal(MVP_MAP_ID),
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
    geometryPath: z.string().regex(/^\/maps\/vivo-v1-[a-f0-9]{64}\.json$/),
    assetManifestVersion: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9_-]*$/),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mapVersion !== `vivo-v1-${value.contentHash}`)
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
  .object({ workspace: workspaceDtoSchema.extend({ officeId: idSchema }).strict() })
  .strict();

export const officeBootstrapResponseSchema = z
  .object({
    officeId: idSchema,
    workspaceId: idSchema,
    mapVersion: mapVersionSchema,
    protocolVersion: protocolVersionSchema,
    manifest: mapManifestSchema,
  })
  .strict()
  .refine((value) => value.mapVersion === value.manifest.mapVersion, {
    path: ['mapVersion'],
    message: 'Bootstrap/manifest version mismatch',
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

export type OfficeBootstrapResponse = z.infer<typeof officeBootstrapResponseSchema>;
export type JoinTicketRequest = z.infer<typeof joinTicketRequestSchema>;
