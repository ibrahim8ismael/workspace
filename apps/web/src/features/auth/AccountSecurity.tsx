import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import type { AccountDto } from '@gather/contracts';
import { ApiClient, ApiError, type SessionDto } from '../../lib/api';
import { messageForApi } from './messages';

type Props = {
  account: AccountDto;
  api: ApiClient;
  sessions: SessionDto[];
  currentSession: SessionDto | null;
  sessionsLoading: boolean;
  sessionsError: string;
  mutationPending: boolean;
  runMutation: <T>(action: () => Promise<T>, refreshMetadata?: boolean) => Promise<T>;
  onRefreshSessions: () => void;
  onBack: () => void;
  onReauthenticate: (password: string) => Promise<AccountDto | null>;
  onSignedOut: (notice: string) => void;
  onUnauthorized: () => void;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function AccountSecurity({
  account,
  api,
  sessions,
  currentSession,
  sessionsLoading,
  sessionsError,
  mutationPending,
  runMutation,
  onRefreshSessions,
  onBack,
  onReauthenticate,
  onSignedOut,
  onUnauthorized,
}: Props) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const lifecycle = useRef(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const securityActionsBlocked =
    mutationPending || sessionsLoading || !currentSession || Boolean(sessionsError);

  useEffect(() => {
    titleRef.current?.focus();
    return () => {
      lifecycle.current += 1;
    };
  }, []);

  function handleMutationError(caught: unknown, current: number) {
    if (current !== lifecycle.current) return;
    if (caught instanceof ApiError && caught.code === 'stale_response') return;
    if (
      caught instanceof ApiError &&
      ((caught.status === 401 && caught.code !== 'invalid_credentials') ||
        caught.code === 'csrf_rejected')
    ) {
      onUnauthorized();
      return;
    }
    setError(messageForApi(caught));
  }

  async function verifyPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get('password') ?? '');
    form.reset();
    const current = lifecycle.current;
    setError('');
    setStatus('');
    try {
      const result = await runMutation(() => onReauthenticate(password));
      if (current !== lifecycle.current || result === null) return;
      setStatus('Password verified. Current session details have been refreshed.');
    } catch (caught) {
      handleMutationError(caught, current);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const input = {
      currentPassword: String(values.get('currentPassword') ?? ''),
      newPassword: String(values.get('newPassword') ?? ''),
    };
    form.reset();
    const current = lifecycle.current;
    setError('');
    setStatus('');
    try {
      await runMutation(() => api.changePassword(input));
      if (current !== lifecycle.current) return;
      onSignedOut('Your password was changed. Sign in again with the new password.');
    } catch (caught) {
      handleMutationError(caught, current);
    }
  }

  async function revokeSession(session: SessionDto) {
    const current = lifecycle.current;
    setError('');
    setStatus('');
    try {
      await runMutation(() => api.revokeSession(session));
      if (current !== lifecycle.current) return;
      if (session.current) {
        onSignedOut('This browser session was signed out. Sign in again to continue.');
        return;
      }
      onRefreshSessions();
      setStatus('The selected session was signed out.');
    } catch (caught) {
      handleMutationError(caught, current);
    }
  }

  async function signOutEverywhere() {
    const current = lifecycle.current;
    setError('');
    setStatus('');
    try {
      await runMutation(() => api.logoutAll());
      if (current !== lifecycle.current) return;
      onSignedOut('You signed out of all sessions. Sign in again to continue.');
    } catch (caught) {
      handleMutationError(caught, current);
    }
  }

  return (
    <main className="dashboard">
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
            onClick={onBack}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to companies
          </button>
        </div>
      </header>

      <div id="main-content" className="dashboard-body dashboard-security-body" tabIndex={-1}>
        <section className="dashboard-heading">
          <div>
            <h1 ref={titleRef} tabIndex={-1}>
              Account security
            </h1>
            <p>Review sessions and manage your sign-in.</p>
          </div>
        </section>

        {error && (
          <p className="account-message is-error" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p className="account-message" role="status">
            {status}
          </p>
        )}

        <section className="security-panel dashboard-info-panel" aria-labelledby="sessions-title">
          <div className="security-panel-heading">
            <div>
              <h2 id="sessions-title">Signed-in sessions</h2>
              <p>Sign out a session you no longer use.</p>
            </div>
            <button
              className="dashboard-secondary"
              type="button"
              disabled={sessionsLoading || mutationPending}
              onClick={onRefreshSessions}
            >
              Refresh sessions
            </button>
          </div>
          {sessionsError && (
            <p className="account-message is-error" role="alert">
              {sessionsError}
            </p>
          )}
          {sessionsLoading && sessions.length === 0 ? (
            <p className="workspace-empty" role="status">
              Loading sessions…
            </p>
          ) : sessions.length === 0 ? (
            <p className="workspace-empty">No active sessions were returned.</p>
          ) : (
            <ul className="security-session-list">
              {sessions.map((session) => (
                <li className="security-session-row" data-session-id={session.id} key={session.id}>
                  <div className="security-session-details">
                    <strong>{session.current ? 'Current session' : 'Other session'}</strong>
                    <span>
                      Signed in{' '}
                      <time dateTime={session.createdAt}>{formatTimestamp(session.createdAt)}</time>
                    </span>
                    <span>
                      Idle expiry{' '}
                      <time dateTime={session.idleExpiresAt}>
                        {formatTimestamp(session.idleExpiresAt)}
                      </time>
                    </span>
                    <span>
                      Absolute expiry{' '}
                      <time dateTime={session.absoluteExpiresAt}>
                        {formatTimestamp(session.absoluteExpiresAt)}
                      </time>
                    </span>
                  </div>
                  <button
                    className="dashboard-secondary"
                    type="button"
                    disabled={securityActionsBlocked}
                    onClick={() => void revokeSession(session)}
                  >
                    {session.current ? 'Sign out this session' : 'Revoke session'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="security-actions">
          <section
            className="security-panel dashboard-info-panel"
            aria-labelledby="verify-password-title"
          >
            <p className="account-eyebrow">ACCOUNT SECURITY</p>
            <h2 id="verify-password-title">Verify password</h2>
            <p>Confirm your password to refresh your sign-in and continue sensitive actions.</p>
            <form className="security-form" onSubmit={(event) => void verifyPassword(event)}>
              <label className="dashboard-label">
                <span>Password</span>
                <input
                  autoComplete="current-password"
                  disabled={securityActionsBlocked}
                  maxLength={128}
                  minLength={1}
                  name="password"
                  required
                  type="password"
                />
              </label>
              <button className="dashboard-create" disabled={securityActionsBlocked} type="submit">
                Verify password
              </button>
            </form>
          </section>

          <section
            className="security-panel dashboard-info-panel"
            aria-labelledby="change-password-title"
          >
            <p className="account-eyebrow">PASSWORD</p>
            <h2 id="change-password-title">Change password</h2>
            <p>
              If recent verification is required, verify first, then enter both passwords again.
            </p>
            <form className="security-form" onSubmit={(event) => void changePassword(event)}>
              <label className="dashboard-label">
                <span>Current password</span>
                <input
                  autoComplete="current-password"
                  disabled={securityActionsBlocked}
                  maxLength={128}
                  minLength={1}
                  name="currentPassword"
                  required
                  type="password"
                />
              </label>
              <label className="dashboard-label">
                <span>New password</span>
                <input
                  autoComplete="new-password"
                  disabled={securityActionsBlocked}
                  maxLength={128}
                  minLength={15}
                  name="newPassword"
                  required
                  type="password"
                />
              </label>
              <button className="dashboard-create" disabled={securityActionsBlocked} type="submit">
                Change password
              </button>
            </form>
          </section>
        </div>

        <section
          className="security-panel dashboard-info-panel security-logout-all"
          aria-labelledby="logout-all-title"
        >
          <div>
            <h2 id="logout-all-title">Sign out all sessions</h2>
            <p>All browsers will need to sign in again.</p>
          </div>
          <button
            className="dashboard-danger"
            type="button"
            disabled={mutationPending}
            onClick={() => void signOutEverywhere()}
          >
            Sign out all sessions
          </button>
        </section>
      </div>
    </main>
  );
}
