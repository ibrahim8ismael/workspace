import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfficeClient } from '../src/features/office/office-client';
import { OfficeReconnectSupervisor } from '../src/features/office/office-reconnect-supervisor';

describe('office reconnect supervisor', () => {
  afterEach(() => vi.useRealTimers());

  it('retries with bounded backoff and exposes a manual retry after the limit', () => {
    vi.useFakeTimers();
    const source = new MutableOfficeClient();
    const supervisor = new OfficeReconnectSupervisor(source.client);
    supervisor.start();

    vi.advanceTimersByTime(1000);
    expect(source.connect).toHaveBeenCalledTimes(1);
    expect(source.status).toBe('connecting');
    source.setStatus('error');

    vi.advanceTimersByTime(2500);
    expect(source.connect).toHaveBeenCalledTimes(2);
    source.setStatus('error');
    vi.advanceTimersByTime(5000);
    expect(source.connect).toHaveBeenCalledTimes(3);
    source.setStatus('error');
    vi.advanceTimersByTime(8000);
    expect(source.connect).toHaveBeenCalledTimes(4);
    source.setStatus('error');
    expect(supervisor.getSnapshot()).toEqual({ attempts: 4, exhausted: true });

    supervisor.retryNow();
    expect(source.connect).toHaveBeenCalledTimes(5);
    expect(supervisor.getSnapshot()).toEqual({ attempts: 0, exhausted: false });
    source.setStatus('connected');
    expect(supervisor.getSnapshot()).toEqual({ attempts: 0, exhausted: false });
    supervisor.stop();
  });
});

class MutableOfficeClient {
  private readonly listeners = new Set<() => void>();
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'idle' | 'ended' = 'disconnected';
  connect = vi.fn(async () => this.setStatus('connecting'));
  client = {
    subscribe: (listener: () => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
    getSnapshot: () => ({
      status: this.status,
      bootstrap: {},
      ready: {},
      snapshot: {},
    }),
    connect: () => this.connect(),
  } as unknown as OfficeClient;

  setStatus(status: MutableOfficeClient['status']) {
    this.status = status;
    for (const listener of this.listeners) listener();
  }
}
