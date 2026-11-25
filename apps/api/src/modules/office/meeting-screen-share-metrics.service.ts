import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomServiceClient } from 'livekit-server-sdk';
import type { ApiEnvironment } from '../../platform/config/environment.js';

const START_CONFIRMATION_WINDOW_MS = 30_000;
const MAX_PENDING_STARTS = 2048;

/** Aggregated operational measurements; no participant, room, or share identifiers leave memory. */
@Injectable()
export class MeetingScreenShareMetricsService {
  private readonly pendingStarts = new Map<string, number>();
  private readonly startFailures: Record<string, number> = {};
  private startAttempts = 0;
  private successfulStarts = 0;
  private firstFrameSamples = 0;
  private firstFrameDurationTotalMs = 0;
  private firstFrameDurationMaxMs = 0;
  private unexpectedPresenterDisconnects = 0;
  private previousCpu = process.cpuUsage();

  constructor(private readonly config: ConfigService<ApiEnvironment, true>) {}

  startAttempt(key: string, error: string | null) {
    this.expirePendingStarts();
    this.startAttempts += 1;
    if (error) {
      this.countFailure(error);
      return;
    }
    this.pendingStarts.set(key, Date.now());
    while (this.pendingStarts.size > MAX_PENDING_STARTS)
      this.failPendingStart(this.pendingStarts.keys().next().value!, 'metrics_capacity');
  }

  startConfirmation(key: string, error: string | null) {
    this.expirePendingStarts();
    if (error) {
      this.failPendingStart(key, error);
      return;
    }
    if (this.pendingStarts.delete(key)) this.successfulStarts += 1;
  }

  endShare(key: string) {
    this.pendingStarts.delete(key);
  }

  unexpectedDisconnect() {
    this.unexpectedPresenterDisconnects += 1;
  }

  firstFrame(elapsedMs: number) {
    this.firstFrameSamples += 1;
    this.firstFrameDurationTotalMs += elapsedMs;
    this.firstFrameDurationMaxMs = Math.max(this.firstFrameDurationMaxMs, elapsedMs);
  }

  async snapshot(active: { active: number; starting: number }) {
    this.expirePendingStarts();
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage(this.previousCpu);
    this.previousCpu = process.cpuUsage();
    return {
      screenSharingEnabled: this.config.get('SCREEN_SHARE_ENABLED', { infer: true }),
      starts: {
        attempts: this.startAttempts,
        succeeded: this.successfulStarts,
        failed: Object.values(this.startFailures).reduce((sum, count) => sum + count, 0),
        failureReasons: { ...this.startFailures },
      },
      shares: { active: active.active, starting: active.starting },
      viewerTimeToFirstFrameMs: {
        samples: this.firstFrameSamples,
        average:
          this.firstFrameSamples === 0
            ? null
            : Math.round(this.firstFrameDurationTotalMs / this.firstFrameSamples),
        max: this.firstFrameSamples === 0 ? null : this.firstFrameDurationMaxMs,
      },
      unexpectedPresenterDisconnects: this.unexpectedPresenterDisconnects,
      apiProcess: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        cpuUserMicrosSincePreviousScrape: cpu.user,
        cpuSystemMicrosSincePreviousScrape: cpu.system,
      },
      livekit: await this.liveKitUsage(),
    };
  }

  private expirePendingStarts(now = Date.now()) {
    for (const [key, startedAt] of this.pendingStarts)
      if (now - startedAt >= START_CONFIRMATION_WINDOW_MS)
        this.failPendingStart(key, 'confirmation_timeout');
  }

  private failPendingStart(key: string, reason: string) {
    if (!this.pendingStarts.delete(key)) return;
    this.countFailure(reason);
  }

  private countFailure(reason: string) {
    const safeReason =
      /^[a-z][a-z0-9_]{0,39}$/.test(reason) &&
      [
        'unauthorized',
        'stale_epoch',
        'stale_version',
        'conflict',
        'media_unavailable',
        'rate_limited',
        'validation_failed',
        'confirmation_timeout',
        'metrics_capacity',
      ].includes(reason)
        ? reason
        : 'other';
    this.startFailures[safeReason] = (this.startFailures[safeReason] ?? 0) + 1;
  }

  private async liveKitUsage() {
    const url = this.config.get('LIVEKIT_URL', { infer: true });
    const apiKey = this.config.get('LIVEKIT_API_KEY', { infer: true });
    const apiSecret = this.config.get('LIVEKIT_API_SECRET', { infer: true });
    if (!url || !apiKey || !apiSecret) return { available: false, reason: 'not_configured' };
    try {
      const service = new RoomServiceClient(url.replace(/^ws/, 'http'), apiKey, apiSecret, {
        requestTimeout: 2,
        failover: false,
      });
      const rooms = await service.listRooms();
      return {
        available: true,
        roomCount: rooms.length,
        participantCount: rooms.reduce((total, room) => total + room.numParticipants, 0),
      };
    } catch {
      return { available: false, reason: 'unreachable' };
    }
  }
}
