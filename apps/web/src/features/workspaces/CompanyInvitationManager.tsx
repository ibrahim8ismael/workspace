import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Mail, RefreshCw, UserPlus, X } from 'lucide-react';
import {
  ApiClient,
  ApiError,
  type OfficeWorkspaceDetail,
  type WorkspaceInvitationDto,
} from '../../lib/api';
import { SubmissionKey } from '../../lib/idempotency';
import { messageForApi } from '../auth/messages';

type Props = {
  api: ApiClient;
  company: OfficeWorkspaceDetail;
  mutationPending: boolean;
  runMutation: <T>(action: () => Promise<T>) => Promise<T>;
  onUnauthorized: (notice?: string) => void;
};

function invitationStatus(status: WorkspaceInvitationDto['status']) {
  return status[0]!.toUpperCase() + status.slice(1);
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export function CompanyInvitationManager({
  api,
  company,
  mutationPending,
  runMutation,
  onUnauthorized,
}: Props) {
  const [invitations, setInvitations] = useState<WorkspaceInvitationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createUncertain, setCreateUncertain] = useState(false);
  const [revokingId, setRevokingId] = useState('');
  const [confirmRevokeId, setConfirmRevokeId] = useState('');
  const [revokeUncertainId, setRevokeUncertainId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const generation = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const createKey = useRef(new SubmissionKey());
  const revokeKeys = useRef(new Map<string, SubmissionKey>());
  const unauthorized = useRef(onUnauthorized);
  const emailInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    unauthorized.current = onUnauthorized;
  }, [onUnauthorized]);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    setLoading(true);
    setLoadError('');
    try {
      const rows = await api.workspaceInvitations(company.id, controller.signal);
      if (current === generation.current) setInvitations(rows);
    } catch (caught) {
      if (current !== generation.current || controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.code === 'stale_response') return;
      if (
        caught instanceof ApiError &&
        ((caught.status === 401 && caught.code !== 'invalid_credentials') ||
          caught.code === 'csrf_rejected')
      ) {
        unauthorized.current('Your session changed. Sign in again to continue.');
      } else {
        setLoadError(messageForApi(caught));
      }
    } finally {
      controllers.current.delete(controller);
      if (current === generation.current) setLoading(false);
    }
  }, [api, company.id]);

  useEffect(() => {
    let disposed = false;
    const activeControllers = controllers.current;
    void Promise.resolve().then(() => {
      if (!disposed) void refresh();
    });
    return () => {
      disposed = true;
      generation.current += 1;
      for (const controller of activeControllers) controller.abort();
      activeControllers.clear();
    };
  }, [refresh]);

  function handleMutationError(caught: unknown) {
    if (caught instanceof ApiError && caught.code === 'stale_response') return;
    if (
      caught instanceof ApiError &&
      ((caught.status === 401 && caught.code !== 'invalid_credentials') ||
        caught.code === 'csrf_rejected')
    ) {
      unauthorized.current('Your session changed. Sign in again to continue.');
    } else {
      setError(messageForApi(caught));
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { email };
    const key = createKey.current.forPayload(input);
    const current = generation.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    setCreating(true);
    setStatus('');
    setError('');
    try {
      const result = await runMutation(() =>
        api.createWorkspaceInvitation(company.id, input, key, controller.signal),
      );
      if (current !== generation.current) return;
      createKey.current.clear();
      setCreateUncertain(false);
      setEmail('');
      setInvitations((rows) => [
        { ...result.invitation, status: 'pending' },
        ...rows.filter((row) => row.email.toLowerCase() !== result.invitation.email.toLowerCase()),
      ]);
      setStatus(`Invitation created for ${result.invitation.email}.`);
    } catch (caught) {
      if (current !== generation.current) return;
      const uncertain = caught instanceof ApiError && caught.outcomeUnknown;
      setCreateUncertain(uncertain);
      if (!uncertain) createKey.current.clear();
      handleMutationError(caught);
      emailInput.current?.focus();
    } finally {
      controllers.current.delete(controller);
      if (current === generation.current) setCreating(false);
    }
  }

  async function revokeInvitation(invitation: WorkspaceInvitationDto) {
    let keyStore = revokeKeys.current.get(invitation.id);
    if (!keyStore) {
      keyStore = new SubmissionKey();
      revokeKeys.current.set(invitation.id, keyStore);
    }
    const key = keyStore.forPayload({ invitationId: invitation.id });
    const current = generation.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    setRevokingId(invitation.id);
    setStatus('');
    setError('');
    try {
      await runMutation(() =>
        api.revokeWorkspaceInvitation(company.id, invitation.id, key, controller.signal),
      );
      if (current !== generation.current) return;
      keyStore.clear();
      revokeKeys.current.delete(invitation.id);
      setConfirmRevokeId('');
      setRevokeUncertainId('');
      setInvitations((rows) =>
        rows.map((row) => (row.id === invitation.id ? { ...row, status: 'revoked' } : row)),
      );
      setStatus(`Invitation for ${invitation.email} was revoked.`);
    } catch (caught) {
      if (current !== generation.current) return;
      const uncertain = caught instanceof ApiError && caught.outcomeUnknown;
      if (!uncertain) {
        keyStore.clear();
        revokeKeys.current.delete(invitation.id);
      }
      setRevokeUncertainId(uncertain ? invitation.id : '');
      handleMutationError(caught);
    } finally {
      controllers.current.delete(controller);
      if (current === generation.current) setRevokingId('');
    }
  }

  return (
    <section
      className="dashboard-info-panel invitation-manager"
      aria-labelledby="invitations-title"
    >
      <div className="panel-heading">
        <div>
          <h2 id="invitations-title">Employee invitations</h2>
          <p>Invite a verified account to join {company.name} as a member.</p>
        </div>
        <button
          className="dashboard-secondary invitation-refresh"
          type="button"
          disabled={loading || mutationPending}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {status && (
        <p className="account-message" role="status">
          {status}
        </p>
      )}
      <form className="dashboard-company-form invitation-create-form" onSubmit={createInvitation}>
        <label className="dashboard-label">
          Employee email
          <input
            ref={emailInput}
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            maxLength={254}
            required
            value={email}
            disabled={creating || mutationPending}
            aria-describedby={error ? 'invitation-email-error' : 'invitation-help'}
            onChange={(event) => {
              setEmail(event.target.value);
              setCreateUncertain(false);
              setError('');
            }}
          />
        </label>
        {error && (
          <p id="invitation-email-error" className="form-error" role="alert">
            {error}
          </p>
        )}
        <p id="invitation-help" className="invitation-help">
          An invitation code will be sent to this address. The code can only be used by its matching
          verified account.
        </p>
        <div className="company-overview-actions">
          <button className="dashboard-create" type="submit" disabled={creating || mutationPending}>
            <UserPlus size={16} aria-hidden="true" />
            {creating ? 'Creating…' : createUncertain ? 'Retry invitation' : 'Send invitation'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="invitation-empty" role="status">
          Loading invitations…
        </p>
      ) : loadError ? (
        <div className="invitation-empty" role="alert">
          <p>{loadError}</p>
          <button
            className="dashboard-secondary"
            type="button"
            disabled={mutationPending}
            onClick={() => void refresh()}
          >
            Retry invitations
          </button>
        </div>
      ) : invitations.length ? (
        <ul className="invitation-list" aria-label="Company invitations">
          {invitations.map((invitation) => (
            <li className="invitation-row" key={invitation.id}>
              <div className="invitation-recipient">
                <span className="invitation-mail-icon" aria-hidden="true">
                  <Mail size={16} />
                </span>
                <span>
                  <strong>{invitation.email}</strong>
                  <small>
                    Expires{' '}
                    <time dateTime={invitation.expiresAt}>
                      {formatExpiry(invitation.expiresAt)}
                    </time>
                  </small>
                </span>
              </div>
              <div className="invitation-row-actions">
                <span className={`invitation-status invitation-status-${invitation.status}`}>
                  {invitationStatus(invitation.status)}
                </span>
                {invitation.status === 'pending' &&
                  (confirmRevokeId === invitation.id ? (
                    <div
                      className="invitation-confirm"
                      role="group"
                      aria-label={`Confirm revocation for ${invitation.email}`}
                    >
                      <span>Revoke this invitation?</span>
                      <button
                        className="dashboard-secondary invitation-revoke"
                        type="button"
                        disabled={Boolean(revokingId) || mutationPending}
                        onClick={() => void revokeInvitation(invitation)}
                      >
                        {revokingId === invitation.id
                          ? 'Revoking…'
                          : revokeUncertainId === invitation.id
                            ? 'Retry revoke'
                            : 'Confirm revoke'}
                      </button>
                      <button
                        className="invitation-cancel-revoke"
                        type="button"
                        disabled={Boolean(revokingId) || mutationPending}
                        onClick={() => setConfirmRevokeId('')}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="dashboard-secondary invitation-revoke"
                      type="button"
                      disabled={Boolean(revokingId) || mutationPending}
                      aria-label={`Revoke invitation for ${invitation.email}`}
                      onClick={() => setConfirmRevokeId(invitation.id)}
                    >
                      <X size={14} aria-hidden="true" />
                      Revoke
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="invitation-empty">No invitations have been created for this company.</p>
      )}
    </section>
  );
}
