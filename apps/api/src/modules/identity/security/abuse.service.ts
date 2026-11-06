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
    if (email)
      await this.consume(
        `auth-account:${kind}`,
        email,
        kind === 'login' ? 5 : 3,
        kind === 'login' ? 15 * 60_000 : 60 * 60_000,
      );
  }
}
