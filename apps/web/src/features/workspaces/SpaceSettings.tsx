import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, RefreshCw, Save, Users } from 'lucide-react';
import type { AccountDto } from '@gather/contracts';
import { ApiClient, ApiError, type OfficeWorkspaceDetail } from '../../lib/api';
import { SubmissionKey } from '../../lib/idempotency';
import { AppLink } from '../../routing/AppLink';
import { companyPath } from '../../routing/routes';
import { messageForApi } from '../auth/messages';
import { CompanyInvitationManager } from './CompanyInvitationManager';
import { WorkspaceMapEditor } from './WorkspaceMapEditor';
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const onUpdatedRef = useRef(onUpdated);
  const owner = workspace.role === 'owner';

  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
    onUpdatedRef.current = onUpdated;
  }, [onUnauthorized, onUpdated]);

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
        setName(nextWorkspace.name);
        setRoomCount(nextWorkspace.roomCount);
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
          (caught.status === 401 || caught.status === 403 || caught.code === 'csrf_rejected')
        )
          onUnauthorizedRef.current('Your access to this space changed. Sign in again if needed.');
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

  function reportError(caught: unknown) {
    if (
      caught instanceof ApiError &&
      (caught.status === 401 || caught.status === 403 || caught.code === 'csrf_rejected')
    ) {
      onUnauthorizedRef.current('Your access to this space changed.');
      return;
    }
    if (caught instanceof ApiError && caught.code === 'office_layout_managed') {
      setError('This office uses a published layout. Add meeting rooms in the map editor.');
      return;
    }
    if (caught instanceof ApiError && caught.code === 'office_in_use') {
      setError(
        'Everyone must leave the office before its room layout can change. The office has not been modified.',
      );
      return;
    }
    if (caught instanceof ApiError && caught.code === 'revision_conflict') {
      setError(
        'This space changed in another session. Refresh and review the latest values before saving again.',
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
      reportError(caught);
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
      reportError(caught);
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
        <AppLink className="dashboard-brand" to="/companies">
          <strong>Gather Lite</strong>
        </AppLink>
        <div className="dashboard-account-actions">
          <span className="dashboard-account-name">{account.displayName}</span>
          <AppLink to="/account/security" className="dashboard-secondary">
            Account security
          </AppLink>
        </div>
      </header>
      <section
        className="space-settings-content"
        id="space-settings-main"
        aria-labelledby="space-settings-title"
      >
        <AppLink to={companyPath(workspace.id)} className="dashboard-secondary" onNavigate={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> Back to {workspace.name}
        </AppLink>
        <p className="account-eyebrow">SPACE SETTINGS</p>
        <h1 id="space-settings-title" ref={titleRef} tabIndex={-1}>
          {workspace.name}
        </h1>
        <p className="space-settings-lead">
          {workspace.memberCount} members · Your role: {owner ? 'Owner' : 'Member'}
        </p>
        {status && (
          <p className="account-message" role="status">
            {status}
          </p>
        )}
        {error && (
          <p className="account-message is-error" role="alert">
            {error}
          </p>
        )}

        <section className="space-settings-card" aria-labelledby="space-details-title">
          <h2 id="space-details-title">Space details</h2>
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
                <Save size={15} aria-hidden="true" /> Save name
              </button>
            </form>
          ) : (
            <p>{workspace.name}</p>
          )}
        </section>

        <section className="space-settings-card" aria-labelledby="room-count-title">
          <h2 id="room-count-title">Office rooms</h2>
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
                <Save size={15} aria-hidden="true" /> Save room count
              </button>
            </form>
          ) : (
            <p>{workspace.roomCount} meeting rooms</p>
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
            <h2 id="members-title">
              <Users size={18} aria-hidden="true" /> Members
            </h2>
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
            <p role="status">Loading members…</p>
          ) : membersError ? (
            <p role="alert">{membersError}</p>
          ) : members.length === 0 ? (
            <p>No active members.</p>
          ) : (
            <ul className="space-member-list">
              {members.map((member) => (
                <li key={member.userId}>
                  <span>
                    <strong>
                      {member.displayName}
                      {member.userId === account.id ? ' (you)' : ''}
                    </strong>
                    <small>{member.role === 'owner' ? 'Owner' : 'Member'}</small>
                  </span>
                  {owner && member.role !== 'owner' && (
                    <button
                      type="button"
                      className="dashboard-secondary"
                      disabled={busy || mutationPending}
                      onClick={() =>
                        setConfirmRemoveId((current) =>
                          current === member.userId ? '' : member.userId,
                        )
                      }
                    >
                      {confirmRemoveId === member.userId ? 'Cancel removal' : 'Remove'}
                    </button>
                  )}
                  {confirmRemoveId === member.userId && (
                    <button
                      type="button"
                      className="dashboard-secondary"
                      disabled={busy || mutationPending}
                      onClick={() => void removeMember(member)}
                    >
                      Remove member
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {owner && (
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
            <h2 id="transfer-title">Transfer ownership</h2>
            <p>
              Ownership can only be transferred to an active verified member. Confirm with your
              password before the transfer.
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
                    .filter((member) => member.role === 'member')
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName}
                      </option>
                    ))}
                </select>
              </label>
              <label className="dashboard-label">
                Your password
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
          <h2 id="leave-title">Leave space</h2>
          {owner ? (
            <p>
              Transfer ownership before leaving. The new owner can then remove your membership or
              you can leave from these settings.
            </p>
          ) : (
            <p>You will lose access to this space, its office, and its messages.</p>
          )}
          <button
            className="dashboard-secondary"
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
