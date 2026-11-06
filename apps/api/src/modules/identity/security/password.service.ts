import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { fail } from '../../../platform/http/errors.js';

const weak = new Set([
  'passwordpassword',
  'passwordpassword123',
  '123456789012345',
  '1234567890123456',
  'qwertyuiopasdfgh',
  'correcthorsebatterystaple',
  'thisisapassword',
  'iloveyouiloveyou',
  'letmeinletmein123',
  'password123456789',
]);
@Injectable()
export class PasswordService {
  private active = 0;
  private dummy: Promise<string> | undefined;
  private async bounded<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= 4) fail(429, 'password_work_limited');
    this.active++;
    try {
      return await work();
    } finally {
      this.active--;
    }
  }
  assertAllowed(password: string) {
    if (
      password.length < 15 ||
      password.length > 128 ||
      Buffer.byteLength(password) > 512 ||
      weak.has(password.toLowerCase()) ||
      /^(.)\1+$/.test(password)
    )
      fail(400, 'weak_password');
  }
  async hash(password: string) {
    this.assertAllowed(password);
    return this.bounded(() =>
      argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      }),
    );
  }
  async verify(hash: string | undefined, password: string) {
    if (password.length > 128 || Buffer.byteLength(password) > 512) return false;
    this.dummy ??= argon2.hash(randomBytes(32).toString('hex'), {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    const candidate = hash ?? (await this.dummy);
    const valid = await this.bounded(() => argon2.verify(candidate, password));
    return Boolean(hash) && valid;
  }
}
