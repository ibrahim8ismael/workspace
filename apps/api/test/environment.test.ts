import { describe, expect, it } from 'vitest';
import { environmentSchema } from '../src/platform/config/environment.js';

const baseEnvironment = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/gather-test',
  OUTBOX_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('API environment flags', () => {
  it('keeps screen sharing disabled unless explicitly enabled', () => {
    expect(environmentSchema.parse(baseEnvironment).SCREEN_SHARE_ENABLED).toBe(false);
    expect(
      environmentSchema.parse({ ...baseEnvironment, SCREEN_SHARE_ENABLED: 'false' })
        .SCREEN_SHARE_ENABLED,
    ).toBe(false);
    expect(
      environmentSchema.parse({ ...baseEnvironment, SCREEN_SHARE_ENABLED: 'true' })
        .SCREEN_SHARE_ENABLED,
    ).toBe(true);
  });

  it('rejects ambiguous screen-sharing flag values', () => {
    expect(
      environmentSchema.safeParse({ ...baseEnvironment, SCREEN_SHARE_ENABLED: 'yes' }).success,
    ).toBe(false);
  });
});
