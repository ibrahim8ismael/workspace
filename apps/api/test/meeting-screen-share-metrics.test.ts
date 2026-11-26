import { describe, expect, it } from 'vitest';
import { MeetingScreenShareMetricsService } from '../dist/modules/office/meeting-screen-share-metrics.service.js';

function config(enabled = true) {
  return {
    get: (key: string) => (key === 'SCREEN_SHARE_ENABLED' ? enabled : undefined),
  } as never;
}

describe('meeting screen-share operational metrics', () => {
  it('aggregates outcomes and viewer latency without exposing identifiers', async () => {
    const metrics = new MeetingScreenShareMetricsService(config());
    const privateKey = 'conversation-secret:share-secret';
    metrics.startAttempt(privateKey, null);
    metrics.startConfirmation(privateKey, null);
    metrics.firstFrame(120);
    metrics.firstFrame(280);
    metrics.unexpectedDisconnect();

    const snapshot = await metrics.snapshot({ active: 0, starting: 0 });
    expect(snapshot).toMatchObject({
      screenSharingEnabled: true,
      starts: { attempts: 1, succeeded: 1, failed: 0 },
      shares: { active: 0, starting: 0 },
      viewerTimeToFirstFrameMs: { samples: 2, average: 200, max: 280 },
      unexpectedPresenterDisconnects: 1,
      livekit: { available: false, reason: 'not_configured' },
    });
    expect(JSON.stringify(snapshot)).not.toContain(privateKey);
  });

  it('counts denied starts using bounded reason labels', async () => {
    const metrics = new MeetingScreenShareMetricsService(config(false));
    metrics.startAttempt('private', 'unauthorized');
    const snapshot = await metrics.snapshot({ active: 0, starting: 0 });
    expect(snapshot.screenSharingEnabled).toBe(false);
    expect(snapshot.starts).toMatchObject({
      attempts: 1,
      succeeded: 0,
      failed: 1,
      failureReasons: { unauthorized: 1 },
    });
    expect(JSON.stringify(snapshot)).not.toContain('private');
  });
});
