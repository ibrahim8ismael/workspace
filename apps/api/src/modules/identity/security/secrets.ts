import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const newSecret = () => randomBytes(32).toString('base64url');
export const newOtp = () => randomInt(0, 1_000_000).toString().padStart(6, '0');
const INVITATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newInvitationCode = () =>
  Array.from({ length: 8 }, () => INVITATION_ALPHABET[randomInt(INVITATION_ALPHABET.length)]).join(
    '',
  );
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const csrfToken = (secret: string, sessionId: string) =>
  createHmac('sha256', secret).update(sessionId).digest('base64url');
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
