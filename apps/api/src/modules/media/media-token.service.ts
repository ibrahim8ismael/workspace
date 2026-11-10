import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import type { MediaTokenRequest, MediaTokenResponse } from '@gather/contracts';
import { mediaTokenResponseSchema } from '@gather/contracts';
import type { ActorContext } from '../identity/sessions/session.service.js';
import { AbuseService } from '../identity/security/abuse.service.js';
import { TenancyModels } from '../tenancy/tenancy.models.js';
import { TenancyService } from '../tenancy/tenancy.service.js';
import { OfficeRuntimeService } from '../office/runtime/office-runtime.service.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import type { ApiEnvironment } from '../../platform/config/environment.js';
import { invariant } from '../../platform/http/errors.js';
import { MediaPolicyService } from './media-policy.service.js';

const MEDIA_TOKEN_TTL_SECONDS = 60;

@Injectable()
export class MediaTokenService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(TenancyModels) private readonly tenancyModels: TenancyModels,
    @Inject(TenancyService) private readonly tenancy: TenancyService,
    @Inject(OfficeRuntimeService) private readonly runtime: OfficeRuntimeService,
    @Inject(MediaPolicyService) private readonly policy: MediaPolicyService,
    @Inject(AbuseService) private readonly abuse: AbuseService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  async issue(
    actor: ActorContext,
    conversationId: string,
    input: MediaTokenRequest,
  ): Promise<MediaTokenResponse> {
    const conversation = this.runtime.proximityMediaParticipation(
      input.participationId,
      conversationId,
      input.conversationVersion,
    );
    invariant(conversation, 409, 'stale_version');
    invariant(
      conversation.userId === actor.user._id && conversation.sessionId === actor.session._id,
      404,
      'not_found',
    );

    await this.abuse.consume(
      'media-token',
      `${conversation.workspaceId}:${actor.user._id}`,
      30,
      60_000,
    );

    const membership = await this.db.transaction(async (tx) => {
      const { member } = await this.tenancy.lockAccess(actor, conversation.workspaceId, tx);
      const office = await this.tenancyModels.offices
        .findOne({ _id: conversation.officeId, workspaceId: conversation.workspaceId })
        .session(tx)
        .lean();
      invariant(office, 404, 'not_found');
      return { member, mapVersion: office.mapVersion };
    });
    invariant(
      (membership.member.membershipGrantId ?? membership.member._id) ===
        conversation.membershipGrantId && membership.mapVersion === conversation.mapVersion,
      403,
      'membership_required',
    );

    const current = this.runtime.proximityMediaParticipation(
      input.participationId,
      conversationId,
      input.conversationVersion,
    );
    invariant(
      current &&
        current.userId === actor.user._id &&
        current.sessionId === actor.session._id &&
        current.workspaceId === conversation.workspaceId &&
        current.officeId === conversation.officeId &&
        current.officeEpoch === conversation.officeEpoch &&
        current.generation === conversation.generation,
      409,
      'stale_version',
    );
    invariant(
      this.policy.hasInstalledPermit(current.generation, current.participationId, 'microphone'),
      503,
      'media_unavailable',
    );

    const serverUrl = this.config.get('LIVEKIT_URL', { infer: true });
    const apiKey = this.config.get('LIVEKIT_API_KEY', { infer: true });
    const apiSecret = this.config.get('LIVEKIT_API_SECRET', { infer: true });
    invariant(serverUrl && apiKey && apiSecret, 503, 'media_unavailable');

    const now = Date.now();
    const sessionDeadline = Math.min(
      actor.session.absoluteExpiresAt.getTime(),
      actor.session.idleExpiresAt.getTime(),
    );
    const tokenDeadline = Math.min(now + MEDIA_TOKEN_TTL_SECONDS * 1000, sessionDeadline);
    const ttlSeconds = Math.floor((tokenDeadline - now) / 1000);
    invariant(ttlSeconds >= 1, 401, 'unauthorized');

    const tokenGrant = new AccessToken(apiKey, apiSecret, {
      identity: current.participationId,
      name: current.displayName,
      ttl: ttlSeconds,
    });
    tokenGrant.addGrant({
      roomJoin: true,
      room: current.room,
      roomAdmin: false,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });

    let token: string;
    try {
      token = await tokenGrant.toJwt();
    } catch {
      invariant(false, 503, 'media_unavailable');
    }
    const stillCurrent = this.runtime.proximityMediaParticipation(
      input.participationId,
      conversationId,
      input.conversationVersion,
    );
    invariant(
      stillCurrent &&
        stillCurrent.userId === actor.user._id &&
        stillCurrent.sessionId === actor.session._id &&
        stillCurrent.generation === current.generation &&
        this.policy.hasInstalledPermit(
          stillCurrent.generation,
          stillCurrent.participationId,
          'microphone',
        ),
      409,
      'stale_version',
    );
    const tokenPayload = token.split('.')[1];
    invariant(tokenPayload, 503, 'media_unavailable');
    let expiresAtSeconds: unknown;
    try {
      expiresAtSeconds = (
        JSON.parse(Buffer.from(tokenPayload, 'base64url').toString('utf8')) as {
          exp?: unknown;
        }
      ).exp;
    } catch {
      invariant(false, 503, 'media_unavailable');
    }
    invariant(Number.isSafeInteger(expiresAtSeconds), 503, 'media_unavailable');

    return mediaTokenResponseSchema.parse({
      serverUrl,
      token,
      expiresAt: new Date((expiresAtSeconds as number) * 1000).toISOString(),
      conversationVersion: current.conversationVersion,
      generation: current.generation,
    });
  }
}
