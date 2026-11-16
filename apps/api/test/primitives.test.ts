import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  acceptInvitationSchema,
  registerSchema,
  createInvitationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@gather/contracts';
import { encryptMail, decryptMail, encryptionKey } from '@gather/delivery';
import { PasswordService } from '../dist/modules/identity/security/password.service.js';
import { retryInvitationTokenCollision } from '../dist/modules/tenancy/tenancy.service.js';
import {
  newSecret,
  newOtp,
  newInvitationCode,
  digest,
  csrfToken,
  safeEqual,
} from '../dist/modules/identity/security/secrets.js';

describe('security primitives', () => {
  it('rejects overposting and Mongo operator values and canonicalizes email without provider rewrites', () => {
    const value = {
      email: '  PERSON+tag@Example.com ',
      displayName: 'Someone',
      password: 'an independent long password',
    };
    expect(registerSchema.parse(value).email).toBe('person+tag@example.com');
    expect(registerSchema.safeParse({ ...value, role: 'owner' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...value, email: { $ne: null } }).success).toBe(false);
    expect(
      createInvitationSchema.safeParse({ email: 'target@example.com', workspaceId: 'injected' })
        .success,
    ).toBe(false);
  });
  it('generates separate opaque secrets and binds CSRF to the session', () => {
    const a = newSecret(),
      b = newSecret();
    expect(a).toHaveLength(43);
    expect(a === b).toBe(false);
    expect(digest(a)).toHaveLength(64);
    expect(safeEqual(csrfToken(a, 'session-a'), csrfToken(a, 'session-b'))).toBe(false);
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('a', 'long')).toBe(false);
  });
  it('issues six-digit OTPs with leading zeroes preserved and scopes their digests by account and purpose', () => {
    const codes = Array.from({ length: 500 }, newOtp);
    expect(codes.every((code) => /^[0-9]{6}$/.test(code))).toBe(true);
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
    expect(digest(`account-a:verify-email:${codes[0]}`)).not.toBe(
      digest(`account-b:verify-email:${codes[0]}`),
    );
    expect(digest(`account-a:verify-email:${codes[0]}`)).not.toBe(
      digest(`account-a:reset-password:${codes[0]}`),
    );
    expect(
      verifyEmailSchema.safeParse({ email: 'person@example.com', token: codes[0], password: 'x' })
        .success,
    ).toBe(true);
    expect(
      verifyEmailSchema.safeParse({ email: 'person@example.com', token: '12345', password: 'x' })
        .success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        email: 'person@example.com',
        token: codes[0],
        newPassword: 'a sufficiently long password',
      }).success,
    ).toBe(true);
  });
  it('creates normalized eight-character invitation codes and still accepts legacy codes during rollout', () => {
    const code = newInvitationCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(
      acceptInvitationSchema.parse({
        token: `  ${code.toLowerCase().slice(0, 4)} ${code.toLowerCase().slice(4)}  `,
      }).token,
    ).toBe(code);
    expect(acceptInvitationSchema.parse({ token: newSecret() }).token).toHaveLength(43);
  });
  it('retries invitation token unique-index collisions as a complete transaction attempt', async () => {
    let attempts = 0;
    const committed: string[] = [];
    const result = await retryInvitationTokenCollision(async () => {
      attempts += 1;
      if (attempts === 1) throw { code: 11000, keyPattern: { tokenDigest: 1 } };
      committed.push('invitation-and-mail');
      return 'created';
    });
    expect(result).toBe('created');
    expect(attempts).toBe(2);
    expect(committed).toEqual(['invitation-and-mail']);
    let unrelatedAttempts = 0;
    await expect(
      retryInvitationTokenCollision(async () => {
        unrelatedAttempts += 1;
        throw { code: 11000, keyPattern: { slug: 1 } };
      }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(unrelatedAttempts).toBe(1);
  });
  it('encrypts mail and rejects changed ciphertext or a different outbox identity', () => {
    const key = randomBytes(32);
    const value = {
      recipient: 'person@example.com',
      kind: 'verify-email' as const,
      token: newOtp(),
    };
    const encrypted = encryptMail('event-a', value, key);
    expect(JSON.stringify(encrypted).includes(value.token)).toBe(false);
    expect(decryptMail('event-a', encrypted, key).recipient).toBe(value.recipient);
    expect(() => decryptMail('event-b', encrypted, key)).toThrow();
    expect(() =>
      decryptMail('event-a', { ...encrypted, tag: randomBytes(16).toString('base64') }, key),
    ).toThrow();
    expect(() => encryptionKey('not-a-key')).toThrow();
  });
  it('uses Argon2id and validates wrong/unknown passwords without truncation', async () => {
    const passwords = new PasswordService();
    const hash = await passwords.hash('a long independent passphrase');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await passwords.verify(hash, 'a long independent passphrase')).toBe(true);
    expect(await passwords.verify(hash, 'a wrong independent passphrase')).toBe(false);
    expect(await passwords.verify(undefined, 'a long independent passphrase')).toBe(false);
    expect(() => passwords.assertAllowed('passwordpassword')).toThrow();
    expect(() => passwords.assertAllowed('x'.repeat(129))).toThrow();
  });
});
