import { useEffect, useRef, useState } from 'react';
import type { SessionDto } from '../../lib/api';
import { effectiveSessionDeadline, sessionDeadlineState } from './session-clock';

type Props = {
  session: SessionDto | null;
  loading: boolean;
  error: string;
  actionStatus: string;
  actionError: string;
  mutationPending: boolean;
  onRefresh: () => void;
  onExtend: () => void;
  onExpire: () => void;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function SessionLifetimeNotice({
  session,
  loading,
  error,
  actionStatus,
  actionError,
  mutationPending,
  onRefresh,
  onExtend,
  onExpire,
}: Props) {
  const deadline = effectiveSessionDeadline(session);
  const [now, setNow] = useState(() => Date.now());
  const expiredDeadline = useRef<number | null>(null);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  const deadlineState = sessionDeadlineState(deadline, now);
  const minutesLeft = deadline === null ? null : Math.max(1, Math.ceil((deadline - now) / 60_000));
  const expiryIso = deadline === null ? null : new Date(deadline).toISOString();

  useEffect(() => {
    if (deadline === null) {
      expiredDeadline.current = null;
      return;
    }
    const update = () => {
      const current = Date.now();
      setNow(current);
      if (deadline <= current && expiredDeadline.current !== deadline) {
        expiredDeadline.current = deadline;
        onExpireRef.current();
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [deadline]);

  return (
    <section className="session-lifetime" aria-labelledby="session-lifetime-title">
      <div className="session-lifetime-heading">
        <div>
          <p className="account-eyebrow">SIGN-IN STATUS</p>
          <h2 id="session-lifetime-title">Current session</h2>
        </div>
        <button
          className="dashboard-secondary"
          type="button"
          disabled={loading || mutationPending}
          onClick={onRefresh}
        >
          {loading ? 'Checking…' : 'Refresh sessions'}
        </button>
      </div>

      {error && (
        <p className="account-message is-error" role="alert">
          {error}
        </p>
      )}
      {session ? (
        <>
          <p
            className={`session-lifetime-state${deadlineState === 'warning' ? ' is-warning' : ''}`}
            role="status"
            aria-live="polite"
          >
            {deadlineState === 'expired'
              ? 'This session has reached its estimated expiry.'
              : deadlineState === 'warning'
                ? `This session may expire in about ${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'}.`
                : 'This session is active.'}
          </p>
          {expiryIso && (
            <p className="session-lifetime-meta">
              Expires by <time dateTime={expiryIso}>{formatTimestamp(expiryIso)}</time>
            </p>
          )}
          <p className="session-lifetime-note">
            This time is estimated using your device clock. The server decides whether a session is
            valid.
          </p>
          <button
            className="dashboard-secondary"
            type="button"
            disabled={
              mutationPending ||
              loading ||
              Boolean(error) ||
              deadlineState === 'expired' ||
              deadline === null
            }
            onClick={onExtend}
          >
            Keep working
          </button>
        </>
      ) : (
        <p className="session-lifetime-note" role={error ? undefined : 'status'}>
          {loading
            ? 'Checking your current session…'
            : 'Session timing is unavailable until refreshed.'}
        </p>
      )}
      {actionError && (
        <p className="account-message is-error" role="alert">
          {actionError}
        </p>
      )}
      {actionStatus && (
        <p className="account-message" role="status">
          {actionStatus}
        </p>
      )}
    </section>
  );
}
