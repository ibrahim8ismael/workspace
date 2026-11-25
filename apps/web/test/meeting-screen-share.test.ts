import { describe, expect, it, vi } from 'vitest';
import {
  canPublishDesktopScreen,
  MeetingScreenShareController,
  type MeetingScreenShareActions,
  type ScreenCapture,
} from '../src/features/office/meeting-screen-share';

function makeTrack() {
  const ended = new Set<() => void>();
  const track = {
    readyState: 'live' as MediaStreamTrackState,
    stop: vi.fn(() => {
      track.readyState = 'ended';
    }),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'ended') ended.add(listener as () => void);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'ended') ended.delete(listener as () => void);
    }),
    end() {
      track.readyState = 'ended';
      for (const listener of ended) listener();
    },
  };
  return track as unknown as MediaStreamTrack & { end(): void };
}

function makeStream(track: MediaStreamTrack) {
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function makeActions(order: string[] = []): MeetingScreenShareActions {
  return {
    reserve: vi.fn(async () => void order.push('reserve')),
    waitForPermission: vi.fn(async () => void order.push('permission')),
    publish: vi.fn(async () => void order.push('publish')),
    confirm: vi.fn(async () => void order.push('confirm')),
    unpublish: vi.fn(async () => void order.push('unpublish')),
    release: vi.fn(async () => void order.push('release')),
    isCurrent: vi.fn(() => true),
  };
}

describe('meeting screen-share controller', () => {
  it('opens video-only capture synchronously, then reserves, authorizes, and publishes in order', async () => {
    const order: string[] = [];
    const track = makeTrack();
    const capture = vi.fn((constraints: DisplayMediaStreamOptions) => {
      order.push('capture');
      expect(constraints.audio).toBe(false);
      return Promise.resolve(makeStream(track));
    });
    const actions = makeActions(order);
    const controller = new MeetingScreenShareController(capture, () => 'share-id');

    const start = controller.start(actions);
    expect(order).toEqual(['capture']);
    expect(controller.getSnapshot().status).toBe('capturing');
    await start;

    expect(order).toEqual(['capture', 'reserve', 'permission', 'publish', 'confirm']);
    expect(capture).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toEqual({ status: 'live', message: '' });
    expect(actions.reserve).toHaveBeenCalledWith('share-id');
    expect(actions.confirm).toHaveBeenCalledWith('share-id');
    await controller.stop();
    expect(order.slice(-2)).toEqual(['unpublish', 'release']);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().status).toBe('idle');
  });

  it('does not reserve a presenter slot when the native picker is cancelled', async () => {
    const actions = makeActions();
    const capture: ScreenCapture = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    const controller = new MeetingScreenShareController(capture);
    await controller.start(actions);

    expect(actions.reserve).not.toHaveBeenCalled();
    expect(actions.publish).not.toHaveBeenCalled();
    expect(actions.release).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({
      status: 'error',
      message: 'Screen sharing was cancelled or permission was denied.',
    });
  });

  it('releases capture after a competing presenter reservation is rejected', async () => {
    const track = makeTrack();
    const actions = makeActions();
    vi.mocked(actions.reserve).mockRejectedValue(new Error('conflict'));
    const controller = new MeetingScreenShareController(
      async () => makeStream(track),
      () => 'share-id',
    );
    await controller.start(actions);

    expect(actions.publish).not.toHaveBeenCalled();
    expect(actions.confirm).not.toHaveBeenCalled();
    expect(actions.release).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().message).toBe('Someone else is presenting in this meeting.');
  });

  it('releases the slot and capture when LiveKit permission or publication fails', async () => {
    const track = makeTrack();
    const actions = makeActions();
    vi.mocked(actions.waitForPermission).mockRejectedValue(new Error('policy_unavailable'));
    const controller = new MeetingScreenShareController(
      async () => makeStream(track),
      () => 'share-id',
    );
    await controller.start(actions);

    expect(actions.publish).not.toHaveBeenCalled();
    expect(actions.release).toHaveBeenCalledWith('share-id');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().status).toBe('error');

    const secondTrack = makeTrack();
    const secondActions = makeActions();
    vi.mocked(secondActions.publish).mockRejectedValue(
      new Error('screen_share_permission_missing'),
    );
    const second = new MeetingScreenShareController(
      async () => makeStream(secondTrack),
      () => 'second-share',
    );
    await second.start(secondActions);
    expect(secondActions.unpublish).not.toHaveBeenCalled();
    expect(secondActions.release).toHaveBeenCalledWith('second-share');
    expect(secondTrack.stop).toHaveBeenCalledOnce();
  });

  it('unpublishes and releases the reservation when browser-native Stop Sharing ends the track', async () => {
    const track = makeTrack();
    const actions = makeActions();
    const controller = new MeetingScreenShareController(
      async () => makeStream(track),
      () => 'share-id',
    );
    await controller.start(actions);
    track.end();
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe('idle'));

    expect(actions.unpublish).toHaveBeenCalledWith(track);
    expect(actions.release).toHaveBeenCalledWith('share-id');
  });

  it('does not offer screen publishing from mobile user agents or unsupported browsers', () => {
    expect(
      canPublishDesktopScreen('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true),
    ).toBe(false);
    expect(
      canPublishDesktopScreen(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15',
        true,
        'MacIntel',
        5,
      ),
    ).toBe(false);
    expect(canPublishDesktopScreen('Mozilla/5.0 (X11; Linux x86_64)', false)).toBe(false);
    expect(canPublishDesktopScreen('Mozilla/5.0 (X11; Linux x86_64)', true)).toBe(true);
  });
});
