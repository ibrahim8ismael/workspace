import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { AccountDto, WorkspaceDto } from '@gather/contracts';
import { PRODUCT_NAME } from '../../brand';
import { ApiClient, ApiError } from '../../lib/api';
import { clearLegacyAuthStorage } from '../../lib/legacy-storage';
import { messageForApi } from './messages';
import { WorkspaceHome } from '../workspaces/WorkspaceHome';
import { CompanyOverview } from '../workspaces/CompanyOverview';
import { AccountSecurity } from './AccountSecurity';
import { useSessionGuard } from './use-session-guard';
import { useSessionExpiry } from './use-session-expiry';
import './account.css';

type AuthView = 'login' | 'register' | 'verify' | 'resend' | 'forgot' | 'reset';
type AccountState = 'loading' | 'signed-out' | 'signed-in';
type AppScreen = 'companies' | 'company' | 'security';

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="dashboard">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="dashboard-bar">
        <a className="dashboard-brand" href="/" aria-label={`${PRODUCT_NAME} home`}>
          <span className="workspace-logo" aria-hidden="true">
            <LayoutGrid size={18} />
          </span>
          <strong>{PRODUCT_NAME}</strong>
        </a>
      </header>
      {children}
    </main>
  );
}

function Field({
  label,
  name,
  type = 'text',
  autoComplete,
  required = true,
  minLength,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        spellCheck={type === 'email' || name === 'token' ? false : undefined}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
      />
    </label>
  );
}

function AuthFlow({
  api,
  onLogin,
  initialNotice,
  initialRetry,
  onRetry,
}: {
  api: ApiClient;
  onLogin: (account: AccountDto) => Promise<void>;
  initialNotice: string;
  initialRetry: boolean;
  onRetry: () => void;
}) {
  const [view, setView] = useState<AuthView>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice);
  const generation = useRef(0);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [view]);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  function move(next: AuthView, message = '') {
    generation.current += 1;
    setView(next);
    setBusy(false);
    setError('');
    setNotice(message);
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: (values: FormData) => Promise<void>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const current = generation.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action(new FormData(event.currentTarget));
      if (generation.current !== current) return;
    } catch (caught) {
      if (generation.current === current) {
        setError(messageForApi(caught));
        form.querySelector<HTMLInputElement>('input')?.focus();
      }
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }

  let title = 'Welcome back';
  let subtitle = 'Sign in to see your companies.';
  let form: ReactNode;
  if (view === 'login') {
    form = (
      <form
        onSubmit={(event) =>
          void submit(event, async (values) => {
            const account = await api.login({
              email: values.get('email'),
              password: values.get('password'),
            });
            await onLogin(account);
          })
        }
      >
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <button className="primary enter-button" disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    );
  } else if (view === 'register') {
    title = 'Create your account';
    subtitle = 'Enter your details to get started.';
    form = (
      <form
        onSubmit={(event) =>
          void submit(event, async (values) => {
            await api.register({
              email: values.get('email'),
              displayName: values.get('displayName'),
              password: values.get('password'),
            });
            move(
              'verify',
              'If the address can be registered, instructions will be sent. Enter your verification code to continue.',
            );
          })
        }
      >
        <Field label="Name" name="displayName" autoComplete="name" minLength={2} maxLength={80} />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
        />
        <button className="primary enter-button" disabled={busy} type="submit">
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    );
  } else if (view === 'verify') {
    title = 'Verify your email';
    subtitle = 'Enter the code from your email and the password you registered with.';
    form = (
      <form
        onSubmit={(event) =>
          void submit(event, async (values) => {
            await api.verify({ token: values.get('token'), password: values.get('password') });
            move('login', 'Your account is verified. Sign in to continue.');
          })
        }
      >
        <Field
          label="Verification code"
          name="token"
          autoComplete="one-time-code"
          minLength={43}
          maxLength={43}
        />
        <Field
          label="Registration password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
        <button className="primary enter-button" disabled={busy} type="submit">
          {busy ? 'Verifying…' : 'Verify email'}
        </button>
      </form>
    );
  } else if (view === 'resend') {
    title = 'Resend verification';
    subtitle = 'We will send a new code if the address needs verification.';
    form = (
      <form
        onSubmit={(event) =>
          void submit(event, async (values) => {
            await api.resendVerification({ email: values.get('email') });
            setNotice('If the address needs verification, a new code will be sent.');
          })
        }
      >
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <button className="primary enter-button" disabled={busy} type="submit">
          {busy ? 'Sending…' : 'Resend code'}
        </button>
      </form>
    );
  } else if (view === 'forgot') {
    title = 'Reset your password';
    subtitle = 'Request a password reset code by email.';
    form = (
      <form
        onSubmit={(event) =>
          void submit(event, async (values) => {
            await api.forgotPassword({ email: values.get('email') });
            move('reset', 'If the address has an account, reset instructions will be sent.');
          })
        }
      >
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <button className="primary enter-button" disabled={busy} type="submit">
          {busy ? 'Sending…' : 'Send reset code'}
        </button>
      </form>
    );
  } else {
    title = 'Choose a new password';
    subtitle = 'Use the reset code from your email.';
    form = (
      <form
        onSubmit={(event) =>
          void submit(event, async (values) => {
            await api.resetPassword({
              token: values.get('token'),
              newPassword: values.get('newPassword'),
            });
            move('login', 'Your password has been reset. Sign in with the new password.');
          })
        }
      >
        <Field
          label="Reset code"
          name="token"
          autoComplete="one-time-code"
          minLength={43}
          maxLength={43}
        />
        <Field
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
        />
        <button className="primary enter-button" disabled={busy} type="submit">
          {busy ? 'Updating…' : 'Reset password'}
        </button>
      </form>
    );
  }

  const links: { label: string; next: AuthView }[] =
    view === 'login'
      ? [
          { label: 'Create an account', next: 'register' },
          { label: 'Forgot password?', next: 'forgot' },
          { label: 'Resend verification code', next: 'resend' },
        ]
      : [{ label: 'Back to sign in', next: 'login' }];

  return (
    <Shell>
      <div className="dashboard-body">
        <div className="dashboard-empty">
          <p>Sign in to see your companies.</p>
        </div>
      </div>
      <div className="modal-backdrop welcome-backdrop">
        <section
          id="main-content"
          className="modal welcome-modal"
          tabIndex={-1}
          aria-labelledby="auth-title"
        >
          <div className="welcome-art" aria-hidden="true">
            <span className="workspace-logo">
              <LayoutGrid size={22} />
            </span>
          </div>
          <span className="eyebrow">OPEN OFFICE</span>
          <h1 id="auth-title" ref={titleRef} tabIndex={-1}>
            {title}
          </h1>
          <p>{subtitle}</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="auth-signed" role="status">
              {notice}
            </p>
          )}
          <div key={view}>{form}</div>
          <nav aria-label="Account options">
            {links.map(({ label, next }, index) => (
              <span key={next}>
                {index > 0 && ' · '}
                <button
                  className="link-button"
                  disabled={busy}
                  type="button"
                  onClick={() => move(next)}
                >
                  {label}
                </button>
              </span>
            ))}
            {initialRetry && view === 'login' && (
              <p>
                <button className="link-button" disabled={busy} type="button" onClick={onRetry}>
                  Retry connection
                </button>
              </p>
            )}
          </nav>
        </section>
      </div>
    </Shell>
  );
}

export default function AuthApp() {
  const api = useMemo(() => new ApiClient(), []);
  const generation = useRef(0);
  const [state, setState] = useState<AccountState>('loading');
  const [account, setAccount] = useState<AccountDto | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [status, setStatus] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceLoadError, setWorkspaceLoadError] = useState('');
  const [bootAttempt, setBootAttempt] = useState(0);
  const [canRetryBoot, setCanRetryBoot] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [screen, setScreen] = useState<AppScreen>('companies');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const mutationLock = useRef(false);
  const mutationGeneration = useRef(0);
  const sessionGuard = useSessionGuard(
    account?.id ?? null,
    state === 'signed-in',
    api,
    signedOut,
    mutationLock,
  );

  useSessionExpiry(sessionGuard.currentSession, () =>
    signedOut('Your session has expired. Sign in again to continue.'),
  );

  useEffect(
    () => () => {
      mutationGeneration.current += 1;
      mutationLock.current = false;
      api.clearSessionMemory();
    },
    [api],
  );

  useEffect(() => {
    document.title =
      state === 'signed-in'
        ? `${screen === 'security' ? 'Account security' : screen === 'company' ? 'Company' : 'Companies'} · ${PRODUCT_NAME}`
        : PRODUCT_NAME;
  }, [screen, state]);

  useEffect(() => {
    const current = ++generation.current;
    try {
      clearLegacyAuthStorage(window.localStorage);
    } catch {
      // The account flow does not depend on browser storage.
    }
    void (async () => {
      let found: AccountDto;
      try {
        found = await api.me();
      } catch (error) {
        if (current !== generation.current) return;
        setAccount(null);
        setWorkspaces([]);
        setState('signed-out');
        const unauthorized = error instanceof ApiError && error.status === 401;
        if (!unauthorized) setStatus(messageForApi(error));
        setCanRetryBoot(!unauthorized);
        return;
      }
      if (current !== generation.current) return;
      setAccount(found);
      setState('signed-in');
      setLoadingWorkspaces(true);
      try {
        const rows = await api.workspaces();
        if (current === generation.current) setWorkspaces(rows);
      } catch (error) {
        if (current !== generation.current) return;
        if (error instanceof ApiError && error.status === 401) {
          setAccount(null);
          setWorkspaces([]);
          setState('signed-out');
        } else setWorkspaceError(messageForApi(error));
        if (!(error instanceof ApiError && error.status === 401))
          setWorkspaceLoadError(messageForApi(error));
      } finally {
        if (current === generation.current) setLoadingWorkspaces(false);
      }
    })();
    return () => {
      generation.current += 1;
    };
  }, [api, bootAttempt]);

  async function signedIn(found: AccountDto) {
    const current = ++generation.current;
    setAccount(found);
    setWorkspaces([]);
    setState('signed-in');
    setScreen('companies');
    setSelectedCompanyId(null);
    setLoadingWorkspaces(true);
    setStatus('');
    setWorkspaceError('');
    setWorkspaceLoadError('');
    try {
      const rows = await api.workspaces();
      if (current === generation.current) setWorkspaces(rows);
    } catch (error) {
      if (current !== generation.current) return;
      if (error instanceof ApiError && error.status === 401) {
        api.clearSessionMemory();
        setAccount(null);
        setWorkspaces([]);
        setState('signed-out');
      } else {
        setWorkspaceError(messageForApi(error));
        setWorkspaceLoadError(messageForApi(error));
      }
    } finally {
      if (current === generation.current) setLoadingWorkspaces(false);
    }
  }

  function signedOut(notice = '') {
    generation.current += 1;
    mutationGeneration.current += 1;
    mutationLock.current = false;
    api.clearSessionMemory();
    sessionGuard.reset();
    setAccount(null);
    setWorkspaces([]);
    setLoadingWorkspaces(false);
    setStatus(notice);
    setWorkspaceError('');
    setWorkspaceLoadError('');
    setCanRetryBoot(false);
    setLoggingOut(false);
    setMutationPending(false);
    setScreen('companies');
    setSelectedCompanyId(null);
    setState('signed-out');
  }

  async function runMutation<T>(action: () => Promise<T>, refreshMetadata = false): Promise<T> {
    if (mutationLock.current) throw new ApiError('mutation_in_progress', 409);
    mutationLock.current = true;
    const current = ++mutationGeneration.current;
    const lifecycle = generation.current;
    setMutationPending(true);
    sessionGuard.invalidatePendingReads();
    try {
      const result = await action();
      if (refreshMetadata) await sessionGuard.refresh();
      if (generation.current !== lifecycle) throw new ApiError('stale_response', null, true);
      return result;
    } catch (caught) {
      if (generation.current !== lifecycle) throw new ApiError('stale_response', null, true);
      throw caught;
    } finally {
      if (mutationGeneration.current === current) {
        mutationLock.current = false;
        setMutationPending(false);
      }
    }
  }

  async function reauthenticate(password: string): Promise<AccountDto | null> {
    const expectedAccountId = account?.id;
    if (!expectedAccountId) return null;
    const current = generation.current;
    sessionGuard.invalidatePendingReads();
    try {
      const verified = await api.reauthenticate({ password });
      if (current !== generation.current) return null;
      if (verified.id !== expectedAccountId) {
        signedOut('Your signed-in account changed. Sign in again to continue.');
        return null;
      }
      setAccount(verified);
      setSelectedCompanyId(null);
      const accepted = await sessionGuard.acceptReauthenticatedSession();
      if (current !== generation.current || !accepted) return null;
      return verified;
    } catch (caught) {
      if (
        current !== generation.current ||
        (caught instanceof ApiError && caught.code === 'stale_response')
      )
        return null;
      if (
        caught instanceof ApiError &&
        ((caught.status === 401 && caught.code !== 'invalid_credentials') ||
          caught.code === 'csrf_rejected')
      )
        signedOut('Your session changed. Sign in again to continue.');
      throw caught;
    }
  }

  async function logout() {
    const current = generation.current;
    setLoggingOut(true);
    setStatus('');
    try {
      await runMutation(() => api.logout());
      if (current === generation.current) signedOut('You have signed out.');
    } catch (error) {
      if (
        current !== generation.current ||
        (error instanceof ApiError && error.code === 'stale_response')
      )
        return;
      if (error instanceof ApiError && (error.status === 401 || error.code === 'csrf_rejected'))
        signedOut('Your session changed. Sign in again to continue.');
      else setStatus(messageForApi(error));
    } finally {
      if (current === generation.current) setLoggingOut(false);
    }
  }

  async function retryWorkspaces() {
    const current = ++generation.current;
    setLoadingWorkspaces(true);
    setWorkspaceLoadError('');
    setWorkspaceError('');
    try {
      const rows = await api.workspaces();
      if (current === generation.current) setWorkspaces(rows);
    } catch (error) {
      if (current !== generation.current) return;
      if (error instanceof ApiError && error.status === 401) signedOut();
      else {
        setWorkspaceLoadError(messageForApi(error));
        setWorkspaceError(messageForApi(error));
      }
    } finally {
      if (current === generation.current) setLoadingWorkspaces(false);
    }
  }

  function openCompany(workspaceId: string) {
    if (mutationLock.current) return;
    setSelectedCompanyId(workspaceId);
    setScreen('company');
    setStatus('');
    setWorkspaceError('');
  }

  function backToCompanies() {
    if (mutationLock.current) return;
    setSelectedCompanyId(null);
    setScreen('companies');
  }

  function openSecurity() {
    if (mutationLock.current) return;
    setSelectedCompanyId(null);
    setScreen('security');
  }

  function lostCompanyAccess(workspaceId: string) {
    setSelectedCompanyId(null);
    setScreen('companies');
    setWorkspaces((rows) => rows.filter((workspace) => workspace.id !== workspaceId));
    setWorkspaceError('');
    setWorkspaceLoadError('');
    setStatus(
      'This company is no longer available to your account. Your company list will be checked again.',
    );
    void retryWorkspaces();
  }

  function retryBoot() {
    generation.current += 1;
    setStatus('');
    setCanRetryBoot(false);
    setState('loading');
    setBootAttempt((attempt) => attempt + 1);
  }

  if (state === 'loading')
    return (
      <Shell>
        <div id="main-content" className="dashboard-body" tabIndex={-1}>
          <div className="dashboard-empty">
            <p role="status">Checking your account…</p>
          </div>
        </div>
      </Shell>
    );
  if (state === 'signed-out')
    return (
      <AuthFlow
        api={api}
        onLogin={signedIn}
        initialNotice={status}
        initialRetry={canRetryBoot}
        onRetry={retryBoot}
      />
    );
  if (!account) return null;

  if (screen === 'company' && selectedCompanyId)
    return (
      <CompanyOverview
        key={selectedCompanyId}
        account={account}
        api={api}
        workspaceId={selectedCompanyId}
        mutationPending={mutationPending}
        mutationLock={mutationLock}
        runMutation={runMutation}
        onBackToCompanies={backToCompanies}
        onOpenSecurity={openSecurity}
        onUnauthorized={signedOut}
        onLostAccess={lostCompanyAccess}
      />
    );

  if (screen === 'security')
    return (
      <AccountSecurity
        account={account}
        api={api}
        sessions={sessionGuard.sessions}
        currentSession={sessionGuard.currentSession}
        sessionsLoading={sessionGuard.loading}
        sessionsError={sessionGuard.error}
        mutationPending={mutationPending}
        runMutation={runMutation}
        onRefreshSessions={() => void sessionGuard.refresh()}
        onBack={backToCompanies}
        onReauthenticate={reauthenticate}
        onSignedOut={signedOut}
        onUnauthorized={() => signedOut('Your session changed. Sign in again to continue.')}
      />
    );

  return (
    <WorkspaceHome
      account={account}
      api={api}
      workspaces={workspaces}
      loading={loadingWorkspaces}
      status={status}
      error={workspaceError}
      loadError={workspaceLoadError}
      onStatus={setStatus}
      onError={setWorkspaceError}
      onWorkspaces={setWorkspaces}
      onLogout={() => void logout()}
      loggingOut={loggingOut}
      onRetryWorkspaces={() => void retryWorkspaces()}
      onUnauthorized={signedOut}
      onOpenSecurity={openSecurity}
      onViewCompany={openCompany}
      mutationPending={mutationPending}
      runMutation={runMutation}
    />
  );
}
