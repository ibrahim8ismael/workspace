import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Building2, LayoutGrid, Plus, Search, Users, X } from 'lucide-react';
import type { AccountDto, WorkspaceDto } from '@gather/contracts';
import { ApiClient, ApiError } from '../../lib/api';
import { SubmissionKey } from '../../lib/idempotency';
import { messageForApi } from '../auth/messages';
import { AppLink } from '../../routing/AppLink';
import { companyPath, officeAliasPath } from '../../routing/routes';
import { PRODUCT_NAME } from '../../brand';
import { workspaceRoleLabel } from './workspace-role';

type Props = {
  invitationRoute?: boolean;
  invitationToken?: string;
  onCloseInvitation?: () => void;
  account: AccountDto;
  api: ApiClient;
  workspaces: WorkspaceDto[];
  loading: boolean;
  loadError: string;
  status: string;
  error: string;
  onStatus: (message: string) => void;
  onError: (message: string) => void;
  onWorkspaces: (rows: WorkspaceDto[] | ((current: WorkspaceDto[]) => WorkspaceDto[])) => void;
  onLogout: () => void;
  loggingOut: boolean;
  onRetryWorkspaces: () => void;
  onUnauthorized: () => void;
  onOpenSecurity: () => void;
  onViewCompany: (workspaceId: string) => void;
  mutationPending: boolean;
  runMutation: <T>(action: () => Promise<T>, refreshMetadata?: boolean) => Promise<T>;
};

function slugFromName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function displayError(error: unknown) {
  return error instanceof ApiError ? messageForApi(error) : 'The request could not be completed.';
}

export function WorkspaceHome({
  invitationRoute = false,
  invitationToken = '',
  onCloseInvitation,
  account,
  api,
  workspaces,
  loading,
  loadError,
  status,
  error,
  onStatus,
  onError,
  onWorkspaces,
  onLogout,
  loggingOut,
  onRetryWorkspaces,
  onUnauthorized,
  onOpenSecurity,
  onViewCompany,
  mutationPending,
  runMutation,
}: Props) {
  const [companyName, setCompanyName] = useState('');
  const [roomCount, setRoomCount] = useState(5);
  const [slug, setSlug] = useState('');
  const [inviteCode, setInviteCode] = useState(invitationToken);
  const [companyQuery, setCompanyQuery] = useState('');
  const [dialog, setDialog] = useState<'create' | 'join' | null>(invitationRoute ? 'join' : null);
  const closeDialog = useCallback(() => {
    setDialog(null);
    if (invitationRoute) onCloseInvitation?.();
  }, [invitationRoute, onCloseInvitation]);
  const [creating, setCreating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [createUncertain, setCreateUncertain] = useState(false);
  const [acceptUncertain, setAcceptUncertain] = useState(false);
  const createKey = useRef(new SubmissionKey());
  const acceptKey = useRef(new SubmissionKey());
  const dialogElement = useRef<HTMLElement>(null);
  const lifecycle = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const mutating =
    creating || accepting || loading || loggingOut || mutationPending || Boolean(loadError);
  const retryDisabled = creating || accepting || loggingOut || mutationPending;

  useEffect(
    () => () => {
      lifecycle.current += 1;
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating && !accepting && !mutationPending) closeDialog();
      if (event.key !== 'Tab') return;
      const focusable = dialogElement.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [accepting, creating, dialog, mutationPending, closeDialog]);

  function expireSession() {
    lifecycle.current += 1;
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    onUnauthorized();
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { name: companyName, slug, roomCount };
    const key = createKey.current.forPayload(input);
    const current = lifecycle.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    setCreating(true);
    onError('');
    onStatus('');
    try {
      const result = await runMutation(
        () => api.createWorkspace(input, key, controller.signal),
        true,
      );
      if (current !== lifecycle.current) return;
      createKey.current.clear();
      setCreateUncertain(false);
      setCompanyName('');
      setSlug('');
      setRoomCount(5);
      closeDialog();
      onWorkspaces((rows) => [
        result.workspace,
        ...rows.filter((row) => row.id !== result.workspace.id),
      ]);
      onStatus(`${result.workspace.name} is ready.`);
    } catch (caught) {
      if (current !== lifecycle.current) return;
      if (caught instanceof ApiError && caught.code === 'stale_response') return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.code === 'csrf_rejected')
      ) {
        expireSession();
      } else {
        const uncertain = caught instanceof ApiError && caught.outcomeUnknown;
        setCreateUncertain(uncertain);
        if (!uncertain) createKey.current.clear();
        onError(displayError(caught));
        dialogElement.current?.querySelector<HTMLInputElement>('input')?.focus();
      }
    } finally {
      controllers.current.delete(controller);
      if (current === lifecycle.current) setCreating(false);
    }
  }

  async function acceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { token: inviteCode };
    const key = acceptKey.current.forPayload(input);
    const current = lifecycle.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    setAccepting(true);
    onError('');
    onStatus('');
    try {
      const result = await runMutation(
        () => api.acceptInvitation(input, key, controller.signal),
        true,
      );
      if (current !== lifecycle.current) return;
      acceptKey.current.clear();
      setAcceptUncertain(false);
      setInviteCode('');
      closeDialog();
      onWorkspaces((rows) => [
        result.workspace,
        ...rows.filter((row) => row.id !== result.workspace.id),
      ]);
      onStatus(`You joined ${result.workspace.name}.`);
    } catch (caught) {
      if (current !== lifecycle.current) return;
      if (caught instanceof ApiError && caught.code === 'stale_response') return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.code === 'csrf_rejected')
      ) {
        expireSession();
      } else {
        const uncertain = caught instanceof ApiError && caught.outcomeUnknown;
        setAcceptUncertain(uncertain);
        if (!uncertain) acceptKey.current.clear();
        onError(displayError(caught));
        dialogElement.current?.querySelector<HTMLInputElement>('input')?.focus();
      }
    } finally {
      controllers.current.delete(controller);
      if (current === lifecycle.current) setAccepting(false);
    }
  }

  const visibleWorkspaces = workspaces.filter((workspace) =>
    workspace.name.toLocaleLowerCase().includes(companyQuery.trim().toLocaleLowerCase()),
  );

  return (
    <main className="dashboard">
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
            disabled={mutating}
            onNavigate={onOpenSecurity}
          >
            Account security
          </AppLink>
          <button
            className="dashboard-secondary"
            type="button"
            disabled={creating || accepting || loggingOut || mutationPending}
            onClick={onLogout}
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
          <button
            type="button"
            className="dashboard-create"
            disabled={mutating}
            onClick={() => setDialog('create')}
          >
            <Plus size={17} />
            Create company
          </button>
        </div>
      </header>

      <div id="main-content" className="dashboard-body" tabIndex={-1}>
        <section className="dashboard-heading">
          <div>
            <h1 tabIndex={-1}>
              {invitationRoute ? 'Accept a company invitation' : 'Your companies'}
            </h1>
            <p>Choose a company office or join a team with an invitation.</p>
          </div>
          <button
            type="button"
            className="dashboard-secondary"
            disabled={mutating}
            onClick={() => setDialog('join')}
          >
            Join with invitation
          </button>
        </section>

        {status && (
          <p className="account-message" role="status">
            {status}
          </p>
        )}
        {error && !loadError && !dialog && (
          <p className="account-message is-error" role="alert">
            {error}
          </p>
        )}

        <div className="dashboard-toolbar">
          <div className="dashboard-tabs">
            <span className="active">
              All companies <span>{workspaces.length}</span>
            </span>
          </div>
          <label className="dashboard-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={companyQuery}
              name="companySearch"
              onChange={(event) => setCompanyQuery(event.target.value)}
              placeholder="Search companies"
              aria-label="Search companies"
            />
          </label>
        </div>

        {loading ? (
          <div className="dashboard-empty" role="status">
            <p>Loading companies…</p>
          </div>
        ) : loadError ? (
          <div className="dashboard-empty" role="alert">
            <p>{loadError}</p>
            <button
              className="dashboard-create"
              type="button"
              disabled={retryDisabled}
              onClick={onRetryWorkspaces}
            >
              Retry loading companies
            </button>
          </div>
        ) : visibleWorkspaces.length > 0 ? (
          <div className="dashboard-grid">
            {visibleWorkspaces.map((workspace) => (
              <article
                className="dashboard-company-card"
                data-workspace-id={workspace.id}
                key={workspace.id}
              >
                <div className="dashboard-company-art" aria-hidden="true">
                  <Building2 size={32} />
                  <span>{workspace.name.slice(0, 1).toUpperCase()}</span>
                </div>
                <div className="dashboard-company-meta">
                  <div className="dashboard-company-title">
                    <span className="dashboard-company-logo" aria-hidden="true">
                      <Building2 size={16} />
                    </span>
                    <div>
                      <strong>{workspace.name}</strong>
                      <span>{workspaceRoleLabel(workspace.role)}</span>
                    </div>
                  </div>
                  <span className="dashboard-company-members">
                    <Users size={14} aria-hidden="true" />
                    {workspace.memberCount} {workspace.memberCount === 1 ? 'member' : 'members'}
                  </span>
                  <AppLink className="dashboard-secondary" to={companyPath(workspace.id)}>
                    Company details
                  </AppLink>
                  <AppLink
                    className="dashboard-company-open"
                    disabled={mutationPending}
                    to={officeAliasPath(workspace.id)}
                    onNavigate={() => onViewCompany(workspace.id)}
                  >
                    Open office <ArrowRight size={15} aria-hidden="true" />
                  </AppLink>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <span className="workspace-logo" aria-hidden="true">
              <Building2 size={22} />
            </span>
            <p>
              {companyQuery
                ? 'No companies match your search.'
                : 'You have not joined a company yet.'}
            </p>
            {!companyQuery && (
              <div className="dashboard-empty-actions">
                <button
                  type="button"
                  className="dashboard-create"
                  onClick={() => setDialog('create')}
                >
                  <Plus size={17} />
                  Create company
                </button>
                <button
                  type="button"
                  className="dashboard-secondary"
                  onClick={() => setDialog('join')}
                >
                  Join with invitation
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {dialog && (
        <div
          className="dashboard-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creating && !accepting && !mutationPending)
              closeDialog();
          }}
        >
          <section
            className="dashboard-dialog"
            ref={dialogElement}
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-action-title"
          >
            <button
              className="dashboard-dialog-close"
              type="button"
              aria-label="Close dialog"
              disabled={creating || accepting || mutationPending}
              onClick={closeDialog}
            >
              <X size={17} />
            </button>
            {dialog === 'create' ? (
              <>
                <h2 id="company-action-title">Create a company</h2>
                <p className="dashboard-dialog-lead">
                  Set up a company workspace and its first office.
                </p>
                <form
                  className="dashboard-company-form"
                  onSubmit={(event) => void createCompany(event)}
                >
                  <label className="dashboard-label">
                    Company name
                    <input
                      autoFocus
                      autoComplete="organization"
                      maxLength={80}
                      minLength={2}
                      name="companyName"
                      disabled={mutating}
                      onChange={(event) => {
                        setCompanyName(event.target.value);
                        if (!slug || slug === slugFromName(companyName))
                          setSlug(slugFromName(event.target.value));
                        setCreateUncertain(false);
                      }}
                      required
                      value={companyName}
                    />
                  </label>
                  <label className="dashboard-label">
                    Company slug
                    <span className="dashboard-address-field">
                      <input
                        autoComplete="off"
                        maxLength={60}
                        minLength={3}
                        name="companySlug"
                        disabled={mutating}
                        onChange={(event) => {
                          setSlug(event.target.value);
                          setCreateUncertain(false);
                        }}
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        required
                        value={slug}
                      />
                    </span>
                  </label>
                  <label className="dashboard-label">
                    Meeting rooms
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      required
                      value={roomCount}
                      disabled={mutating}
                      onChange={(event) => setRoomCount(Number(event.target.value))}
                    />
                    <small>Choose 1–100 rooms. You can change this later in Space settings.</small>
                  </label>
                  {error && !loadError && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="dashboard-dialog-actions">
                    <button
                      className="dashboard-secondary"
                      type="button"
                      disabled={creating || mutationPending}
                      onClick={closeDialog}
                    >
                      Cancel
                    </button>
                    <button className="dashboard-create" disabled={mutating} type="submit">
                      <Plus size={16} />
                      {creating
                        ? 'Creating…'
                        : createUncertain
                          ? 'Retry creation'
                          : 'Create company'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h2 id="company-action-title">Join a company</h2>
                <p className="dashboard-dialog-lead">
                  Enter the invitation code sent to your email.
                </p>
                <form
                  className="dashboard-company-form"
                  onSubmit={(event) => void acceptInvite(event)}
                >
                  <label className="dashboard-label">
                    Invitation code
                    <input
                      autoFocus
                      autoComplete="one-time-code"
                      placeholder="8-character code"
                      maxLength={43}
                      minLength={8}
                      name="token"
                      inputMode="text"
                      spellCheck={false}
                      disabled={mutating}
                      onChange={(event) => {
                        setInviteCode(event.target.value);
                        setAcceptUncertain(false);
                      }}
                      required
                      value={inviteCode}
                    />
                  </label>
                  {error && !loadError && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="dashboard-dialog-actions">
                    <button
                      className="dashboard-secondary"
                      type="button"
                      disabled={accepting || mutationPending}
                      onClick={closeDialog}
                    >
                      Cancel
                    </button>
                    <button className="dashboard-create" disabled={mutating} type="submit">
                      {accepting ? 'Joining…' : acceptUncertain ? 'Retry joining' : 'Join company'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
