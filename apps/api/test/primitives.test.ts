import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { registerSchema, createInvitationSchema } from '@gather/contracts';
import { encryptMail, decryptMail, encryptionKey } from '@gather/delivery';
import { PasswordService } from '../dist/modules/identity/security/password.service.js';
import {
  newSecret,
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
  it('encrypts mail and rejects changed ciphertext or a different outbox identity', () => {
    const key = randomBytes(32);
    const value = {
      recipient: 'person@example.com',
      kind: 'verify-email' as const,
      token: newSecret(),
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
