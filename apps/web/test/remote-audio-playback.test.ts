import { describe, expect, it, vi } from 'vitest';
import { RemoteAudioPlayback } from '../src/features/office/remote-audio-playback';
import type { ProximityRemoteAudioTrack } from '../src/features/office/proximity-audio-session';

function fixture(play: () => Promise<void>) {
  const element = {
    play: vi.fn(play),
    dataset: {},
    setAttribute: vi.fn(),
    remove: vi.fn(),
    muted: true,
    volume: 0,
  };
  const track = {
    kind: 'audio',
    attach: () => element,
    detach: vi.fn(() => []),
  } as unknown as ProximityRemoteAudioTrack;
  return { element, track };
}

describe('remote audio playback', () => {
  it('reports blocked playback and retries from a user action', async () => {
    const state = vi.fn();
    const audio = fixture(async () => {
      throw new DOMException('Blocked', 'NotAllowedError');
    });
    const playback = new RemoteAudioPlayback(state);
    const detach = playback.attach(audio.track, 'coworker', null);
    await vi.waitFor(() => expect(state).toHaveBeenLastCalledWith(true));
    expect(audio.element.muted).toBe(false);
    expect(audio.element.volume).toBe(1);
    audio.element.play.mockResolvedValue(undefined);
    await playback.resume();
    expect(state).toHaveBeenLastCalledWith(false);
    detach();
    expect(audio.track.detach).toHaveBeenCalled();
    expect(audio.element.remove).toHaveBeenCalled();
  });

  it('does not revive a detached track when an old play rejection arrives', async () => {
    const state = vi.fn();
    let reject!: (reason: Error) => void;
    const audio = fixture(
      () =>
        new Promise((_, failed) => {
          reject = failed;
        }),
    );
    const playback = new RemoteAudioPlayback(state);
    const detach = playback.attach(audio.track, 'coworker', null);
    detach();
    reject(new Error('stale'));
    await Promise.resolve();
    await playback.resume();
    expect(state).toHaveBeenLastCalledWith(false);
    expect(audio.element.play).toHaveBeenCalledTimes(1);
  });
});
