import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookReceiver } from 'livekit-server-sdk';
import type { ApiEnvironment } from '../../platform/config/environment.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { fail, invariant } from '../../platform/http/errors.js';
import type { MediaWebhookDisposition } from './media-webhook.models.js';
import { MediaWebhookModels } from './media-webhook.models.js';

const DEDUPLICATION_RETENTION_DAYS = 30;
const OBSERVED_EVENTS = new Set([
  'room_started',
  'room_finished',
  'participant_joined',
  'participant_left',
  'participant_connection_aborted',
  'track_published',
  'track_unpublished',
]);

interface VerifiedLiveKitEvent {
  id?: unknown;
  event?: unknown;
  createdAt?: unknown;
  room?: { name?: unknown } | null;
  participant?: { identity?: unknown } | null;
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

@Injectable()
export class MediaWebhookService {
  constructor(
    @Inject(MediaWebhookModels) private readonly observations: MediaWebhookModels,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async receive(rawBody: Buffer, authorization: string | undefined) {
    const apiKey = this.config.get('LIVEKIT_API_KEY', { infer: true });
    const apiSecret = this.config.get('LIVEKIT_API_SECRET', { infer: true });
    invariant(apiKey && apiSecret, 503, 'media_unavailable');
    invariant(rawBody.length > 0 && rawBody.length <= 64 * 1024, 400, 'validation_failed');

    let event: VerifiedLiveKitEvent;
    try {
      const verified = await new WebhookReceiver(apiKey, apiSecret).receive(
        rawBody.toString('utf8'),
        authorization,
      );
      event = verified as VerifiedLiveKitEvent;
    } catch {
      fail(401, 'unauthorized');
    }

    if (typeof event.event !== 'string' || !OBSERVED_EVENTS.has(event.event))
      return { disposition: 'ignored' as const };

    invariant(typeof event.id === 'string' && event.id.length <= 128, 400, 'validation_failed');
    invariant(
      typeof event.room?.name === 'string' &&
        event.room.name.length > 0 &&
        event.room.name.length <= 256,
      400,
      'validation_failed',
    );
    const occurredAtSeconds = Number(event.createdAt);
    invariant(
      Number.isSafeInteger(occurredAtSeconds) && occurredAtSeconds > 0,
      400,
      'validation_failed',
    );
    const occurredAt = new Date(occurredAtSeconds * 1000);
    invariant(Number.isFinite(occurredAt.getTime()), 400, 'validation_failed');
    invariant(
      event.participant?.identity === undefined ||
        (typeof event.participant.identity === 'string' &&
          event.participant.identity.length > 0 &&
          event.participant.identity.length <= 256),
      400,
      'validation_failed',
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEDUPLICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const participantIdentity = event.participant?.identity as string | undefined;
    const store = () =>
      this.db.transaction(async (session) => {
        const duplicate = await this.observations.events.findById(event.id).session(session).lean();
        if (duplicate) return { disposition: 'duplicate' as const };

        const roomName = event.room!.name as string;
        const cursor = await this.observations.roomCursors
          .findById(roomName)
          .session(session)
          .lean();
        let disposition: MediaWebhookDisposition;
        if (!cursor) {
          disposition = 'advanced';
          await this.observations.roomCursors.create(
            [
              {
                _id: roomName,
                eventId: event.id as string,
                eventName: event.event as string,
                occurredAt,
                updatedAt: now,
              },
            ],
            { session },
          );
        } else if (occurredAt.getTime() > cursor.occurredAt.getTime()) {
          disposition = 'advanced';
          const advanced = await this.observations.roomCursors.updateOne(
            { _id: roomName, occurredAt: cursor.occurredAt },
            {
              $set: {
                eventId: event.id as string,
                eventName: event.event as string,
                occurredAt,
                updatedAt: now,
              },
            },
            { session },
          );
          invariant(advanced.modifiedCount === 1, 409, 'conflict');
        } else if (occurredAt.getTime() < cursor.occurredAt.getTime()) {
          disposition = 'late';
        } else {
          disposition = 'same_time';
        }

        await this.observations.events.create(
          [
            {
              _id: event.id as string,
              eventName: event.event as string,
              roomName,
              ...(participantIdentity ? { participantIdentity } : {}),
              occurredAt,
              receivedAt: now,
              expiresAt,
              disposition,
            },
          ],
          { session },
        );
        return { disposition };
      });
    try {
      return await store();
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      return store();
    }
  }
}
