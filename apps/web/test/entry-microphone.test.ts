import { describe, expect, it, vi } from 'vitest';
import { EntryMicrophone } from '../src/features/office/entry-microphone';

function microphone() {
  const track = new EventTarget() as EventTarget & {
    readyState: string;
    stop: ReturnType<typeof vi.fn>;
  };
  track.readyState = 'live';
  track.stop = vi.fn(() => {
    track.readyState = 'ended';
  });
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  return { track, stream };
}

describe('office entry microphone capture', () => {
  it('starts off, captures only after a click and releases all tracks when switched off', async () => {
    const { track, stream } = microphone();
    const capture = vi.fn(async () => stream);
    const mic = new EntryMicrophone(capture);
    expect(mic.getSnapshot().status).toBe('off');
    expect(capture).not.toHaveBeenCalled();
    await mic.toggle();
    expect(mic.getSnapshot().status).toBe('on');
    await mic.toggle();
    expect(mic.getSnapshot().status).toBe('off');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('stops a late permission grant after cancellation or navigating away', async () => {
    const { track, stream } = microphone();
    let grant!: (stream: MediaStream) => void;
    const mic = new EntryMicrophone(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    );
    const pending = mic.toggle();
    expect(mic.getSnapshot().status).toBe('requesting');
    mic.stop();
    grant(stream);
    await pending;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(mic.getSnapshot().status).toBe('off');
  });

  it('shows denied permission without claiming the microphone is on and allows retry', async () => {
    const { stream } = microphone();
    const capture = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
      .mockResolvedValueOnce(stream);
    const mic = new EntryMicrophone(capture);
    await mic.toggle();
    expect(mic.getSnapshot().status).toBe('error');
    expect(mic.getSnapshot().message).toContain('denied');
    await mic.toggle();
    expect(mic.getSnapshot().status).toBe('on');
    mic.stop();
  });

  it('clears capture when a device disconnects', async () => {
    const { stream, track } = microphone();
    const mic = new EntryMicrophone(async () => stream);
    await mic.toggle();
    track.dispatchEvent(new Event('ended'));
    expect(mic.getSnapshot().status).toBe('error');
    expect(track.stop).toHaveBeenCalledOnce();
  });
});
