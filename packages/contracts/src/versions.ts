import { z } from 'zod';

export const OFFICE_PROTOCOL_VERSION = 1;
export const MAP_FORMAT_VERSION = 1;
export const MVP_MAP_ID = 'commons';
export const MAP_TILE_SIZE = 32;

export const protocolVersionSchema = z.literal(OFFICE_PROTOCOL_VERSION);
export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
/** CP02 must generate/register the actual content; this pattern is not map approval. */
export const mapVersionSchema = z.string().regex(new RegExp(`^${MVP_MAP_ID}-v1-[a-f0-9]{64}$`));
