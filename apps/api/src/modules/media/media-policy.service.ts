import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import {
  mediaPolicyInstallAckSchema,
  mediaPolicyPullSchema,
  mediaPolicySnapshotSchema,
} from '@gather/contracts';
import type { MediaPolicyPermit, MediaPolicySnapshot } from '@gather/contracts';
import { invariant } from '../../platform/http/errors.js';
import type { ApiEnvironment } from '../../platform/config/environment.js';
import { OfficeRuntimeService } from '../office/runtime/office-runtime.service.js';
import { OfficeRoomEventPublisher } from '../office/office-room-event-publisher.js';

interface PendingPolicy {
  readonly snapshot: MediaPolicySnapshot;
  readonly expiresAt: number;
}

interface InstalledPolicy {
  readonly epoch: string;
  readonly sequence: number;
  readonly expiresAt: number;
  readonly permits: readonly MediaPolicyPermit[];
}

/** Application-policy bridge for the private CP07 guard pull/install-ack protocol. */
@Injectable()
export class MediaPolicyService {
  private activeEpoch: string | null = null;
  private sequence = 0;
  private lastPullAt = 0;
  private installed: InstalledPolicy | null = null;
  private readonly pending = new Map<string, PendingPolicy>();
  private readonly usedNonces = new Map<string, number>();

  constructor(
    @Inject(OfficeRuntimeService) private readonly runtime: OfficeRuntimeService,
    @Inject(OfficeRoomEventPublisher) private readonly roomEvents: OfficeRoomEventPublisher,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  issueSnapshot(raw: unknown) {
    const challenge = mediaPolicyPullSchema.parse(raw);
    const now = Date.now();
    this.prune(now);
    invariant(!this.usedNonces.has(challenge.nonce), 409, 'conflict');

    if (this.activeEpoch !== challenge.epoch) {
      invariant(this.activeEpoch === null || now - this.lastPullAt >= 5000, 409, 'conflict');
      this.activeEpoch = challenge.epoch;
      this.sequence = 0;
      this.pending.clear();
      this.installed = null;
    }
    invariant(now - this.lastPullAt >= 100, 429, 'rate_limited');

    const permits = this.runtime.proximityMediaPermits();
    invariant(permits.length <= 256, 503, 'media_unavailable');
    const snapshot = mediaPolicySnapshotSchema.parse({
      ...challenge,
      sequence: this.sequence + 1,
      permits,
    });
    this.sequence = snapshot.sequence;
    this.lastPullAt = now;
    this.pending.set(challenge.nonce, { snapshot, expiresAt: now + 5000 });
    this.usedNonces.set(challenge.nonce, now + 10_000);

    const body = JSON.stringify(snapshot);
    return { body, signature: this.sign(body) };
  }

  acknowledgeInstallation(raw: unknown) {
    const acknowledgement = mediaPolicyInstallAckSchema.parse(raw);
    const now = Date.now();
    this.prune(now);
    const pending = this.pending.get(acknowledgement.nonce);
    invariant(
      pending &&
        this.activeEpoch === acknowledgement.epoch &&
        pending.snapshot.epoch === acknowledgement.epoch &&
        pending.snapshot.sequence === acknowledgement.sequence &&
        pending.expiresAt > now &&
        (!this.installed || this.installed.sequence < acknowledgement.sequence),
      409,
      'conflict',
    );
    const body = JSON.stringify({ acknowledged: true, sequence: acknowledgement.sequence });
    const signature = this.sign(body);
    this.pending.delete(acknowledgement.nonce);
    this.installed = {
      epoch: acknowledgement.epoch,
      sequence: acknowledgement.sequence,
      expiresAt: pending.expiresAt,
      permits: pending.snapshot.permits,
    };

    const generations = new Set(pending.snapshot.permits.map((permit) => permit.generation));
    for (const generation of generations) {
      this.roomEvents.publishConversationNotices(
        this.runtime.activateProximityGeneration(generation),
      );
    }
    return { body, signature };
  }

  hasInstalledPermit(generation: string, identity: string, source: 'microphone') {
    const installed = this.installed;
    if (!installed || installed.expiresAt <= Date.now()) return false;
    return installed.permits.some(
      (permit) =>
        permit.generation === generation &&
        permit.identity === identity &&
        permit.room === generation &&
        permit.version === 1 &&
        permit.sources.includes(source),
    );
  }

  private sign(value: string) {
    const encodedKey = this.config.get('MEDIA_MACHINE_KEY', { infer: true });
    invariant(encodedKey, 503, 'media_unavailable');
    return createHmac('sha256', Buffer.from(encodedKey, 'base64')).update(value).digest('hex');
  }

  private prune(now: number) {
    for (const [nonce, expiry] of this.usedNonces) {
      if (expiry <= now) this.usedNonces.delete(nonce);
    }
    for (const [nonce, pending] of this.pending) {
      if (pending.expiresAt <= now) this.pending.delete(nonce);
    }
    invariant(this.pending.size <= 32, 429, 'rate_limited');
    if (this.usedNonces.size > 2048) {
      const oldest = [...this.usedNonces.entries()].sort((a, b) => a[1] - b[1]);
      for (const [nonce] of oldest.slice(0, this.usedNonces.size - 2048))
        this.usedNonces.delete(nonce);
    }
  }
}
