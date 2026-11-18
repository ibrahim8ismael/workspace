import { Injectable, Inject } from '@nestjs/common';
import { IdentityModels } from '../identity.models.js';
import { digest } from './secrets.js';
import { fail } from '../../../platform/http/errors.js';

@Injectable()
export class AbuseService {
  constructor(@Inject(IdentityModels) private readonly models: IdentityModels) {}
  async consume(scope: string, key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const id = digest(`${scope}:${key}:${bucket}`);
    const record = await this.models.rateLimits
      .findOneAndUpdate(
        { _id: id },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean();
    if (!record || record.count > limit) fail(429, 'rate_limited');
  }
  async authRequest(kind: string, ip: string, email?: string) {
    await this.consume('auth-global', 'global', 1000, 60_000);
    await this.consume(`auth-ip:${kind}`, ip, 30, 15 * 60_000);
    if (email) {
      const login = kind === 'login';
      const passwordProof = kind === 'reauthenticate' || kind === 'change-password';
      await this.consume(
        login ? 'auth-account-ip:login' : `auth-account:${kind}`,
        login ? `${email.trim().toLowerCase()}:${ip}` : email,
        login || passwordProof ? 5 : kind === 'verify' || kind === 'reset' ? 10 : 3,
        login || passwordProof || kind === 'verify' || kind === 'reset' ? 15 * 60_000 : 60 * 60_000,
      );
    }
  }
}
