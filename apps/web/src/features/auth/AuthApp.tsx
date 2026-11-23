import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Navigate, useLocation, useNavigate } from 'react-router';
import { AppLink } from '../../routing/AppLink';
import {
  authPaths,
  parseRoute,
  safeReturnTo,
  isProtected,
  officeAliasPath,
  type AuthView,
} from '../../routing/routes';
import { ArrowRight, LayoutGrid, LockKeyhole } from 'lucide-react';
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
import './auth-flow.css';

type AccountState = 'loading' | 'signed-out' | 'signed-in';

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="dashboard auth-page">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to main content
      </a>
      <header className="dashboard-bar auth-topbar">
        <a className="dashboard-brand" href="/" aria-label={`${PRODUCT_NAME} home`}>
          <span className="workspace-logo" aria-hidden="true">
            <LayoutGrid size={18} />
          </span>
          <strong>{PRODUCT_NAME}</strong>
        </a>
        <div className="auth-topbar-note">
          <LockKeyhole size={15} aria-hidden="true" />
          Private team workspace
        </div>
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
  defaultValue,
  inputMode,
  pattern,
  placeholder,
  hint,
  onChange,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  defaultValue?: string;
  inputMode?: 'numeric' | 'text';
  pattern?: string;
  placeholder?: string;
  hint?: string;
  onChange?: (value: string) => void;
}) {
  const hintId = hint ? `auth-hint-${name}` : undefined;
  return (
    <div className="auth-field">
      <label htmlFor={`auth-input-${name}`}>{label}</label>
      <input
        id={`auth-input-${name}`}
        name={name}
        type={type}
        spellCheck={type === 'email' || name === 'token' ? false : undefined}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        defaultValue={defaultValue}
        inputMode={inputMode}
        pattern={pattern}
        placeholder={placeholder}
        aria-describedby={hintId}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
      {hint && (
        <small className="auth-field-hint" id={hintId}>
          {hint}
        </small>
      )}
    </div>
  );
}

function SubmitButton({
  busy,
  label,
  pendingLabel,
}: {
  busy: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <button className="primary enter-button" aria-busy={busy} disabled={busy} type="submit">
      <span>{busy ? pendingLabel : label}</span>
      {busy ? (
        <span className="auth-spinner" aria-hidden="true" />
      ) : (
        <ArrowRight size={17} aria-hidden="true" />
      )}
    </button>
  );
}

function AuthFlow({
  api,
  onLogin,
  onPasswordReset,
  initialNotice,
  initialRetry,
  onRetry,
}: {
  api: ApiClient;
  onLogin: (account: AccountDto) => Promise<void>;
  onPasswordReset: (notice: string) => void;
  initialNotice: string;
  initialRetry: boolean;
  onRetry: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(location.pathname);
  const view = route.kind === 'auth' ? route.view : 'login';
  const query = new URLSearchParams(location.search);
  const returnTo = query.get('returnTo');
  const pathFor = (next: AuthView, email = address) => {
    const params = new URLSearchParams();
    if (returnTo) params.set('returnTo', safeReturnTo(returnTo));
    if (email) params.set('email', email);
    const queryString = params.toString();
    return authPaths[next] + (queryString ? `?${queryString}` : '');
  };
  const [address, setAddress] = useState(query.get('email') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const routeNotice = (location.state as { notice?: string } | null)?.notice ?? '';
  const [notice, setNotice] = useState(routeNotice || initialNotice);
  const [noticeKind, setNoticeKind] = useState<'success' | 'info'>(
    routeNotice ? 'success' : 'info',
  );
  const generation = useRef(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const formA11yProps = {
    'aria-labelledby': 'auth-title',
    'aria-describedby': error || notice ? 'auth-feedback' : undefined,
  };

  useEffect(() => {
    titleRef.current?.focus();
  }, [view]);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  function move(next: AuthView, message = '', email = address) {
    generation.current += 1;
    navigate(pathFor(next, email), { state: { notice: message } });
    setBusy(false);
    setError('');
    setNotice(message);
    setNoticeKind('success');
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: (values: FormData, isCurrent: () => boolean) => Promise<void>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const current = generation.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action(new FormData(event.currentTarget), () => generation.current === current);
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
  let subtitle = 'Sign in to open your team’s shared workspace.';
  let form: ReactNode;
  if (view === 'login') {
    form = (
      <form
        {...formA11yProps}
        onSubmit={(event) =>
          void submit(event, async (values, isCurrent) => {
            const account = await api.login({
              email: values.get('email'),
              password: values.get('password'),
            });
            if (isCurrent()) await onLogin(account);
          })
        }
      >
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={address}
          onChange={setAddress}
        />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <SubmitButton busy={busy} label="Sign in" pendingLabel="Signing in…" />
      </form>
    );
  } else if (view === 'register') {
    title = 'Create your account';
    subtitle = 'Set up your profile and we’ll guide you through email verification.';
    form = (
      <form
        {...formA11yProps}
        onSubmit={(event) =>
          void submit(event, async (values, isCurrent) => {
            await api.register({
              email: values.get('email'),
              displayName: values.get('displayName'),
              password: values.get('password'),
            });
            if (!isCurrent()) return;
            const email = String(values.get('email') ?? '');
            setAddress(email);
            move(
              'verify',
              'If the address can be registered, instructions will be sent. Enter your verification code to continue.',
              email,
            );
          })
        }
      >
        <Field label="Name" name="displayName" autoComplete="name" minLength={2} maxLength={80} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={address}
          onChange={setAddress}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          hint="Use at least 15 characters."
        />
        <SubmitButton busy={busy} label="Create account" pendingLabel="Creating account…" />
      </form>
    );
  } else if (view === 'verify') {
    title = 'Verify your email';
    subtitle = 'Enter the code from your email. Your registration stays linked to this browser.';
    form = !address ? (
      <div className="auth-recovery-guidance">
        <p>
          Open this page in the browser where you registered, or create an account to receive a
          code.
        </p>
        <AppLink to={pathFor('register')}>Create an account</AppLink>
        {' · '}
        <AppLink to={pathFor('forgot')}>Recover an existing account</AppLink>
      </div>
    ) : (
      <form
        {...formA11yProps}
        onSubmit={(event) =>
          void submit(event, async (values, isCurrent) => {
            const account = await api.verify({
              email: query.get('email') ?? '',
              token: values.get('token'),
            });
            if (!isCurrent()) return;
            await onLogin(account);
          })
        }
      >
        <Field
          label="Verification code"
          name="token"
          defaultValue={query.get('token') ?? query.get('code') ?? ''}
          autoComplete="one-time-code"
          placeholder="6-digit code"
          pattern="(?:[0-9]{6}|[A-Za-z0-9_-]{43})"
          minLength={6}
          maxLength={43}
          inputMode="numeric"
          hint="Enter your 6-digit code or open the secure link in your email."
        />
        <SubmitButton busy={busy} label="Verify email" pendingLabel="Verifying…" />
      </form>
    );
  } else if (view === 'resend') {
    title = 'Resend verification';
    subtitle = 'We’ll send a fresh code if this account still needs verification.';
    form = (
      <form
        {...formA11yProps}
        onSubmit={(event) =>
          void submit(event, async (values, isCurrent) => {
            const email = String(values.get('email') ?? '');
            await api.resendVerification({ email });
            if (!isCurrent()) return;
            setAddress(email);
            move('verify', 'If the address can be verified, a new code will be sent.', email);
          })
        }
      >
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={address}
          onChange={setAddress}
        />
        <SubmitButton busy={busy} label="Resend code" pendingLabel="Sending…" />
      </form>
    );
  } else if (view === 'forgot') {
    title = 'Reset your password';
    subtitle = 'We’ll email a secure reset code if there’s an account for this address.';
    form = (
      <form
        {...formA11yProps}
        onSubmit={(event) =>
          void submit(event, async (values, isCurrent) => {
            const email = String(values.get('email') ?? '');
            await api.forgotPassword({ email });
            if (!isCurrent()) return;
            setAddress(email);
            move('reset', 'If the address has an account, reset instructions will be sent.', email);
          })
        }
      >
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={address}
          onChange={setAddress}
        />
        <SubmitButton busy={busy} label="Send reset code" pendingLabel="Sending…" />
      </form>
    );
  } else {
    title = 'Choose a new password';
    subtitle = 'Enter the reset code and choose a new password for your account.';
    form = (
      <form
        {...formA11yProps}
        onSubmit={(event) =>
          void submit(event, async (values, isCurrent) => {
            await api.resetPassword({
              email: String(values.get('email') ?? ''),
              token: values.get('token'),
              newPassword: values.get('newPassword'),
            });
            if (!isCurrent()) return;
            const message = 'Your password has been reset. Sign in with the new password.';
            onPasswordReset(message);
            move('login', message);
          })
        }
      >
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={address}
          onChange={setAddress}
        />
        <Field
          label="Reset code"
          name="token"
          defaultValue={query.get('token') ?? query.get('code') ?? ''}
          autoComplete="one-time-code"
          placeholder="6-digit code"
          pattern="(?:[0-9]{6}|[A-Za-z0-9_-]{43})"
          minLength={6}
          maxLength={43}
          inputMode="numeric"
          hint="Enter your 6-digit code or open the secure link in your email."
        />
        <Field
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          hint="Use at least 15 characters."
        />
        <SubmitButton busy={busy} label="Reset password" pendingLabel="Updating…" />
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
      : view === 'verify'
        ? [
            { label: 'Request a new verification code', next: 'resend' },
            { label: 'Recover an existing account', next: 'forgot' },
            { label: 'Back to sign in', next: 'login' },
          ]
        : view === 'register'
          ? [{ label: 'Already have an account? Sign in', next: 'login' }]
          : view === 'resend'
            ? [
                { label: 'Enter a verification code', next: 'verify' },
                { label: 'Back to sign in', next: 'login' },
              ]
            : view === 'forgot'
              ? [
                  { label: 'Back to sign in', next: 'login' },
                  { label: 'Create an account', next: 'register' },
                ]
              : [
                  { label: 'Request another reset code', next: 'forgot' },
                  { label: 'Back to sign in', next: 'login' },
                ];
  const activeStage = view === 'verify' ? 2 : view === 'reset' ? 3 : view === 'forgot' ? 2 : 1;
  const authStages = ['Account', 'Verify email', 'Secure account'];

  return (
    <Shell>
      <div className="auth-stage">
        <section className="auth-layout" aria-label="Gather Lite account access">
          <aside className="auth-story" aria-label="A shared office for your team">
            <div className="auth-story-topline">
              <span className="auth-story-spark" aria-hidden="true" />A calmer way to work together
            </div>
            <div className="auth-story-copy">
              <h2>
                Make room for
                <br />
                <em>good work.</em>
              </h2>
              <p>Bring your people into one shared office, wherever the day takes them.</p>
            </div>
            <div className="auth-room-illustration" aria-hidden="true">
              <div className="auth-room-orbit auth-room-orbit-one" />
              <div className="auth-room-orbit auth-room-orbit-two" />
              <div className="auth-room-grid" />
              <span className="auth-room-avatar auth-room-avatar-one">AM</span>
              <span className="auth-room-avatar auth-room-avatar-two">JL</span>
              <span className="auth-room-avatar auth-room-avatar-three">SK</span>
              <div className="auth-room-note">
                <span className="auth-room-note-icon">
                  <LayoutGrid size={16} />
                </span>
                <span>
                  <strong>Your team, together</strong>
                  <small>One shared place to connect</small>
                </span>
                <span className="auth-room-note-dot" />
              </div>
            </div>
            <div className="auth-story-footer">
              <span>{PRODUCT_NAME.toUpperCase()}</span>
              <span>Work feels better together.</span>
            </div>
          </aside>

          <section
            id="main-content"
            className="auth-flow-card auth-form-panel"
            data-auth-view={view}
            tabIndex={-1}
            aria-labelledby="auth-title"
          >
            <div className="auth-form-panel-inner">
              <div className="auth-step-caption">
                <span>ACCOUNT ACCESS</span>
                <span>
                  Step {activeStage} <i aria-hidden="true">/</i> 3
                </span>
              </div>
              <ol className="auth-progress" aria-label="Account access steps">
                {authStages.map((stage, index) => {
                  const current = index + 1 === activeStage;
                  const complete = index + 1 < activeStage;
                  return (
                    <li
                      key={stage}
                      className={current ? 'is-current' : complete ? 'is-complete' : ''}
                      aria-current={current ? 'step' : undefined}
                    >
                      <span aria-hidden="true">{complete ? '✓' : index + 1}</span>
                      {stage}
                    </li>
                  );
                })}
              </ol>
              <h1 id="auth-title" ref={titleRef} tabIndex={-1}>
                {title}
              </h1>
              <p className="auth-subtitle">{subtitle}</p>
              {error && (
                <div id="auth-feedback" className="auth-feedback is-error" role="alert">
                  <span className="auth-feedback-mark" aria-hidden="true">
                    !
                  </span>
                  <span>{error}</span>
                </div>
              )}
              {!error && notice && (
                <div
                  id="auth-feedback"
                  className={`auth-feedback is-${noticeKind}`}
                  role="status"
                  aria-live="polite"
                >
                  <span className="auth-feedback-mark" aria-hidden="true">
                    {noticeKind === 'success' ? '✓' : 'i'}
                  </span>
                  <span>{notice}</span>
                </div>
              )}
              <div key={view} className="auth-form" aria-busy={busy}>
                {form}
              </div>
              <nav className="auth-related-links" aria-label="Related account steps">
                {links.map(({ label, next }) => (
                  <AppLink key={next} className="link-button" disabled={busy} to={pathFor(next)}>
                    {label}
                  </AppLink>
                ))}
              </nav>
              {initialRetry && view === 'login' && (
                <div className="auth-retry-note">
                  <span>Having trouble connecting?</span>
                  <button disabled={busy} type="button" onClick={onRetry}>
                    Retry connection
                  </button>
                </div>
              )}
              <p className="auth-panel-footnote">
                Sign in to reach the spaces your team has shared with you.
              </p>
            </div>
          </section>
        </section>
      </div>
    </Shell>
  );
}

export default function AuthApp() {
  return (
    <BrowserRouter>
      <RoutedApp />
    </BrowserRouter>
  );
}

function RoutedApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(location.pathname);
  const screen =
    route.kind === 'security'
      ? 'security'
      : ['company', 'company-settings', 'office', 'office-alias'].includes(route.kind)
        ? 'company'
        : 'companies';
  const selectedCompanyId = 'workspaceId' in route ? route.workspaceId : null;
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
  const [mutationPending, setMutationPending] = useState(false);
  const mutationLock = useRef(false);
  const mutationGeneration = useRef(0);
  const sessionGuard = useSessionGuard(
    account?.id ?? null,
    state === 'signed-in',
    api,
    (notice) => signedOut(notice),
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
    const currentRoute = parseRoute(location.pathname);
    const titles: Record<string, string> = {
      '/login': 'Sign in',
      '/register': 'Create account',
      '/verify-email': 'Verify email',
      '/resend-verification': 'Resend verification',
      '/forgot-password': 'Forgot password',
      '/reset-password': 'Reset password',
      '/account/security': 'Account security',
      '/companies': 'Companies',
      '/invitations/accept': 'Accept invitation',
    };
    const officeTitles = {
      entry: 'Enter office',
      office: 'Office map',
      chat: 'Office messages',
      calendar: 'Office calendar',
      activity: 'Office activity',
      invitations: 'Office invitations',
      settings: 'Space settings',
    };
    document.title = `${titles[location.pathname] ?? (currentRoute.kind === 'office' ? officeTitles[currentRoute.page] : currentRoute.kind === 'company' ? 'Company' : currentRoute.kind === 'company-settings' ? 'Space settings' : currentRoute.kind === 'office-alias' ? 'Opening office' : currentRoute.kind === 'home' ? 'Home' : 'Page not found')} · ${PRODUCT_NAME}`;
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, state]);

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
    navigate(safeReturnTo(new URLSearchParams(location.search).get('returnTo')), { replace: true });
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
    navigate(officeAliasPath(workspaceId));
    setStatus('');
    setWorkspaceError('');
  }

  function backToCompanies() {
    if (mutationLock.current) return;
    navigate('/companies');
  }

  function openSecurity() {
    if (mutationLock.current) return;
    navigate('/account/security');
  }

  function retryBoot() {
    generation.current += 1;
    setStatus('');
    setCanRetryBoot(false);
    setState('loading');
    setBootAttempt((attempt) => attempt + 1);
  }

  if (route.kind === 'redirect') return <Navigate replace to={route.to + location.search} />;
  if (route.kind === 'home')
    return (
      <Navigate replace to={(state === 'signed-in' ? '/companies' : '/login') + location.search} />
    );
  if (route.kind === 'not-found')
    return (
      <Shell>
        <section id="main-content" className="dashboard-body">
          <h1 tabIndex={-1}>Page not found</h1>
          <p>This address does not match a page.</p>
          <AppLink to={account ? '/companies' : '/login'}>Return home</AppLink>
        </section>
      </Shell>
    );
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
  if (state === 'signed-out' && isProtected(route))
    return (
      <Navigate
        replace
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  if (
    state === 'signed-in' &&
    route.kind === 'auth' &&
    ['login', 'register', 'verify'].includes(route.view)
  )
    return (
      <Navigate replace to={safeReturnTo(new URLSearchParams(location.search).get('returnTo'))} />
    );
  if (state === 'signed-out' || route.kind === 'auth')
    return (
      <AuthFlow
        key={location.pathname + location.search}
        api={api}
        onLogin={signedIn}
        onPasswordReset={signedOut}
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
        page={
          route.kind === 'company'
            ? 'overview'
            : route.kind === 'company-settings'
              ? 'settings'
              : route.kind === 'office-alias'
                ? 'alias'
                : route.kind === 'office'
                  ? route.page
                  : 'entry'
        }
        requestedOfficeId={route.kind === 'office' ? route.officeId : undefined}
        mutationPending={mutationPending}
        mutationLock={mutationLock}
        runMutation={runMutation}
        onBackToCompanies={backToCompanies}
        onOpenSecurity={openSecurity}
        onReauthenticate={reauthenticate}
        onWorkspaceUpdated={(updated) =>
          setWorkspaces((rows) =>
            rows.map((row) => (row.id === updated.id ? { ...row, name: updated.name } : row)),
          )
        }
        onLeft={() => {
          setWorkspaces((rows) => rows.filter((row) => row.id !== selectedCompanyId));
          backToCompanies();
        }}
        onUnauthorized={signedOut}
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
      key={location.pathname + location.search}
      invitationRoute={route.kind === 'invitation'}
      invitationToken={new URLSearchParams(location.search).get('token') ?? ''}
      onCloseInvitation={backToCompanies}
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
