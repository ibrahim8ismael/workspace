import { z } from 'zod';
import { idSchema } from './auth.js';

const hexDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const mediaSourceSchema = z.enum(['microphone', 'camera', 'screen_share']);
const positiveVersionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const mediaTokenRequestSchema = z
  .object({
    participationId: idSchema,
    conversationVersion: positiveVersionSchema,
  })
  .strict();

export const mediaTokenResponseSchema = z
  .object({
    serverUrl: z.url(),
    token: z.string().min(1).max(8192),
    expiresAt: z.iso.datetime(),
    conversationVersion: positiveVersionSchema,
    generation: idSchema,
  })
  .strict();

/** Machine-authenticated CP07 guard → application policy challenge. */
export const mediaPolicyPullSchema = z
  .object({ epoch: hexDigestSchema, nonce: hexDigestSchema })
  .strict();

export const mediaPolicyPermitSchema = z
  .object({
    generation: idSchema,
    identity: idSchema,
    room: idSchema,
    version: positiveVersionSchema,
    sources: z.array(mediaSourceSchema).min(1).max(3),
  })
  .strict()
  .superRefine((permit, ctx) => {
    if (new Set(permit.sources).size !== permit.sources.length)
      ctx.addIssue({ code: 'custom', path: ['sources'], message: 'Duplicate media source' });
  });

export const mediaPolicySnapshotSchema = z
  .object({
    epoch: hexDigestSchema,
    nonce: hexDigestSchema,
    sequence: positiveVersionSchema,
    permits: z.array(mediaPolicyPermitSchema).max(256),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const keys = new Set<string>();
    for (const [index, permit] of snapshot.permits.entries()) {
      const key = `${permit.generation}:${permit.identity}`;
      if (keys.has(key))
        ctx.addIssue({ code: 'custom', path: ['permits', index], message: 'Duplicate permit' });
      keys.add(key);
    }
  });

/** A guard may report installation only for the exact signed request and sequence. */
export const mediaPolicyInstallAckSchema = z
  .object({ epoch: hexDigestSchema, nonce: hexDigestSchema, sequence: positiveVersionSchema })
  .strict();

export type MediaPolicyPermit = z.infer<typeof mediaPolicyPermitSchema>;
export type MediaPolicySnapshot = z.infer<typeof mediaPolicySnapshotSchema>;
export type MediaTokenRequest = z.infer<typeof mediaTokenRequestSchema>;
export type MediaTokenResponse = z.infer<typeof mediaTokenResponseSchema>;
