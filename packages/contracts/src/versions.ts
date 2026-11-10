import { z } from 'zod';

export const OFFICE_PROTOCOL_VERSION = 1;
export const MAP_FORMAT_VERSION = 1;
export const MVP_MAP_ID = 'vivo';
export const OFFICE_MAP_IDS = ['commons', 'vivo'] as const;
export const officeMapIdSchema = z.enum(OFFICE_MAP_IDS);
export const MAP_TILE_SIZE = 32;

export const protocolVersionSchema = z.literal(OFFICE_PROTOCOL_VERSION);
export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
/** A syntactically valid map version still needs to exist in the server's trusted registry. */
export const mapVersionSchema = z
  .string()
  .regex(new RegExp(`^(?:${OFFICE_MAP_IDS.join('|')})-v1-[a-f0-9]{64}$`));
