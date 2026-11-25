import { describe, expect, it, vi } from 'vitest';
import { TrackSource } from 'livekit-server-sdk';
import { meetingScreenShareTrackName } from '@gather/contracts';
import { MediaMeetingScreenShareLifecycleService } from '../dist/modules/media/media-meeting-screen-share-lifecycle.service.js';

const activeShare = {
  room: 'meeting-generation',
  shareId: '30000000-0000-4000-8000-000000000001',
  presenterParticipationId: '40000000-0000-4000-8000-000000000001',
  livekitParticipantSid: 'LK_PRESENTATION_SESSION_1',
  status: 'live' as const,
  startedAt: 1_800_000_000_000,
};

function createFixture() {
  let current: typeof activeShare | null = activeShare;
  const runtime = {
    activeMeetingScreenShare: vi.fn((room: string) => (room === current?.room ? current : null)),
    observeMeetingScreenSharePublication: vi.fn(() => true),
    clearMeetingScreenShareFromMediaObservation: vi.fn(
      (room: string, presenterParticipationId: string, shareId: string) => {
        if (
          current?.room !== room ||
          current.presenterParticipationId !== presenterParticipationId ||
          current.shareId !== shareId
        )
          return false;
        current = null;
        return true;
      },
    ),
    drainMeetingScreenShareNotices: vi.fn(() => []),
    setCurrent(value: typeof activeShare | null) {
      current = value;
    },
  };
  const roomEvents = { publishMeetingScreenShareNotices: vi.fn() };
  const lifecycle = new MediaMeetingScreenShareLifecycleService(
    runtime as never,
    roomEvents as never,
  );
  return { lifecycle, runtime, roomEvents };
}

describe('meeting screen-share lifecycle reconciliation', () => {
  it('ignores late unpublish observations for a prior share ID', () => {
    const fixture = createFixture();
    expect(
      fixture.lifecycle.reconcileWebhook({
        eventName: 'track_unpublished',
        roomName: activeShare.room,
        occurredAt: activeShare.startedAt + 1000,
        participantIdentity: activeShare.presenterParticipationId,
        participantSid: activeShare.livekitParticipantSid,
        track: {
          name: meetingScreenShareTrackName('30000000-0000-4000-8000-000000000099'),
          source: TrackSource.SCREEN_SHARE,
        },
      }),
    ).toBe(false);
    expect(fixture.runtime.clearMeetingScreenShareFromMediaObservation).not.toHaveBeenCalled();
  });

  it('ignores an old unpublish event even if a share ID is replayed after its retention window', () => {
    const fixture = createFixture();
    expect(
      fixture.lifecycle.reconcileWebhook({
        eventName: 'track_unpublished',
        roomName: activeShare.room,
        occurredAt: activeShare.startedAt,
        participantIdentity: activeShare.presenterParticipationId,
        participantSid: activeShare.livekitParticipantSid,
        track: {
          name: meetingScreenShareTrackName(activeShare.shareId),
          source: TrackSource.SCREEN_SHARE,
        },
      }),
    ).toBe(false);
    expect(fixture.runtime.clearMeetingScreenShareFromMediaObservation).not.toHaveBeenCalled();
  });

  it('clears only the exact server-owned share after a signed screen track unpublish', () => {
    const fixture = createFixture();
    expect(
      fixture.lifecycle.reconcileWebhook({
        eventName: 'track_unpublished',
        roomName: activeShare.room,
        occurredAt: activeShare.startedAt + 1000,
        participantIdentity: activeShare.presenterParticipationId,
        participantSid: activeShare.livekitParticipantSid,
        track: {
          name: meetingScreenShareTrackName(activeShare.shareId),
          source: TrackSource.SCREEN_SHARE,
        },
      }),
    ).toBe(true);
    expect(fixture.runtime.clearMeetingScreenShareFromMediaObservation).toHaveBeenCalledWith(
      activeShare.room,
      activeShare.presenterParticipationId,
      activeShare.shareId,
    );
    expect(fixture.roomEvents.publishMeetingScreenShareNotices).toHaveBeenCalledOnce();
    expect(fixture.runtime.drainMeetingScreenShareNotices).toHaveBeenCalledOnce();
  });

  it('ignores publications as authorization and rejects mismatched source or presenter', () => {
    const fixture = createFixture();
    for (const event of [
      {
        eventName: 'track_published',
        roomName: activeShare.room,
        occurredAt: activeShare.startedAt + 1000,
        participantIdentity: activeShare.presenterParticipationId,
        participantSid: activeShare.livekitParticipantSid,
        track: {
          name: meetingScreenShareTrackName(activeShare.shareId),
          source: TrackSource.SCREEN_SHARE,
        },
      },
      {
        eventName: 'track_unpublished',
        roomName: activeShare.room,
        occurredAt: activeShare.startedAt + 1000,
        participantIdentity: '50000000-0000-4000-8000-000000000001',
        track: {
          name: meetingScreenShareTrackName(activeShare.shareId),
          source: TrackSource.SCREEN_SHARE,
        },
      },
      {
        eventName: 'track_unpublished',
        roomName: activeShare.room,
        occurredAt: activeShare.startedAt + 1000,
        participantIdentity: activeShare.presenterParticipationId,
        participantSid: 'LK_OLD_SESSION',
        track: {
          name: meetingScreenShareTrackName(activeShare.shareId),
          source: TrackSource.SCREEN_SHARE,
        },
      },
      {
        eventName: 'track_unpublished',
        roomName: activeShare.room,
        occurredAt: activeShare.startedAt + 1000,
        participantIdentity: activeShare.presenterParticipationId,
        participantSid: activeShare.livekitParticipantSid,
        track: {
          name: meetingScreenShareTrackName(activeShare.shareId),
          source: TrackSource.MICROPHONE,
        },
      },
    ])
      expect(fixture.lifecycle.reconcileWebhook(event)).toBe(false);

    expect(fixture.runtime.clearMeetingScreenShareFromMediaObservation).not.toHaveBeenCalled();
    expect(fixture.runtime.observeMeetingScreenSharePublication).toHaveBeenCalledOnce();
  });

  it('does not let an old participant-left or room-finished event clear a newer presentation', () => {
    const fixture = createFixture();
    fixture.runtime.setCurrent({
      ...activeShare,
      shareId: '30000000-0000-4000-8000-000000000002',
      startedAt: activeShare.startedAt + 20_000,
    });

    for (const eventName of ['participant_left', 'room_finished'])
      expect(
        fixture.lifecycle.reconcileWebhook({
          eventName,
          roomName: activeShare.room,
          occurredAt: activeShare.startedAt + 10_000,
          participantIdentity: activeShare.presenterParticipationId,
        }),
      ).toBe(false);

    expect(fixture.runtime.clearMeetingScreenShareFromMediaObservation).not.toHaveBeenCalled();
  });

  it('clears the live reservation when a newer presenter-loss event arrives', () => {
    const fixture = createFixture();
    expect(
      fixture.lifecycle.reconcileWebhook({
        eventName: 'participant_left',
        roomName: activeShare.room,
        occurredAt: activeShare.startedAt + 1000,
        participantIdentity: activeShare.presenterParticipationId,
        participantSid: activeShare.livekitParticipantSid,
      }),
    ).toBe(true);
    expect(fixture.runtime.clearMeetingScreenShareFromMediaObservation).toHaveBeenCalledWith(
      activeShare.room,
      activeShare.presenterParticipationId,
      activeShare.shareId,
    );
  });
});
