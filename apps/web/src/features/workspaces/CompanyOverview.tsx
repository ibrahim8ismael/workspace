import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import type { AccountDto } from '@gather/contracts';
import type { RefObject } from 'react';
import { ApiClient, ApiError, type OfficeWorkspaceDetail } from '../../lib/api';
import { messageForApi } from '../auth/messages';
import { canOpenOfficePreview } from './company-overview-view';

const LazyCompanyOfficePreview = lazy(() =>
  import('./CompanyOfficePreview').then(({ CompanyOfficePreview }) => ({
    default: CompanyOfficePreview,
  })),
);

type DetailSnapshot = {
  workspaceId: string;
  detail: OfficeWorkspaceDetail | null;
  loading: boolean;
  error: string;
};

type Props = {
  account: AccountDto;
  api: ApiClient;
  workspaceId: string;
  mutationPending: boolean;
  mutationLock: RefObject<boolean>;
  onBackToCompanies: () => void;
  onOpenSecurity: () => void;
  onUnauthorized: (notice?: string) => void;
  onLostAccess: (workspaceId: string) => void;
};

export function CompanyOverview({
  account,
  api,
  workspaceId,
  mutationPending,
  mutationLock,
  onBackToCompanies,
  onOpenSecurity,
  onUnauthorized,
  onLostAccess,
}: Props) {
  const [snapshot, setSnapshot] = useState<DetailSnapshot | null>(null);
  const requestGeneration = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const lastRefreshAt = useRef(0);
  const refreshRef = useRef<(deferLoading?: boolean) => Promise<void>>(() => Promise.resolve());
  const unauthorizedRef = useRef(onUnauthorized);
  const lostAccessRef = useRef(onLostAccess);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const visibleSnapshot = snapshot?.workspaceId === workspaceId ? snapshot : null;
  const detail = visibleSnapshot?.detail ?? null;
  const loading = visibleSnapshot?.loading ?? true;
  const error = visibleSnapshot?.error ?? '';
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized;
    lostAccessRef.current = onLostAccess;
  }, [onLostAccess, onUnauthorized]);

  const cancelRequest = useCallback(() => {
    requestGeneration.current += 1;
    requestController.current?.abort();
    requestController.current = null;
  }, []);

  const refresh = useCallback(
    async (deferLoading = false) => {
      const generation = ++requestGeneration.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      lastRefreshAt.current = Date.now();
      if (!deferLoading) {
        setSnapshot((current) => ({
          workspaceId,
          detail: current?.workspaceId === workspaceId ? current.detail : null,
          loading: true,
          error: '',
        }));
      }

      try {
        const result = await api.workspaceDetail(workspaceId, controller.signal);
        if (generation !== requestGeneration.current) return;
        setSnapshot({ workspaceId, detail: result, loading: false, error: '' });
      } catch (caught) {
        if (generation !== requestGeneration.current || controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.code === 'stale_response') return;
        if (
          caught instanceof ApiError &&
          ((caught.status === 401 && caught.code !== 'invalid_credentials') ||
            caught.code === 'csrf_rejected')
        ) {
          unauthorizedRef.current('Your session changed. Sign in again to continue.');
        } else if (caught instanceof ApiError && (caught.status === 403 || caught.status === 404)) {
          lostAccessRef.current(workspaceId);
        } else {
          setSnapshot({
            workspaceId,
            detail: null,
            loading: false,
            error: messageForApi(caught),
          });
        }
      } finally {
        if (generation === requestGeneration.current) requestController.current = null;
      }
    },
    [api, workspaceId],
  );

  useEffect(() => {
    lastRefreshAt.current = Date.now();
    void Promise.resolve().then(() => refresh(true));
    return cancelRequest;
  }, [cancelRequest, refresh]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const refreshIfNeeded = () => {
      if (document.visibilityState === 'hidden' || mutationLock.current) return;
      if (Date.now() - lastRefreshAt.current < 30_000) return;
      void refreshRef.current();
    };
    window.addEventListener('focus', refreshIfNeeded);
    document.addEventListener('visibilitychange', refreshIfNeeded);
    return () => {
      window.removeEventListener('focus', refreshIfNeeded);
      document.removeEventListener('visibilitychange', refreshIfNeeded);
    };
  }, [mutationLock]);

  if (detail && canOpenOfficePreview(detail, workspaceId, false, error)) {
    return (
      <Suspense
        fallback={
          <div className="app-shell" role="status">
            Loading office…
          </div>
        }
      >
        <LazyCompanyOfficePreview
          api={api}
          detail={detail}
          onBack={onBackToCompanies}
          onOpenSecurity={onOpenSecurity}
        />
      </Suspense>
    );
  }

  return (
    <main className="dashboard" data-workspace-id={workspaceId}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="dashboard-bar">
        <a className="dashboard-brand" href="/" aria-label="Open Office home">
          <span className="workspace-logo" aria-hidden="true">
            <LayoutGrid size={18} />
          </span>
          <strong>Open Office</strong>
        </a>
        <div className="dashboard-account-actions">
          <span className="dashboard-account-name">{account.displayName}</span>
          <button
            className="dashboard-secondary"
            type="button"
            disabled={mutationPending}
            onClick={onOpenSecurity}
          >
            Account security
          </button>
          <button
            className="dashboard-secondary"
            type="button"
            disabled={mutationPending}
            onClick={onBackToCompanies}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to companies
          </button>
        </div>
      </header>

      <div id="main-content" className="dashboard-body company-overview-content" tabIndex={-1}>
        <h1 ref={titleRef} tabIndex={-1}>
          {loading ? 'Opening office…' : 'Could not open office'}
        </h1>

        {error && (
          <p className="account-message is-error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <section className="dashboard-info-panel company-detail-state" role="status">
            Opening office…
          </section>
        ) : error ? (
          <section className="dashboard-info-panel company-detail-state">
            <button
              className="dashboard-create"
              type="button"
              disabled={mutationPending}
              onClick={() => void refresh()}
            >
              Try again
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
