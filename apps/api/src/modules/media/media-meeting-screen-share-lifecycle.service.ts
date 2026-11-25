import { Inject, Injectable, Logger } from '@nestjs/common';
import { TrackSource } from 'livekit-server-sdk';
import { meetingScreenShareTrackName } from '@gather/contracts';
import { OfficeRoomEventPublisher } from '../office/office-room-event-publisher.js';
import { OfficeRuntimeService } from '../office/runtime/office-runtime.service.js';

export interface MeetingScreenShareMediaEvent {
  readonly eventName: string;
  readonly roomName: string;
  readonly occurredAt: number;
  readonly participantIdentity?: string;
  readonly participantSid?: string;
  readonly track?: {
    readonly name?: string;
    readonly source?: unknown;
  };
}

function isScreenShareSource(source: unknown) {
  return (
    source === TrackSource.SCREEN_SHARE || source === 'SCREEN_SHARE' || source === 'screen_share'
  );
}

/** Applies only revocations from verified LiveKit observations; app commands own authorization. */
@Injectable()
export class MediaMeetingScreenShareLifecycleService {
  private readonly logger = new Logger(MediaMeetingScreenShareLifecycleService.name);

  constructor(
    @Inject(OfficeRuntimeService) private readonly runtime: OfficeRuntimeService,
    @Inject(OfficeRoomEventPublisher) private readonly roomEvents: OfficeRoomEventPublisher,
  ) {}

  reconcileWebhook(event: MeetingScreenShareMediaEvent) {
    const active = this.runtime.activeMeetingScreenShare(event.roomName);
    if (!active || event.occurredAt <= active.startedAt) return false;

    if (event.eventName === 'track_published') {
      if (
        event.participantIdentity === active.presenterParticipationId &&
        event.participantSid &&
        isScreenShareSource(event.track?.source) &&
        event.track?.name === meetingScreenShareTrackName(active.shareId)
      )
        this.runtime.observeMeetingScreenSharePublication(
          active.room,
          active.presenterParticipationId,
          active.shareId,
          event.participantSid,
        );
      // Observations can bind the LiveKit session to a server-owned share, never make it live.
      return false;
    }
    if (event.eventName === 'track_unpublished') {
      if (
        event.participantIdentity !== active.presenterParticipationId ||
        (active.livekitParticipantSid !== undefined &&
          event.participantSid !== undefined &&
          event.participantSid !== active.livekitParticipantSid) ||
        !isScreenShareSource(event.track?.source) ||
        event.track?.name !== meetingScreenShareTrackName(active.shareId)
      )
        return false;
    } else {
      if (active.status !== 'live') return false;
      if (
        ['participant_left', 'participant_connection_aborted', 'room_finished'].includes(
          event.eventName,
        )
      ) {
        if (
          event.eventName !== 'room_finished' &&
          (event.participantIdentity !== active.presenterParticipationId ||
            !active.livekitParticipantSid ||
            event.participantSid !== active.livekitParticipantSid)
        )
          return false;
      } else {
        return false;
      }
    }

    const cleared = this.runtime.clearMeetingScreenShareFromMediaObservation(
      active.room,
      active.presenterParticipationId,
      active.shareId,
    );
    if (cleared) {
      this.roomEvents.publishMeetingScreenShareNotices(
        this.runtime.drainMeetingScreenShareNotices(),
      );
      this.logger.warn(
        JSON.stringify({
          event: 'meeting_screen_share_reconciled',
          reason: event.eventName,
          room: active.room,
          presenter: active.presenterParticipationId,
          shareId: active.shareId,
        }),
      );
    }
    return cleared;
  }
}
