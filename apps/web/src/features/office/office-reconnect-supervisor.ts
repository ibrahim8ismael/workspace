import type { OfficeClient } from './office-client';

export type OfficeReconnectState = {
  attempts: number;
  exhausted: boolean;
};

const RETRY_DELAYS_MS = [1000, 2500, 5000, 8000] as const;

/** Gets a fresh one-use office ticket after a transport break and retries with bounded backoff. */
export class OfficeReconnectSupervisor {
  private readonly listeners = new Set<() => void>();
  private current: OfficeReconnectState = { attempts: 0, exhausted: false };
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeClient: (() => void) | null = null;

  constructor(private readonly client: OfficeClient) {}

  getSnapshot = () => this.current;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start() {
    if (this.unsubscribeClient) return;
    this.unsubscribeClient = this.client.subscribe(() => this.sync());
    this.sync();
  }

  stop() {
    this.unsubscribeClient?.();
    this.unsubscribeClient = null;
    this.clearTimer();
  }

  retryNow() {
    const state = this.client.getSnapshot();
    if (!['disconnected', 'error'].includes(state.status)) return;
    this.clearTimer();
    this.attempts = 0;
    this.publish();
    void this.client.connect();
  }

  private sync() {
    const state = this.client.getSnapshot();
    if (state.status === 'connected' || state.status === 'idle' || state.status === 'ended') {
      this.clearTimer();
      this.attempts = 0;
      this.publish();
      return;
    }
    if (state.status === 'connecting') {
      this.clearTimer();
      this.publish();
      return;
    }
    if (
      !['disconnected', 'error'].includes(state.status) ||
      !state.bootstrap ||
      !state.ready ||
      !state.snapshot
    ) {
      this.clearTimer();
      this.publish();
      return;
    }
    if (this.retryTimer || this.attempts >= RETRY_DELAYS_MS.length) {
      this.publish();
      return;
    }
    const delayMs = RETRY_DELAYS_MS[this.attempts]!;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.attempts += 1;
      this.publish();
      void this.client.connect();
    }, delayMs);
    this.publish();
  }

  private clearTimer() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private publish() {
    const next = {
      attempts: this.attempts,
      exhausted: this.attempts >= RETRY_DELAYS_MS.length,
    };
    if (this.current.attempts === next.attempts && this.current.exhausted === next.exhausted)
      return;
    this.current = next;
    for (const listener of this.listeners) listener();
  }
}
