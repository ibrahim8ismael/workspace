import { z } from 'zod';

const optionalMachineKey = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z
    .string()
    .refine(
      (value) =>
        Buffer.from(value, 'base64').length === 32 &&
        Buffer.from(value, 'base64').toString('base64') === value,
      'Provide 32 random bytes encoded as canonical base64',
    )
    .optional(),
);
const optionalLiveKitUrl = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        ['ws:', 'wss:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      );
    }, 'Provide a bare ws:// or wss:// LiveKit server URL')
    .optional(),
);
const optionalLiveKitCredential = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  z.string().min(1).optional(),
);

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: z
      .url()
      .refine((value) => new URL(value).origin === value, 'Use an exact origin without a path')
      .default('http://localhost:5173'),
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
    OUTBOX_ENCRYPTION_KEY: z
      .string()
      .refine(
        (value) =>
          Buffer.from(value, 'base64').length === 32 &&
          Buffer.from(value, 'base64').toString('base64') === value,
        'Provide 32 random bytes encoded as canonical base64',
      ),
    MEDIA_MACHINE_KEY: optionalMachineKey,
    LIVEKIT_URL: optionalLiveKitUrl,
    LIVEKIT_API_KEY: optionalLiveKitCredential,
    LIVEKIT_API_SECRET: optionalLiveKitCredential,
    DB_AUTO_INDEX: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.APP_ORIGIN.startsWith('https://'))
      ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'Production requires HTTPS' });
    if (value.NODE_ENV === 'production' && value.DB_AUTO_INDEX === 'true')
      ctx.addIssue({
        code: 'custom',
        path: ['DB_AUTO_INDEX'],
        message: 'Use explicit production index provisioning',
      });
    const liveKitConfigured = [
      value.LIVEKIT_URL,
      value.LIVEKIT_API_KEY,
      value.LIVEKIT_API_SECRET,
    ].filter(Boolean).length;
    if (liveKitConfigured !== 0 && liveKitConfigured !== 3)
      ctx.addIssue({
        code: 'custom',
        path: ['LIVEKIT_URL'],
        message: 'Configure the LiveKit URL, API key and API secret together',
      });
    if (
      value.NODE_ENV === 'production' &&
      value.LIVEKIT_URL &&
      !value.LIVEKIT_URL.startsWith('wss://')
    )
      ctx.addIssue({
        code: 'custom',
        path: ['LIVEKIT_URL'],
        message: 'Production LiveKit URLs require WSS',
      });
  });
export type ApiEnvironment = z.infer<typeof environmentSchema>;
