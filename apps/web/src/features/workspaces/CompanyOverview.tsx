import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { AppLink } from '../../routing/AppLink';
import { companySettingsPath, officePath, type OfficePage } from '../../routing/routes';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import type { AccountDto } from '@gather/contracts';
import type { RefObject } from 'react';
import { ApiClient, ApiError, type OfficeWorkspaceDetail } from '../../lib/api';
import { messageForApi } from '../auth/messages';
import { canOpenOfficePreview } from './company-overview-view';
import { PRODUCT_NAME } from '../../brand';
import { SpaceSettings } from './SpaceSettings';

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
  page?: OfficePage | 'overview' | 'alias';
  requestedOfficeId?: string;
  mutationPending: boolean;
  mutationLock: RefObject<boolean>;
  runMutation: <T>(action: () => Promise<T>) => Promise<T>;
  onBackToCompanies: () => void;
  onOpenSecurity: () => void;
  onReauthenticate: (password: string) => Promise<AccountDto | null>;
  onWorkspaceUpdated: (workspace: OfficeWorkspaceDetail) => void;
  onLeft: () => void;
  onUnauthorized: (notice?: string) => void;
};

export function CompanyOverview({
  account,
  api,
  workspaceId,
  page = 'entry',
  requestedOfficeId,
  mutationPending,
  mutationLock,
  runMutation,
  onBackToCompanies,
  onOpenSecurity,
  onReauthenticate,
  onWorkspaceUpdated,
  onLeft,
  onUnauthorized,
}: Props) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<DetailSnapshot | null>(null);
  const requestGeneration = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const lastRefreshAt = useRef(0);
  const refreshRef = useRef<(deferLoading?: boolean) => Promise<void>>(() => Promise.resolve());
  const unauthorizedRef = useRef(onUnauthorized);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const visibleSnapshot = snapshot?.workspaceId === workspaceId ? snapshot : null;
  const detail = visibleSnapshot?.detail ?? null;
  const loading = visibleSnapshot?.loading ?? true;
  const error = visibleSnapshot?.error ?? '';
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

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
        if (result.id !== workspaceId) throw new Error('Company response mismatch');
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
          setSnapshot({
            workspaceId,
            detail: null,
            loading: false,
            error: 'Company not found or access denied.',
          });
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

  useEffect(() => {
    titleRef.current?.focus();
  }, [loading, error, page]);
  if (
    detail &&
    ((requestedOfficeId && requestedOfficeId !== detail.officeId) ||
      (page === 'invitations' && detail.role !== 'owner'))
  ) {
    return (
      <main className="dashboard">
        <section id="main-content" className="dashboard-body">
          <h1 tabIndex={-1}>Office not found or access denied</h1>
          <AppLink to="/companies">Back to companies</AppLink>
        </section>
      </main>
    );
  }
  if (detail && page === 'alias')
    return <Navigate replace to={officePath(workspaceId, detail.officeId, 'entry')} />;
  if (detail && page === 'settings')
    return (
      <SpaceSettings
        key={workspaceId}
        account={account}
        api={api}
        workspace={detail}
        mutationPending={mutationPending}
        runMutation={runMutation}
        onReauthenticate={onReauthenticate}
        onUnauthorized={onUnauthorized}
        onBack={() => navigate(officePath(workspaceId, detail.officeId, 'entry'))}
        onLeft={onLeft}
        onUpdated={(updated) => {
          setSnapshot((current) =>
            current?.workspaceId === workspaceId ? { ...current, detail: updated } : current,
          );
          onWorkspaceUpdated(updated);
        }}
      />
    );
  if (detail && page !== 'overview' && canOpenOfficePreview(detail, workspaceId, false, error)) {
    return (
      <Suspense
        fallback={
          <div className="app-shell" role="status">
            Loading office…
          </div>
        }
      >
        <LazyCompanyOfficePreview
          key={detail.id}
          routePage={page === 'alias' ? 'entry' : page}
          onNavigatePage={(next, replace = false) =>
            navigate(officePath(workspaceId, detail.officeId, next), { replace })
          }
          account={account}
          api={api}
          detail={detail}
          mutationPending={mutationPending}
          runMutation={runMutation}
          onUnauthorized={onUnauthorized}
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
        <AppLink className="dashboard-brand" to="/companies" aria-label={`${PRODUCT_NAME} home`}>
          <span className="workspace-logo" aria-hidden="true">
            <LayoutGrid size={18} />
          </span>
          <strong>{PRODUCT_NAME}</strong>
        </AppLink>
        <div className="dashboard-account-actions">
          <span className="dashboard-account-name">{account.displayName}</span>
          <AppLink
            to="/account/security"
            className="dashboard-secondary"
            disabled={mutationPending}
            onNavigate={onOpenSecurity}
          >
            Account security
          </AppLink>
          <AppLink
            to="/companies"
            className="dashboard-secondary"
            disabled={mutationPending}
            onNavigate={onBackToCompanies}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to companies
          </AppLink>
        </div>
      </header>

      <div id="main-content" className="dashboard-body company-overview-content" tabIndex={-1}>
        <h1 ref={titleRef} tabIndex={-1}>
          {loading ? 'Loading company…' : detail ? detail.name : 'Could not open company'}
        </h1>

        {detail && page === 'overview' && (
          <section className="dashboard-info-panel">
            <p>
              {detail.memberCount} company members · {detail.role === 'owner' ? 'Owner' : 'Member'}
            </p>
            <AppLink
              className="dashboard-create"
              to={officePath(workspaceId, detail.officeId, 'entry')}
            >
              Open office
            </AppLink>
            <AppLink className="dashboard-secondary" to={companySettingsPath(workspaceId)}>
              Space settings
            </AppLink>
          </section>
        )}
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
