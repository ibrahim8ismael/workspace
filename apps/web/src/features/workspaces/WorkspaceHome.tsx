import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AccountDto, WorkspaceDto } from '@gather/contracts';
import { ApiClient, ApiError, type SessionDto } from '../../lib/api';
import { SubmissionKey } from '../../lib/idempotency';
import { messageForApi } from '../auth/messages';
import { SessionLifetimeNotice } from '../auth/SessionLifetimeNotice';

type Props = {
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
  currentSession: SessionDto | null;
  sessionsLoading: boolean;
  sessionsError: string;
  sessionActionStatus: string;
  sessionActionError: string;
  onRefreshSessions: () => void;
  onKeepWorking: () => void;
  onSessionExpire: () => void;
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
  currentSession,
  sessionsLoading,
  sessionsError,
  sessionActionStatus,
  sessionActionError,
  onRefreshSessions,
  onKeepWorking,
  onSessionExpire,
}: Props) {
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [createUncertain, setCreateUncertain] = useState(false);
  const [acceptUncertain, setAcceptUncertain] = useState(false);
  const createKey = useRef(new SubmissionKey());
  const acceptKey = useRef(new SubmissionKey());
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

  function expireSession() {
    lifecycle.current += 1;
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    onUnauthorized();
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { name: companyName, slug };
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
      }
    } finally {
      controllers.current.delete(controller);
      if (current === lifecycle.current) setAccepting(false);
    }
  }

  return (
    <main className="workspace-shell">
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
          <button type="button" disabled={mutating} onClick={onOpenSecurity}>
            Account security
          </button>
          <button
            type="button"
            disabled={creating || accepting || loggingOut || mutationPending}
            onClick={onLogout}
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <div className="workspace-content">
        <section className="workspace-heading">
          <div>
            <p className="account-eyebrow">YOUR TEAM</p>
            <h1>Companies</h1>
            <p className="workspace-lead">Create a company or join one with an invitation code.</p>
          </div>
          <div className="workspace-avatar" aria-hidden="true">
            {account.displayName.trim().slice(0, 1).toUpperCase()}
          </div>
        </section>

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

        {status && (
          <p className="account-message" role="status">
            {status}
          </p>
        )}
        {error && !loadError && (
          <p className="account-message is-error" role="alert">
            {error}
          </p>
        )}

        <section className="company-panel" aria-labelledby="companies-title">
          <div className="panel-heading">
            <div>
              <h2 id="companies-title">Your companies</h2>
              <p>Each company has its own membership and role.</p>
            </div>
            <span className="company-count">{workspaces.length}</span>
          </div>
          {loading ? (
            <p className="workspace-empty" role="status">
              Loading companies…
            </p>
          ) : loadError ? (
            <div className="workspace-empty" role="alert">
              <p>{loadError}</p>
              <button
                className="account-secondary"
                type="button"
                disabled={retryDisabled}
                onClick={onRetryWorkspaces}
              >
                Retry loading companies
              </button>
            </div>
          ) : workspaces.length === 0 ? (
            <p className="workspace-empty">You have not joined a company yet.</p>
          ) : (
            <ul className="company-list">
              {workspaces.map((workspace) => (
                <li className="company-row" data-workspace-id={workspace.id} key={workspace.id}>
                  <span className="company-avatar" aria-hidden="true">
                    {workspace.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="company-name">
                    <strong>{workspace.name}</strong>
                    <span>
                      {workspace.memberCount} {workspace.memberCount === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  <span className={`role-pill role-${workspace.role}`}>{workspace.role}</span>
                  <button
                    className="account-secondary workspace-row-view"
                    type="button"
                    disabled={mutationPending}
                    onClick={() => onViewCompany(workspace.id)}
                  >
                    View company
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="workspace-actions">
          <section className="workspace-panel" aria-labelledby="create-company-title">
            <p className="account-eyebrow">START A TEAM</p>
            <h2 id="create-company-title">Create a company</h2>
            <p>Choose a name and a short company address.</p>
            <form className="workspace-form" onSubmit={(event) => void createCompany(event)}>
              <label className="account-field">
                <span>Company name</span>
                <input
                  autoComplete="organization"
                  maxLength={80}
                  minLength={2}
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
              <label className="account-field">
                <span>Company address</span>
                <div className="slug-input">
                  <span aria-hidden="true">gather/</span>
                  <input
                    autoComplete="off"
                    maxLength={60}
                    minLength={3}
                    disabled={mutating}
                    onChange={(event) => {
                      setSlug(event.target.value);
                      setCreateUncertain(false);
                    }}
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    required
                    value={slug}
                  />
                </div>
              </label>
              <button className="account-primary" disabled={mutating} type="submit">
                {creating
                  ? 'Creating…'
                  : createUncertain
                    ? 'Retry company creation'
                    : 'Create company'}
              </button>
            </form>
          </section>

          <section className="workspace-panel" aria-labelledby="join-company-title">
            <p className="account-eyebrow">HAVE AN INVITATION?</p>
            <h2 id="join-company-title">Join a company</h2>
            <p>Enter the invitation code sent to your email.</p>
            <form className="workspace-form" onSubmit={(event) => void acceptInvite(event)}>
              <label className="account-field">
                <span>Invitation code</span>
                <input
                  autoComplete="one-time-code"
                  maxLength={43}
                  minLength={43}
                  disabled={mutating}
                  onChange={(event) => {
                    setInviteCode(event.target.value);
                    setAcceptUncertain(false);
                  }}
                  required
                  value={inviteCode}
                />
              </label>
              <button className="account-secondary" disabled={mutating} type="submit">
                {accepting ? 'Joining…' : acceptUncertain ? 'Retry joining' : 'Join company'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
