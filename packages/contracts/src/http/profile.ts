import { z } from 'zod';
import { displayNameSchema } from './auth.js';
import { appearanceSchema } from '../realtime/office.js';

/** Shape only. CP02/CP06 must additionally resolve IDs against the approved catalog. */
export const updateProfileSchema = z
  .object({ displayName: displayNameSchema.optional(), appearance: appearanceSchema.optional() })
  .strict()
  .refine(
    (value) => value.displayName !== undefined || value.appearance !== undefined,
    'Empty update',
  );
