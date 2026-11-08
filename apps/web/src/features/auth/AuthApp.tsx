import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { AccountDto, WorkspaceDto } from '@gather/contracts';
import { ApiClient, ApiError } from '../../lib/api';
import { clearLegacyAuthStorage } from '../../lib/legacy-storage';
import { messageForApi } from './messages';
import { WorkspaceHome } from '../workspaces/WorkspaceHome';
import './account.css';

type AuthView = 'login' | 'register' | 'verify' | 'resend' | 'forgot' | 'reset';
type AccountState = 'loading' | 'signed-out' | 'signed-in';

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="account-shell">
      <div className="account-frame">
        <header className="account-brand">
          <span aria-hidden="true" className="account-mark">
            G
          </span>
          <span>Gather Lite</span>
        </header>
        {children}
      </div>
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
    <label className="account-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
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
    const current = generation.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action(new FormData(event.currentTarget));
      if (generation.current !== current) return;
    } catch (caught) {
      if (generation.current === current) setError(messageForApi(caught));
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
        <button className="account-primary" disabled={busy} type="submit">
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
        <button className="account-primary" disabled={busy} type="submit">
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
        <button className="account-primary" disabled={busy} type="submit">
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
        <button className="account-primary" disabled={busy} type="submit">
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
        <button className="account-primary" disabled={busy} type="submit">
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
        <button className="account-primary" disabled={busy} type="submit">
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
      <section className="account-card" aria-labelledby="auth-title">
        <div className="account-eyebrow">ACCOUNT</div>
        <h1 id="auth-title" ref={titleRef} tabIndex={-1}>
          {title}
        </h1>
        <p className="account-subtitle">{subtitle}</p>
        {error && (
          <p className="account-message is-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="account-message" role="status">
            {notice}
          </p>
        )}
        <div key={view}>{form}</div>
        <nav className="account-links" aria-label="Account options">
          {links.map(({ label, next }) => (
            <button key={next} disabled={busy} type="button" onClick={() => move(next)}>
              {label}
            </button>
          ))}
          {initialRetry && view === 'login' && (
            <button disabled={busy} type="button" onClick={onRetry}>
              Retry connection
            </button>
          )}
        </nav>
      </section>
    </Shell>
  );
}

export default function AuthApp() {
  const api = useMemo(() => new ApiClient(), []);
  const generation = useRef(0);
  const logoutFlight = useRef(false);
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

  useEffect(() => {
    document.title = state === 'signed-in' ? 'Companies · Gather Lite' : 'Gather Lite';
  }, [state]);

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

  function signedOut() {
    generation.current += 1;
    api.clearSessionMemory();
    setAccount(null);
    setWorkspaces([]);
    setLoadingWorkspaces(false);
    setStatus('');
    setWorkspaceError('');
    setWorkspaceLoadError('');
    setCanRetryBoot(false);
    setState('signed-out');
  }

  async function logout() {
    if (logoutFlight.current) return;
    logoutFlight.current = true;
    setLoggingOut(true);
    setStatus('');
    try {
      await api.logout();
      signedOut();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) signedOut();
      else setStatus(messageForApi(error));
    } finally {
      logoutFlight.current = false;
      setLoggingOut(false);
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
        <p role="status">Checking your account…</p>
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
    />
  );
}
