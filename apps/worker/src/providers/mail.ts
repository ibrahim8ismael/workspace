import nodemailer from 'nodemailer';
import { z } from 'zod';
import type { MailPayload } from '@gather/delivery';

export const smtpEnvironment = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_REQUIRE_TLS: z.enum(['true', 'false']).default('true'),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    SMTP_FROM: z.email(),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      env.SMTP_SECURE !== 'true' &&
      env.SMTP_REQUIRE_TLS !== 'true'
    )
      ctx.addIssue({ code: 'custom', message: 'Production SMTP requires TLS' });
  });
export function mailContent(payload: MailPayload, expiresAt: Date) {
  const action =
    payload.kind === 'verify-email'
      ? 'Verify your email'
      : payload.kind === 'reset-password'
        ? 'Reset your password'
        : 'Join a company';
  const endpoint =
    payload.kind === 'verify-email'
      ? '/api/auth/verify-email'
      : payload.kind === 'reset-password'
        ? '/api/auth/reset-password'
        : '/api/invitations/accept';
  return {
    subject: `Gather Lite: ${action}`,
    text: [
      action,
      payload.companyName ? `Company: ${payload.companyName}` : '',
      `One-time code: ${payload.token}`,
      `Expires: ${expiresAt.toISOString()}`,
      `Submit the code to ${endpoint} using the documented backend API.`,
      `If you did not request this, ignore the message.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}
export function createMailSender(value: unknown) {
  const env = smtpEnvironment.parse(value);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === 'true',
    requireTLS: env.SMTP_REQUIRE_TLS === 'true',
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
    logger: false,
    debug: false,
  });
  return {
    async send(payload: MailPayload, expiresAt: Date) {
      await transport.sendMail({
        from: env.SMTP_FROM,
        to: payload.recipient,
        ...mailContent(payload, expiresAt),
      });
    },
    close: () => transport.close(),
  };
}
