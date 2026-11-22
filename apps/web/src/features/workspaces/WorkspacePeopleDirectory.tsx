import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import type { ApiClient } from '../../lib/api';
import type { OfficeClient } from '../office/office-client';
import {
  deriveWorkspacePresence,
  WorkspacePresenceStore,
  type OfficePresenceParticipant,
} from './workspace-member-presence';

type WorkspaceMember = Awaited<ReturnType<ApiClient['workspaceMembers']>>[number];
type PresentMember = {
  member: WorkspaceMember;
  participant: OfficePresenceParticipant;
  inMeeting: boolean;
};

type Props = {
  client: OfficeClient;
  members: readonly WorkspaceMember[];
  meetingParticipationIds: ReadonlySet<string>;
  selfId: string;
  selectedUserId: string | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onSelectOnline: (entry: PresentMember, trigger: HTMLButtonElement) => void;
  onSelectOffline: (member: WorkspaceMember, trigger: HTMLButtonElement) => void;
};

export const WorkspacePeopleDirectory = memo(function WorkspacePeopleDirectory({
  client,
  members,
  meetingParticipationIds,
  selfId,
  selectedUserId,
  loading,
  error,
  onRetry,
  onSelectOnline,
  onSelectOffline,
}: Props) {
  const store = useMemo(() => new WorkspacePresenceStore(client), [client]);
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  const presenceState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [query, setQuery] = useState('');
  const [onlineExpanded, setOnlineExpanded] = useState(true);
  const [offlineExpanded, setOfflineExpanded] = useState(true);
  const rootRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const previousRects = useRef(new Map<string, DOMRect>());
  const presence = useMemo(
    () => deriveWorkspacePresence(members, presenceState.participants, meetingParticipationIds),
    [members, presenceState.participants, meetingParticipationIds],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (member: WorkspaceMember) =>
    !normalizedQuery || member.displayName.toLocaleLowerCase().includes(normalizedQuery);
  const online = presence.online.filter(({ member }) => matches(member));
  const offline = presence.offline.filter(matches);
  const visibleRowsKey = [
    ...online.map(({ member }) => `o:${member.userId}`),
    ...offline.map((member) => `f:${member.userId}`),
    `oe:${onlineExpanded}`,
    `fe:${offlineExpanded}`,
  ].join('|');

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const currentRects = new Map<string, DOMRect>();
    for (const row of root.querySelectorAll<HTMLElement>('[data-member-id]')) {
      const userId = row.dataset.memberId;
      if (!userId) continue;
      const rect = row.getBoundingClientRect();
      const previous = previousRects.current.get(userId);
      currentRects.set(userId, rect);
      if (!previous || reduceMotion || typeof row.animate !== 'function') continue;
      const deltaX = previous.left - rect.left;
      const deltaY = previous.top - rect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;
      row.animate(
        [
          { transform: `translate(${deltaX}px, ${Math.max(-36, Math.min(36, deltaY))}px)` },
          { transform: 'translate(0, 0)' },
        ],
        { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
    previousRects.current = currentRects;
  }, [visibleRowsKey, presenceState.participants]);

  return (
    <>
      <label className="office-people-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="Search people"
          aria-label="Search people"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="office-people-search-clear"
            aria-label="Clear people search"
            onClick={() => setQuery('')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : (
          <kbd>Ctrl F</kbd>
        )}
      </label>
      <section
        ref={rootRef}
        className="office-people-list"
        aria-label="People in the office"
        aria-live="off"
      >
        <div className="office-people-scroll">
          <p className="office-people-announcement" role="status" aria-live="polite">
            Online {online.length}. Offline {offline.length}.
          </p>
          {presenceState.connection === 'reconnecting' && (
            <p className="office-presence-connection" role="status">
              Reconnecting to live presence…
            </p>
          )}
          {loading && (
            <p className="office-people-message" role="status">
              Loading people…
            </p>
          )}
          {error && (
            <p className="office-people-message" role="alert">
              {error}{' '}
              <button type="button" className="link-button" onClick={onRetry}>
                Retry
              </button>
            </p>
          )}
          {!loading && !error && (
            <>
              <PeopleSection
                title="Online"
                count={online.length}
                expanded={onlineExpanded}
                onToggle={() => setOnlineExpanded((expanded) => !expanded)}
                emptyMessage={normalizedQuery ? 'No online matches.' : 'No one is online.'}
              >
                {online.map((entry) => (
                  <OnlinePersonRow
                    key={entry.member.userId}
                    entry={entry}
                    self={entry.member.userId === selfId}
                    selected={selectedUserId === entry.member.userId}
                    onSelect={(trigger) => onSelectOnline(entry, trigger)}
                  />
                ))}
              </PeopleSection>
              <PeopleSection
                title="Offline"
                count={offline.length}
                expanded={offlineExpanded}
                onToggle={() => setOfflineExpanded((expanded) => !expanded)}
                emptyMessage={normalizedQuery ? 'No offline matches.' : 'No one is offline.'}
              >
                {offline.map((member) => (
                  <OfflinePersonRow
                    key={member.userId}
                    member={member}
                    self={member.userId === selfId}
                    selected={selectedUserId === member.userId}
                    onSelect={(trigger) => onSelectOffline(member, trigger)}
                  />
                ))}
              </PeopleSection>
              {normalizedQuery && online.length + offline.length === 0 && (
                <p className="office-people-message">No people match “{query.trim()}”.</p>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
});

function PeopleSection({
  title,
  count,
  expanded,
  onToggle,
  emptyMessage,
  children,
}: {
  title: 'Online' | 'Offline';
  count: number;
  expanded: boolean;
  onToggle: () => void;
  emptyMessage: string;
  children: ReactNode;
}) {
  const hasChildren = count > 0;
  return (
    <section className="office-people-section" aria-label={`${title} people`}>
      <button
        type="button"
        className="office-people-section-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <ChevronDown size={15} aria-hidden="true" className={expanded ? '' : 'is-collapsed'} />
        <span className="office-people-section-label">
          {title} ({count})
        </span>
      </button>
      <div
        className={`office-people-section-body${expanded ? ' is-expanded' : ''}`}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="office-people-section-inner">
          {hasChildren ? (
            <ul>{children}</ul>
          ) : (
            <p className="office-people-empty">{emptyMessage}</p>
          )}
        </div>
      </div>
    </section>
  );
}

const OnlinePersonRow = memo(function OnlinePersonRow({
  entry,
  self,
  selected,
  onSelect,
}: {
  entry: PresentMember;
  self: boolean;
  selected: boolean;
  onSelect: (trigger: HTMLButtonElement) => void;
}) {
  const { member, participant, inMeeting } = entry;
  const status = participant.reconnecting
    ? 'Reconnecting'
    : participant.availability === 'away'
      ? 'Away'
      : participant.availability === 'busy'
        ? 'Busy'
        : 'Active';
  return (
    <li className="office-person-row" data-member-id={member.userId}>
      <button
        type="button"
        className="office-person-select"
        aria-pressed={selected}
        disabled={self}
        onClick={(event) => onSelect(event.currentTarget)}
      >
        <Avatar member={member} online />
        <span className="office-person-copy">
          <span className="office-person-name" title={member.displayName}>
            {member.displayName}
            {self ? ' (you)' : ''}
          </span>
          <small>
            {status}
            {inMeeting ? ' · In a meeting' : ''}
          </small>
        </span>
      </button>
    </li>
  );
});

const OfflinePersonRow = memo(function OfflinePersonRow({
  member,
  self,
  selected,
  onSelect,
}: {
  member: WorkspaceMember;
  self: boolean;
  selected: boolean;
  onSelect: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <li className="office-person-row" data-member-id={member.userId}>
      <button
        type="button"
        className="office-person-select is-offline"
        aria-pressed={selected}
        onClick={(event) => onSelect(event.currentTarget)}
      >
        <Avatar member={member} online={false} />
        <span className="office-person-copy">
          <span className="office-person-name" title={member.displayName}>
            {member.displayName}
            {self ? ' (you)' : ''}
          </span>
          <small>Offline</small>
        </span>
      </button>
    </li>
  );
});

function Avatar({ member, online }: { member: WorkspaceMember; online: boolean }) {
  const firstInitial = member.displayName.trim().charAt(0).toLocaleUpperCase() || '?';
  return (
    <span
      className="office-person-avatar"
      style={{ '--avatar-color': avatarColor(member.userId) } as CSSProperties}
      aria-hidden="true"
    >
      {firstInitial}
      <i className={online ? 'is-online' : ''} />
    </span>
  );
}

const AVATAR_COLORS = ['#f4d8c2', '#d8e8d3', '#d8e4f4', '#eee0b8', '#e7d9f1', '#f0dce4'];
function avatarColor(userId: string) {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length]!;
}
