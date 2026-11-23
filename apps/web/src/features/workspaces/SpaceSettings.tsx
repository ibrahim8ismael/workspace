import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Building2, Check, RefreshCw, Save, Shield, Users } from 'lucide-react';
import type { AccountDto } from '@gather/contracts';
import { ApiClient, ApiError, type OfficeWorkspaceDetail } from '../../lib/api';
import { SubmissionKey } from '../../lib/idempotency';
import { AppLink } from '../../routing/AppLink';
import { companyPath } from '../../routing/routes';
import { PRODUCT_NAME } from '../../brand';
import { messageForApi } from '../auth/messages';
import { CompanyInvitationManager } from './CompanyInvitationManager';
import { WorkspaceMapEditor } from './WorkspaceMapEditor';
import { workspaceRoleLabel } from './workspace-role';
import './space-settings.css';

type Props = {
  account: AccountDto;
  api: ApiClient;
  workspace: OfficeWorkspaceDetail;
  mutationPending: boolean;
  runMutation: <T>(action: () => Promise<T>) => Promise<T>;
  onReauthenticate: (password: string) => Promise<AccountDto | null>;
  onUnauthorized: (notice?: string) => void;
  onBack: () => void;
  onLeft: () => void;
  onUpdated: (workspace: OfficeWorkspaceDetail) => void;
};

type Member = Awaited<ReturnType<ApiClient['workspaceMembers']>>[number];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function SpaceSettings({
  account,
  api,
  workspace,
  mutationPending,
  runMutation,
  onReauthenticate,
  onUnauthorized,
  onBack,
  onLeft,
  onUpdated,
}: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState('');
  const [name, setName] = useState(workspace.name);
  const [mapEditorOpen, setMapEditorOpen] = useState(false);
  const [roomCount, setRoomCount] = useState(workspace.roomCount);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferPassword, setTransferPassword] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState('');
  const [refreshId, setRefreshId] = useState(0);
  const renameKey = useRef(new SubmissionKey());
  const roomsKey = useRef(new SubmissionKey());
  const transferKey = useRef(new SubmissionKey());
  const actionKeys = useRef(new Map<string, SubmissionKey>());
  const roleKeys = useRef(new Map<string, SubmissionKey>());
  const draftsToPreserve = useRef<{ name?: string; roomCount?: number }>({});
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const onLeftRef = useRef(onLeft);
  const onUpdatedRef = useRef(onUpdated);
  const owner = workspace.role === 'owner';
  const administrator = workspace.role === 'admin';
  const canManageMembers = owner || administrator;

  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
    onLeftRef.current = onLeft;
    onUpdatedRef.current = onUpdated;
  }, [onLeft, onUnauthorized, onUpdated]);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    void Promise.all([
      api.workspaceDetail(workspace.id, controller.signal),
      api.workspaceMembers(workspace.id, controller.signal),
    ])
      .then(([nextWorkspace, nextMembers]) => {
        if (!current) return;
        onUpdatedRef.current(nextWorkspace);
        setName(draftsToPreserve.current.name ?? nextWorkspace.name);
        setRoomCount(draftsToPreserve.current.roomCount ?? nextWorkspace.roomCount);
        draftsToPreserve.current = {};
        setMembers(nextMembers);
      })
      .catch((caught: unknown) => {
        if (
          !current ||
          controller.signal.aborted ||
          (caught instanceof ApiError && caught.code === 'stale_response')
        )
          return;
        if (
          caught instanceof ApiError &&
          (caught.status === 401 || caught.code === 'csrf_rejected')
        )
          onUnauthorizedRef.current('Your access to this space changed. Sign in again if needed.');
        else if (caught instanceof ApiError && (caught.status === 403 || caught.status === 404))
          onLeftRef.current();
        else setMembersError(messageForApi(caught));
      })
      .finally(() => {
        if (current && !controller.signal.aborted) setMembersLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [api, workspace.id, refreshId]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    document.title = `${workspace.name} · Space settings · ${PRODUCT_NAME}`;
  }, [workspace.name]);

  function reportError(caught: unknown, preserveDraft?: { name?: string; roomCount?: number }) {
    if (
      caught instanceof ApiError &&
      ((caught.status === 401 && caught.code !== 'invalid_credentials') ||
        caught.code === 'csrf_rejected')
    ) {
      onUnauthorizedRef.current('Your access to this space changed.');
      return;
    }
    if (caught instanceof ApiError && caught.code === 'office_layout_managed') {
      setError('This office uses a published layout. Add meeting rooms in the map editor.');
      return;
    }
    if (caught instanceof ApiError && (caught.status === 403 || caught.status === 404)) {
      setError('Your role or access changed. Refreshing the latest space permissions…');
      setMembersLoading(true);
      setMembersError('');
      setRefreshId((value) => value + 1);
      return;
    }
    if (caught instanceof ApiError && caught.code === 'office_in_use') {
      setError(
        'Everyone must leave the office before its room layout can change. The office has not been modified.',
      );
      return;
    }
    if (caught instanceof ApiError && caught.code === 'revision_conflict') {
      if (preserveDraft) draftsToPreserve.current = preserveDraft;
      setError(
        'This space changed in another session. Your draft is preserved; review the latest space details before saving again.',
      );
      setMembersLoading(true);
      setMembersError('');
      setRefreshId((value) => value + 1);
      return;
    }
    setError(messageForApi(caught));
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { name: name.trim(), expectedRevision: workspace.revision };
    const key = renameKey.current.forPayload(input);
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await runMutation(() => api.renameWorkspace(workspace.id, input, key));
      renameKey.current.clear();
      const updated = { ...workspace, name: result.name, revision: result.revision };
      onUpdated(updated);
      setName(result.name);
      setStatus('Space name updated.');
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.outcomeUnknown)) renameKey.current.clear();
      reportError(caught, { name: input.name });
    } finally {
      setBusy(false);
    }
  }

  async function saveRooms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { roomCount, expectedRevision: workspace.revision };
    const key = roomsKey.current.forPayload(input);
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await runMutation(() =>
        api.updateWorkspaceRoomCount(workspace.id, workspace.officeId, input, key),
      );
      roomsKey.current.clear();
      const updated = { ...workspace, roomCount: result.roomCount, revision: result.revision };
      onUpdated(updated);
      setStatus(
        `Office layout saved with ${result.roomCount} rooms. Reopen the office to load the new layout.`,
      );
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.outcomeUnknown)) roomsKey.current.clear();
      reportError(caught, { roomCount: input.roomCount });
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: Member) {
    let keyStore = actionKeys.current.get(member.userId);
    if (!keyStore) {
      keyStore = new SubmissionKey();
      actionKeys.current.set(member.userId, keyStore);
    }
    const key = keyStore.forPayload({ userId: member.userId });
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await runMutation(() => api.removeWorkspaceMember(workspace.id, member.userId, key));
      keyStore.clear();
      actionKeys.current.delete(member.userId);
      setConfirmRemoveId('');
      setStatus(`${member.displayName} was removed.`);
      setMembersLoading(true);
      setMembersError('');
      setRefreshId((value) => value + 1);
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.outcomeUnknown)) {
        keyStore.clear();
        actionKeys.current.delete(member.userId);
      }
      reportError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function changeMemberRole(member: Member, role: 'admin' | 'member') {
    if (!owner || member.role === 'owner' || member.role === role) return;
    const action = role === 'admin' ? 'promote to Admin' : 'change back to Member';
    if (!window.confirm(`${action} ${member.displayName}?`)) return;
    if (role === 'admin') {
      const password = window.prompt('Confirm your password to grant Admin access.');
      if (!password) return;
      try {
        if (!(await onReauthenticate(password))) return;
      } catch (caught) {
        reportError(caught);
        return;
      }
    }
    const keyId = `${member.userId}:${role}`;
    let keyStore = roleKeys.current.get(keyId);
    if (!keyStore) {
      keyStore = new SubmissionKey();
      roleKeys.current.set(keyId, keyStore);
    }
    const key = keyStore.forPayload({ userId: member.userId, role });
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await runMutation(() =>
        api.updateWorkspaceMemberRole(workspace.id, member.userId, { role }, key),
      );
      keyStore.clear();
      roleKeys.current.delete(keyId);
      setStatus(`${member.displayName} is now ${role === 'admin' ? 'Admin' : 'Member'}.`);
      setMembersLoading(true);
      setMembersError('');
      setRefreshId((value) => value + 1);
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.outcomeUnknown)) {
        keyStore.clear();
        roleKeys.current.delete(keyId);
      }
      reportError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function transferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !transferTarget ||
      !window.confirm(
        'Transfer space ownership? You will become a member and the selected person will receive owner controls.',
      )
    )
      return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const verified = await onReauthenticate(transferPassword);
      if (!verified) throw new ApiError('invalid_credentials', 401);
      const key = transferKey.current.forPayload({ userId: transferTarget });
      await runMutation(() => api.transferWorkspaceOwnership(workspace.id, transferTarget, key));
      transferKey.current.clear();
      setTransferPassword('');
      setStatus('Ownership transferred. Refreshing current permissions…');
      setMembersLoading(true);
      setMembersError('');
      setRefreshId((value) => value + 1);
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function leaveSpace() {
    if (owner) {
      setError('Transfer ownership before leaving this space.');
      return;
    }
    if (
      !window.confirm(`Leave ${workspace.name}? You will lose access to its office and messages.`)
    )
      return;
    let keyStore = actionKeys.current.get('leave');
    if (!keyStore) {
      keyStore = new SubmissionKey();
      actionKeys.current.set('leave', keyStore);
    }
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await runMutation(() =>
        api.leaveWorkspace(workspace.id, keyStore!.forPayload({ leave: workspace.id })),
      );
      keyStore.clear();
      actionKeys.current.delete('leave');
      setStatus('You left the space.');
      onLeft();
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboard space-settings-page" data-workspace-id={workspace.id}>
      <a className="skip-link" href="#space-settings-main">
        Skip to space settings
      </a>
      <header className="dashboard-bar">
        <AppLink className="dashboard-brand space-settings-brand" to="/companies">
          <span className="space-settings-brand-mark" aria-hidden="true">
            OO
          </span>
          <strong>{PRODUCT_NAME}</strong>
        </AppLink>
        <div className="dashboard-account-actions">
          <span className="dashboard-account-name">{account.displayName}</span>
          <AppLink to="/account/security" className="dashboard-secondary">
            <Shield size={15} aria-hidden="true" /> Account security
          </AppLink>
        </div>
      </header>
      <section
        className="space-settings-content"
        id="space-settings-main"
        aria-labelledby="space-settings-title"
      >
        <AppLink to={companyPath(workspace.id)} className="space-settings-back" onNavigate={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> Back to {workspace.name}
        </AppLink>
        <header className="space-settings-hero">
          <div className="space-settings-hero-icon" aria-hidden="true">
            <Building2 size={25} />
          </div>
          <div className="space-settings-hero-copy">
            <p className="account-eyebrow">SPACE SETTINGS</p>
            <h1 id="space-settings-title" ref={titleRef} tabIndex={-1}>
              {workspace.name}
            </h1>
            <p className="space-settings-lead">
              Manage the people, office, and access for this space.
            </p>
            <div className="space-settings-summary" aria-label="Space summary">
              <span className="space-settings-role">
                <Shield size={14} aria-hidden="true" /> {workspaceRoleLabel(workspace.role)} access
              </span>
              <span>{workspace.memberCount} members</span>
              <span>{workspace.roomCount} office rooms</span>
            </div>
          </div>
        </header>
        <nav className="space-settings-jump-nav" aria-label="Space settings sections">
          <a href="#space-settings-general" className="is-current">
            General
          </a>
          <a href="#space-settings-rooms">Office rooms</a>
          <a href="#members-title">Members</a>
          {owner && <a href="#invitations-title">Invitations</a>}
          {owner && <a href="#transfer-title">Ownership</a>}
          <a href="#leave-title">Leave space</a>
        </nav>
        {status && (
          <p className="account-message space-settings-feedback" role="status">
            <Check size={16} aria-hidden="true" />
            {status}
          </p>
        )}
        {error && (
          <p className="account-message is-error space-settings-feedback" role="alert">
            {error}
          </p>
        )}

        <section
          className="space-settings-card space-settings-primary-card"
          id="space-settings-general"
          aria-labelledby="space-details-title"
        >
          <div className="space-settings-card-heading">
            <div>
              <span className="space-settings-step">01</span>
              <h2 id="space-details-title">General</h2>
            </div>
            <p>Set the name people see when they enter this space.</p>
          </div>
          {owner ? (
            <form className="dashboard-company-form" onSubmit={(event) => void saveName(event)}>
              <label className="dashboard-label">
                Display name
                <input
                  value={name}
                  minLength={2}
                  maxLength={80}
                  required
                  disabled={busy || mutationPending}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button
                className="dashboard-create"
                type="submit"
                disabled={busy || mutationPending || name.trim() === workspace.name}
              >
                <Save size={15} aria-hidden="true" /> {busy ? 'Saving…' : 'Save name'}
              </button>
            </form>
          ) : (
            <div className="space-settings-readonly">
              <span>Space name</span>
              <strong>{workspace.name}</strong>
            </div>
          )}
        </section>

        <section
          className="space-settings-card"
          id="space-settings-rooms"
          aria-labelledby="room-count-title"
        >
          <div className="space-settings-card-heading">
            <div>
              <span className="space-settings-step">02</span>
              <h2 id="room-count-title">Office rooms</h2>
            </div>
            <p>Choose how many rooms are available in the office.</p>
          </div>
          {owner && !workspace.usesMapEditor ? (
            <form className="dashboard-company-form" onSubmit={(event) => void saveRooms(event)}>
              <label className="dashboard-label">
                Meeting room count
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  value={roomCount}
                  disabled={busy || mutationPending}
                  onChange={(event) => setRoomCount(Number(event.target.value))}
                />
              </label>
              <p className="space-settings-note">
                Room identities stay stable when rooms are added or removed. Everyone must leave the
                office before the layout can change.
              </p>
              <button
                className="dashboard-create"
                type="submit"
                disabled={busy || mutationPending || roomCount === workspace.roomCount}
              >
                <Save size={15} aria-hidden="true" /> {busy ? 'Saving…' : 'Save room count'}
              </button>
            </form>
          ) : (
            <div className="space-settings-readonly">
              <span>Meeting rooms</span>
              <strong>{workspace.roomCount}</strong>
            </div>
          )}
          {owner && (
            <button
              type="button"
              className="dashboard-secondary workspace-map-entry"
              aria-expanded={mapEditorOpen}
              onClick={() => setMapEditorOpen((open) => !open)}
            >
              {mapEditorOpen ? 'Close map editor' : 'Edit office map'}
            </button>
          )}
          {owner && mapEditorOpen && (
            <WorkspaceMapEditor
              api={api}
              workspace={workspace}
              onPublished={() => setRefreshId((value) => value + 1)}
            />
          )}
        </section>

        <section className="space-settings-card" aria-labelledby="members-title">
          <div className="space-settings-heading">
            <div className="space-settings-members-title">
              <span className="space-settings-step">03</span>
              <div>
                <h2 id="members-title">
                  <Users size={18} aria-hidden="true" /> Members
                </h2>
                <p>
                  {membersLoading
                    ? 'Loading the current roster…'
                    : `${members.length} people in this space`}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="dashboard-secondary"
              disabled={membersLoading || busy || mutationPending}
              onClick={() => {
                setMembersLoading(true);
                setMembersError('');
                setRefreshId((value) => value + 1);
              }}
            >
              <RefreshCw size={14} aria-hidden="true" /> Refresh
            </button>
          </div>
          {membersLoading ? (
            <p className="space-settings-list-state" role="status">
              Loading members…
            </p>
          ) : membersError ? (
            <p className="space-settings-list-state is-error" role="alert">
              {membersError}
            </p>
          ) : members.length === 0 ? (
            <p className="space-settings-list-state">No active members.</p>
          ) : (
            <ul className="space-member-list">
              {members.map((member) => (
                <li key={member.userId}>
                  <div className="space-member-identity">
                    <span
                      className={`space-member-avatar${member.role === 'owner' ? ' is-owner' : ''}`}
                      aria-hidden="true"
                    >
                      {initials(member.displayName)}
                    </span>
                    <span className="space-member-copy">
                      <strong>
                        {member.displayName}
                        {member.userId === account.id && (
                          <span className="space-member-you">You</span>
                        )}
                      </strong>
                      <small>{workspaceRoleLabel(member.role)} of this space</small>
                    </span>
                  </div>
                  <div className="space-member-actions">
                    <span
                      className={`space-member-role${member.role === 'owner' ? ' is-owner' : ''}`}
                    >
                      {workspaceRoleLabel(member.role)}
                    </span>
                    {owner && member.role !== 'owner' && (
                      <button
                        type="button"
                        className="space-role-button"
                        disabled={busy || mutationPending}
                        onClick={() =>
                          void changeMemberRole(
                            member,
                            member.role === 'admin' ? 'member' : 'admin',
                          )
                        }
                      >
                        {member.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
                      </button>
                    )}
                    {canManageMembers &&
                      member.role !== 'owner' &&
                      (owner || member.role === 'member') &&
                      (confirmRemoveId === member.userId ? (
                        <div
                          className="space-member-confirm"
                          role="group"
                          aria-label={`Confirm removal of ${member.displayName}`}
                        >
                          <span>They will lose access to this space.</span>
                          <button
                            type="button"
                            className="space-danger-button"
                            disabled={busy || mutationPending}
                            onClick={() => void removeMember(member)}
                          >
                            {busy ? 'Removing…' : 'Confirm remove'}
                          </button>
                          <button
                            type="button"
                            className="space-cancel-button"
                            disabled={busy || mutationPending}
                            onClick={() => setConfirmRemoveId('')}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="space-remove-button"
                          disabled={busy || mutationPending}
                          onClick={() => setConfirmRemoveId(member.userId)}
                        >
                          Remove
                        </button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManageMembers && (
          <CompanyInvitationManager
            api={api}
            company={workspace}
            mutationPending={mutationPending || busy}
            runMutation={runMutation}
            onUnauthorized={onUnauthorized}
          />
        )}

        {owner && (
          <section className="space-settings-card" aria-labelledby="transfer-title">
            <div className="space-settings-card-heading">
              <div>
                <span className="space-settings-step">05</span>
                <h2 id="transfer-title">Transfer ownership</h2>
              </div>
              <p>Give another active member full control of this space.</p>
            </div>
            <p className="space-settings-note">
              You will become a member after the transfer. Confirm with your password to continue.
            </p>
            <form
              className="dashboard-company-form"
              onSubmit={(event) => void transferOwnership(event)}
            >
              <label className="dashboard-label">
                New owner
                <select
                  value={transferTarget}
                  required
                  disabled={busy || mutationPending}
                  onChange={(event) => setTransferTarget(event.target.value)}
                >
                  <option value="">Choose a member</option>
                  {members
                    .filter((member) => member.role !== 'owner')
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName}
                      </option>
                    ))}
                </select>
              </label>
              <label className="dashboard-label">
                Confirm your password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={transferPassword}
                  disabled={busy || mutationPending}
                  onChange={(event) => setTransferPassword(event.target.value)}
                />
              </label>
              <button
                className="dashboard-secondary"
                type="submit"
                disabled={busy || mutationPending || !transferTarget}
              >
                {busy ? 'Transferring…' : 'Transfer ownership'}
              </button>
            </form>
          </section>
        )}

        <section className="space-settings-card space-leave-card" aria-labelledby="leave-title">
          <div className="space-settings-card-heading">
            <div>
              <span className="space-settings-step">{owner ? '06' : '04'}</span>
              <h2 id="leave-title">Leave space</h2>
            </div>
            <p>Remove your own membership and access.</p>
          </div>
          {owner ? (
            <p className="space-settings-note">
              Transfer ownership before leaving. The new owner can then remove your membership or
              you can leave from these settings.
            </p>
          ) : (
            <p className="space-settings-note">
              You will lose access to this space, its office, and its messages.
            </p>
          )}
          <button
            className="space-danger-button"
            type="button"
            disabled={busy || mutationPending || owner}
            onClick={() => void leaveSpace()}
          >
            Leave space
          </button>
        </section>
      </section>
    </main>
  );
}
