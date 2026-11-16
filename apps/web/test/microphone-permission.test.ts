import { describe, expect, it, vi } from 'vitest';
import { MicrophonePermission } from '../src/features/office/microphone-permission';

function microphone() {
  const track = {
    readyState: 'live',
    stop: vi.fn(() => {
      track.readyState = 'ended';
    }),
  } as unknown as { readyState: string; stop: ReturnType<typeof vi.fn> } & MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  return { track, stream };
}

describe('proximity microphone permission probe', () => {
  it('requests only on explicit action and immediately stops the temporary stream', async () => {
    const { track, stream } = microphone();
    const capture = vi.fn(async () => stream);
    const permission = new MicrophonePermission(capture, vi.fn());

    expect(capture).not.toHaveBeenCalled();
    const request = permission.request();
    expect(capture).toHaveBeenCalledOnce();
    expect(permission.getSnapshot().status).toBe('requesting');
    await expect(request).resolves.toBe(true);
    expect(permission.getSnapshot().status).toBe('granted');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('reports denied access and allows a later retry', async () => {
    const { stream } = microphone();
    const capture = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
      .mockResolvedValueOnce(stream);
    const permission = new MicrophonePermission(capture, vi.fn());

    await expect(permission.request()).resolves.toBe(false);
    expect(permission.getSnapshot().status).toBe('error');
    expect(permission.getSnapshot().message).toContain('denied');
    await expect(permission.request()).resolves.toBe(true);
    expect(permission.getSnapshot().status).toBe('granted');
  });

  it('cancels a pending request, stops its late stream, and can retry without duplicate capture', async () => {
    const { track, stream } = microphone();
    let grant!: (stream: MediaStream) => void;
    const capture = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    );
    const permission = new MicrophonePermission(capture, vi.fn());

    const cancelledRequest = permission.request();
    permission.cancel();
    expect(permission.getSnapshot().status).toBe('off');
    const retry = permission.request();
    expect(capture).toHaveBeenCalledOnce();
    grant(stream);

    await expect(cancelledRequest).resolves.toBe(false);
    await expect(retry).resolves.toBe(true);
    expect(permission.getSnapshot().status).toBe('granted');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('handles synchronous capture failures without throwing from the click handler', async () => {
    const permission = new MicrophonePermission(() => {
      throw new DOMException('Unavailable', 'NotAllowedError');
    }, vi.fn());

    await expect(permission.request()).resolves.toBe(false);
    expect(permission.getSnapshot().status).toBe('error');
  });

  it('does not enable voice after a cancelled request resolves without a retry', async () => {
    const { track, stream } = microphone();
    let grant!: (stream: MediaStream) => void;
    const permission = new MicrophonePermission(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
      vi.fn(),
    );
    const pending = permission.request();
    permission.cancel();
    grant(stream);

    await expect(pending).resolves.toBe(false);
    expect(permission.getSnapshot().status).toBe('off');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('rejects an ended microphone track and releases the returned stream', async () => {
    const { track, stream } = microphone();
    Object.defineProperty(track, 'readyState', { value: 'ended', writable: true });
    const permission = new MicrophonePermission(async () => stream, vi.fn());

    await expect(permission.request()).resolves.toBe(false);
    expect(permission.getSnapshot().status).toBe('error');
    expect(track.stop).toHaveBeenCalledOnce();
  });
});
