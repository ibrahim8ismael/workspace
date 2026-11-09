import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AccountDto } from '@gather/contracts';
import type { RefObject } from 'react';
import { ApiClient, ApiError, type OfficeWorkspaceDetail, type SessionDto } from '../../lib/api';
import { messageForApi } from '../auth/messages';
import { SessionLifetimeNotice } from '../auth/SessionLifetimeNotice';
import { canOpenOfficePreview, companyOverviewViewReducer } from './company-overview-view';

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
  currentSession: SessionDto | null;
  sessionsLoading: boolean;
  sessionsError: string;
  sessionActionStatus: string;
  sessionActionError: string;
  onRefreshSessions: () => void;
  onKeepWorking: () => void;
  onSessionExpire: () => void;
  onBackToCompanies: () => void;
  onOpenSecurity: () => void;
  onUnauthorized: (notice?: string) => void;
  onLostAccess: (workspaceId: string) => void;
};

function formatRole(role: OfficeWorkspaceDetail['role']) {
  return role === 'owner' ? 'Owner' : 'Member';
}

export function CompanyOverview({
  account,
  api,
  workspaceId,
  mutationPending,
  mutationLock,
  currentSession,
  sessionsLoading,
  sessionsError,
  sessionActionStatus,
  sessionActionError,
  onRefreshSessions,
  onKeepWorking,
  onSessionExpire,
  onBackToCompanies,
  onOpenSecurity,
  onUnauthorized,
  onLostAccess,
}: Props) {
  const [snapshot, setSnapshot] = useState<DetailSnapshot | null>(null);
  const [view, dispatchView] = useReducer(companyOverviewViewReducer, 'details');
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
  const previewOpen = view === 'preview' && canOpenOfficePreview(detail, workspaceId, false, error);

  useEffect(() => {
    titleRef.current?.focus();
  }, [view]);

  useEffect(() => {
    dispatchView('reset');
  }, [workspaceId]);

  useEffect(() => {
    if (!canOpenOfficePreview(detail, workspaceId, false, error)) dispatchView('back-to-details');
  }, [detail, error, workspaceId]);

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

  return (
    <main className="workspace-shell" data-workspace-id={workspaceId}>
      <header className="workspace-topbar">
        <a
          className="workspace-brand"
          href="/"
          aria-label="Gather Lite home"
          onClick={(event) => {
            if (mutationPending) event.preventDefault();
          }}
        >
          <span className="account-mark" aria-hidden="true">
            G
          </span>
          <strong>Gather Lite</strong>
        </a>
        <div className="workspace-user">
          <span>{account.displayName}</span>
          <button type="button" disabled={mutationPending} onClick={onOpenSecurity}>
            Account security
          </button>
          <button type="button" disabled={mutationPending} onClick={onBackToCompanies}>
            Back to companies
          </button>
        </div>
      </header>

      <div className="workspace-content company-overview-content">
        {previewOpen && detail ? (
          <Suspense
            fallback={
              <section className="company-panel" role="status">
                Loading office preview…
              </section>
            }
          >
            <LazyCompanyOfficePreview
              api={api}
              detail={detail}
              onBack={() => dispatchView('back-to-details')}
            />
          </Suspense>
        ) : (
          <>
            <section className="workspace-heading">
              <div>
                <p className="account-eyebrow">COMPANY</p>
                <h1 ref={titleRef} tabIndex={-1}>
                  {detail?.name ?? (loading ? 'Loading company…' : 'Company details')}
                </h1>
                {detail && <p className="workspace-lead">gather/{detail.slug}</p>}
              </div>
              <div className="workspace-avatar" aria-hidden="true">
                {(detail?.name ?? account.displayName).trim().slice(0, 1).toUpperCase()}
              </div>
            </section>

            {error && (
              <p className="account-message is-error" role="alert">
                {error}
              </p>
            )}

            {loading ? (
              <section className="company-panel company-overview-panel" role="status">
                Loading company details…
              </section>
            ) : error ? (
              <section className="company-panel company-overview-panel">
                <button
                  className="account-primary"
                  type="button"
                  disabled={mutationPending}
                  onClick={() => void refresh()}
                >
                  Refresh company
                </button>
              </section>
            ) : detail ? (
              <section
                className="company-panel company-overview-panel"
                aria-labelledby="company-details-title"
              >
                <div className="panel-heading">
                  <div>
                    <h2 id="company-details-title">Company details</h2>
                    <p>This view is based on your current company membership.</p>
                  </div>
                  <div className="company-overview-tools">
                    <span className={`role-pill role-${detail.role}`}>
                      {formatRole(detail.role)}
                    </span>
                    <button
                      className="account-secondary"
                      type="button"
                      disabled={loading || mutationPending}
                      onClick={() => void refresh()}
                    >
                      Refresh company
                    </button>
                  </div>
                </div>
                <dl className="company-detail-list">
                  <div>
                    <dt>Company name</dt>
                    <dd>{detail.name}</dd>
                  </div>
                  <div>
                    <dt>Company address</dt>
                    <dd>gather/{detail.slug}</dd>
                  </div>
                  <div>
                    <dt>Your role</dt>
                    <dd>{formatRole(detail.role)}</dd>
                  </div>
                  <div>
                    <dt>Members</dt>
                    <dd>
                      {detail.memberCount} {detail.memberCount === 1 ? 'member' : 'members'}
                    </dd>
                  </div>
                </dl>
                <div className="company-overview-actions">
                  <button
                    className="account-primary"
                    type="button"
                    disabled={mutationPending}
                    onClick={() => dispatchView('open-preview')}
                  >
                    Open office preview
                  </button>
                  <button
                    className="account-secondary"
                    type="button"
                    disabled={mutationPending}
                    onClick={onBackToCompanies}
                  >
                    Switch company
                  </button>
                </div>
              </section>
            ) : null}
          </>
        )}

        <SessionLifetimeNotice
          session={currentSession}
          loading={sessionsLoading}
          error={sessionsError}
          actionStatus={sessionActionStatus}
          actionError={sessionActionError}
          mutationPending={mutationPending}
          onRefresh={onRefreshSessions}
          onExtend={onKeepWorking}
          onExpire={onSessionExpire}
        />
      </div>
    </main>
  );
}
