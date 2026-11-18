import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfficeWave } from '@gather/contracts';
import {
  notifyReceivedWaves,
  WaveNotificationSound,
} from '../src/features/office/wave-notification';

const recipient = 'recipient';
const sender = 'sender';
const event = (eventId: string, recipientParticipationId = recipient) =>
  ({ eventId, recipientParticipationId }) as OfficeWave;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('wave notification routing', () => {
  it('notifies only the addressed member and consumes duplicates', () => {
    const seen = new Set<string>();
    const notify = vi.fn();
    const ownWave = event('own');
    notifyReceivedWaves([ownWave, event('other', sender), ownWave], recipient, seen, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(new Set(['own', 'other']));
  });

  it('does not replay a consumed wave when preferences become enabled later', () => {
    const seen = new Set<string>();
    let volume = 0;
    const play = vi.fn();
    const notify = () => {
      if (volume > 0) play();
    };
    notifyReceivedWaves([event('muted')], recipient, seen, notify);
    volume = 0.7;
    notifyReceivedWaves([event('muted')], recipient, seen, notify);
    expect(play).not.toHaveBeenCalled();
  });
});

function fakeAudioContext(state: AudioContextState = 'running') {
  function gainNode() {
    return {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  const gains: ReturnType<typeof gainNode>[] = [];
  const oscillator = () => ({
    type: 'sine',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
  });
  const context = {
    state,
    currentTime: 1,
    destination: {},
    createGain: vi.fn(function () {
      const node = gainNode();
      gains.push(node);
      return node;
    }),
    createOscillator: vi.fn(oscillator),
    resume: vi.fn(function () {
      context.state = 'running';
      return Promise.resolve();
    }),
    close: vi.fn().mockResolvedValue(undefined),
    gains,
  };
  return context;
}

describe('WaveNotificationSound', () => {
  it('plays one short cue at a time and permits the next after it ends', () => {
    vi.useFakeTimers();
    const context = fakeAudioContext();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return context;
      }),
    );
    const sound = new WaveNotificationSound();
    sound.play(0.7);
    sound.play(0.7);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(220);
    expect(context.createOscillator).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(220);
    expect(context.gains.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
    sound.stop();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('does not play queued cues if effects are muted before their turn', () => {
    vi.useFakeTimers();
    const context = fakeAudioContext();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return context;
      }),
    );
    const sound = new WaveNotificationSound();
    let volume = 0.7;
    sound.play(volume, () => volume);
    sound.play(volume, () => volume);
    volume = 0;
    vi.advanceTimersByTime(220);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    sound.stop();
  });

  it('skips blocked or unavailable audio without throwing and cleans up on stop', () => {
    const suspended = fakeAudioContext('suspended');
    const browserWindow = new EventTarget();
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return suspended;
      }),
    );
    const sound = new WaveNotificationSound();
    expect(() => sound.play(0.7)).not.toThrow();
    expect(suspended.createOscillator).not.toHaveBeenCalled();
    sound.stop();
    expect(suspended.close).toHaveBeenCalledOnce();
    browserWindow.dispatchEvent(new Event('pointerdown'));
    expect(suspended.resume).not.toHaveBeenCalled();

    vi.stubGlobal('AudioContext', undefined);
    expect(() => new WaveNotificationSound().play(0.7)).not.toThrow();
  });

  it('unlocks on a user gesture but only plays a later fresh wave', async () => {
    const suspended = fakeAudioContext('suspended');
    const browserWindow = new EventTarget();
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return suspended;
      }),
    );
    const sound = new WaveNotificationSound();
    sound.play(0.7); // This blocked wave is intentionally discarded.
    expect(suspended.createOscillator).not.toHaveBeenCalled();

    browserWindow.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(suspended.resume).toHaveBeenCalledOnce();
    sound.play(0.7); // A new wave after activation is audible.
    expect(suspended.createOscillator).toHaveBeenCalledTimes(2);
    sound.stop();
  });

  it('disconnects created gain nodes when cue setup fails', () => {
    const context = fakeAudioContext();
    context.createOscillator.mockImplementationOnce(() => {
      throw new Error('audio unavailable');
    });
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return context;
      }),
    );
    const sound = new WaveNotificationSound();
    expect(() => sound.play(0.7)).not.toThrow();
    expect(context.gains.length).toBeGreaterThan(0);
    expect(context.gains.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
    sound.stop();
  });
});
