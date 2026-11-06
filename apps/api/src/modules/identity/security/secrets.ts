import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const newSecret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const csrfToken = (secret: string, sessionId: string) =>
  createHmac('sha256', secret).update(sessionId).digest('base64url');
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
