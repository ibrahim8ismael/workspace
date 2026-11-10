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
  });
export type ApiEnvironment = z.infer<typeof environmentSchema>;
