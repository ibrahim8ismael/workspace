import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ApiClient, SessionDto } from '../../lib/api';
import { ApiError } from '../../lib/api';
import { messageForApi } from './messages';
import { resolveCurrentSession } from './session-clock';

type OnUnauthorized = (notice?: string) => void;
type Snapshot = {
  accountId: string;
  sessions: SessionDto[];
  currentSession: SessionDto | null;
  loading: boolean;
  error: string;
};

export function useSessionGuard(
  accountId: string | null,
  active: boolean,
  api: ApiClient,
  onUnauthorized: OnUnauthorized,
  mutationLock: RefObject<boolean>,
) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const expectedSessionId = useRef<string | null>(null);
  const readGeneration = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const unauthorizedRef = useRef(onUnauthorized);
  const lastRefreshAt = useRef(0);
  const refreshRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  const cancelPendingReads = useCallback(() => {
    readGeneration.current += 1;
    readController.current?.abort();
    readController.current = null;
  }, []);

  const invalidatePendingReads = useCallback(() => {
    cancelPendingReads();
    setSnapshot((current) => (current ? { ...current, loading: false } : current));
  }, [cancelPendingReads]);

  const refresh = useCallback(
    async (options?: { deferLoading?: boolean }): Promise<boolean> => {
      if (!active || !accountId) return false;
      const generation = ++readGeneration.current;
      readController.current?.abort();
      const controller = new AbortController();
      readController.current = controller;
      lastRefreshAt.current = Date.now();
      if (!options?.deferLoading) {
        setSnapshot((current) => ({
          accountId,
          sessions: current?.accountId === accountId ? current.sessions : [],
          currentSession: current?.accountId === accountId ? current.currentSession : null,
          loading: true,
          error: '',
        }));
      }

      try {
        const [account, rows] = await Promise.all([
          api.me(controller.signal),
          api.sessions(controller.signal),
        ]);
        if (generation !== readGeneration.current) return false;
        if (account.id !== accountId) {
          unauthorizedRef.current('Your signed-in account changed. Sign in again to continue.');
          return false;
        }

        const resolution = resolveCurrentSession(rows, expectedSessionId.current);
        if (resolution.kind === 'missing') {
          setSnapshot({
            accountId,
            sessions: rows,
            currentSession: null,
            loading: false,
            error: 'The current session could not be identified. Refresh sessions to check again.',
          });
          return false;
        } else if (resolution.kind === 'multiple') {
          setSnapshot({
            accountId,
            sessions: rows,
            currentSession: null,
            loading: false,
            error: 'More than one current session was returned. Refresh sessions to check again.',
          });
          return false;
        } else if (resolution.kind === 'changed') {
          unauthorizedRef.current('Your browser session changed. Sign in again to continue.');
          return false;
        } else {
          expectedSessionId.current = resolution.session.id;
          setSnapshot({
            accountId,
            sessions: rows,
            currentSession: resolution.session,
            loading: false,
            error: '',
          });
          return true;
        }
      } catch (caught) {
        if (generation !== readGeneration.current || controller.signal.aborted) return false;
        if (caught instanceof ApiError && caught.code === 'stale_response') return false;
        if (caught instanceof ApiError && caught.status === 401) {
          unauthorizedRef.current('Your session has ended. Sign in again to continue.');
          return false;
        } else {
          setSnapshot((current) => ({
            accountId,
            sessions: current?.accountId === accountId ? current.sessions : [],
            currentSession: current?.accountId === accountId ? current.currentSession : null,
            loading: false,
            error: messageForApi(caught),
          }));
          return false;
        }
      } finally {
        if (generation === readGeneration.current) readController.current = null;
      }
    },
    [accountId, active, api],
  );

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const reset = useCallback(() => {
    invalidatePendingReads();
    expectedSessionId.current = null;
    setSnapshot(null);
  }, [invalidatePendingReads]);

  const acceptReauthenticatedSession = useCallback(async () => {
    invalidatePendingReads();
    expectedSessionId.current = null;
    setSnapshot(null);
    return refresh({ deferLoading: true });
  }, [invalidatePendingReads, refresh]);

  useEffect(() => {
    if (!active || !accountId) {
      expectedSessionId.current = null;
      return cancelPendingReads;
    }
    expectedSessionId.current = null;
    lastRefreshAt.current = Date.now();
    void refresh({ deferLoading: true });
    return cancelPendingReads;
  }, [accountId, active, cancelPendingReads, refresh]);

  useEffect(() => {
    if (!active || !accountId) return;
    const refreshIfNeeded = () => {
      if (document.visibilityState === 'hidden') return;
      if (mutationLock.current) return;
      if (Date.now() - lastRefreshAt.current < 30_000) return;
      void refreshRef.current();
    };
    window.addEventListener('focus', refreshIfNeeded);
    document.addEventListener('visibilitychange', refreshIfNeeded);
    return () => {
      window.removeEventListener('focus', refreshIfNeeded);
      document.removeEventListener('visibilitychange', refreshIfNeeded);
    };
  }, [accountId, active, mutationLock]);

  const visibleSnapshot =
    active && accountId && snapshot?.accountId === accountId ? snapshot : null;
  return {
    sessions: visibleSnapshot?.sessions ?? [],
    currentSession: visibleSnapshot?.currentSession ?? null,
    loading: Boolean(active && accountId && (!visibleSnapshot || visibleSnapshot.loading)),
    error: visibleSnapshot?.error ?? '',
    refresh,
    reset,
    acceptReauthenticatedSession,
    invalidatePendingReads,
  };
}
