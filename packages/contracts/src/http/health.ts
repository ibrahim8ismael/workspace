import { z } from 'zod';

export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
});

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
