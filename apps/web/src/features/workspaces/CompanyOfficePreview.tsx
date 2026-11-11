import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  Hash,
  LayoutGrid,
  Map as MapIcon,
  Mic,
  MicOff,
  MessageCircle,
  Settings2,
  VideoOff,
  UserPlus,
} from 'lucide-react';
import type { AccountDto } from '@gather/contracts';
import type { OfficeMessage } from '@gather/contracts';
import type { OfficeWorkspaceDetail } from '../../lib/api';
import { ApiClient } from '../../lib/api';
import { DEFAULT_LOOK } from '../../../avatarLook';
import VivoScene from '../../../VivoScene';
import type { Overrides } from '../../../../shared/office-objects.js';
import ChatView from '../../../chat/ChatView';
import type { ChatMessage, DirectoryUser, Participant } from '../../../types';
import { OfficeClient } from '../office/office-client';
import { latestProximityConversation } from '../office/proximity-conversation';
import {
  ProximityAudioSession,
  type ProximityAudioStatus,
  type ProximityRemoteAudioTrack,
} from '../office/proximity-audio-session';
import { CompanyInvitationManager } from './CompanyInvitationManager';
import './office-preview.css';

const CommonsScene = lazy(() =>
  import('../../../commons-preview/CommonsScene').then((module) => ({
    default: module.CommonsScene,
  })),
);
const LiveCommonsScene = lazy(() =>
  import('../../../commons-preview/LiveCommonsScene').then((module) => ({
    default: module.LiveCommonsScene,
  })),
);

type OfficeSection = 'office' | 'chat' | 'calendar' | 'activity' | 'invitations';
const OFFICE_CHANNEL = {
  id: 'office',
  name: 'office',
  topic: 'Company-wide office chat · Messages are retained for 90 days.',
};
const MEMBER_COLORS = ['#7968e6', '#54a98f', '#d18b49', '#6888bf', '#bd6b83'];

function mergeOfficeMessages(current: OfficeMessage[], incoming: OfficeMessage[]) {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) merged.set(message.id, message);
  return [...merged.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-100);
}

function sceneAvatarForAppearance(appearance: { bodyId: string; paletteId: string }) {
  if (appearance.bodyId === 'commons-worker' && appearance.paletteId === 'teal')
    return DEFAULT_LOOK;
  return undefined;
}

function bindRemoteAudioTrack(
  track: ProximityRemoteAudioTrack,
  identity: string,
  container: HTMLDivElement | null,
) {
  const element = track.attach() as HTMLAudioElement;
  element.autoplay = true;
  element.dataset.participantId = identity;
  element.setAttribute('aria-label', `Audio from ${identity}`);
  container?.appendChild(element);
  void element.play().catch(() => undefined);
  return () => {
    track.detach(element);
    element.remove();
  };
}

type Props = {
  account: AccountDto;
  api: ApiClient;
  detail: OfficeWorkspaceDetail;
  mutationPending: boolean;
  runMutation: <T>(action: () => Promise<T>) => Promise<T>;
  onUnauthorized: (notice?: string) => void;
  onBack: () => void;
  onOpenSecurity: () => void;
};

export function CompanyOfficePreview({
  account,
  api,
  detail,
  mutationPending,
  runMutation,
  onUnauthorized,
  onBack,
  onOpenSecurity,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const client = useMemo(
    () => new OfficeClient(api, detail.id, detail.officeId),
    [api, detail.id, detail.officeId],
  );
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const connected = state.status === 'connected';
  const participationId = connected ? (state.ready?.participationId ?? null) : null;
  const latestConversation = latestProximityConversation(
    state.conversationUpdates,
    participationId,
  );
  const activeProximityConversation =
    latestConversation?.state === 'active' && latestConversation.mediaReady
      ? latestConversation
      : null;
  const activeVoiceContextKey = activeProximityConversation
    ? `${activeProximityConversation.conversationId}:${activeProximityConversation.version}:${activeProximityConversation.generation}:${participationId}`
    : null;
  const [officeActionError, setOfficeActionError] = useState('');
  const [officeActionPending, setOfficeActionPending] = useState(false);
  const [proximityOptIn, setProximityOptIn] = useState<{
    participationId: string;
    enabled: true;
  } | null>(null);
  const [proximityPending, setProximityPending] = useState(false);
  const [proximityAudioStatus, setProximityAudioStatus] = useState<ProximityAudioStatus>('off');
  const [proximityAudioError, setProximityAudioError] = useState('');
  const remoteAudioContainer = useRef<HTMLDivElement>(null);
  const mediaContextKey = useRef<string | null>(null);
  const proximityAudio = useRef<ProximityAudioSession | null>(null);
  const proximityOptedIn = Boolean(
    connected && proximityOptIn?.participationId === participationId && proximityOptIn.enabled,
  );
  const [zoom, setZoom] = useState(1.35);
  const [section, setSection] = useState<OfficeSection>('office');
  const [chatMessages, setChatMessages] = useState<OfficeMessage[]>([]);
  const [chatUsers, setChatUsers] = useState<DirectoryUser[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatLoading, setChatLoading] = useState(true);
  const [chatAvailable, setChatAvailable] = useState(false);
  const [chatError, setChatError] = useState('');
  const pendingChatMessage = useRef<{ text: string; id: string } | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [connected]);

  useEffect(() => () => client.close(), [client]);

  useEffect(() => {
    let active = true;
    const session = new ProximityAudioSession(
      (status, error) => {
        if (!active) return;
        setProximityAudioStatus(status);
        setProximityAudioError(error ?? '');
      },
      (track, identity) => bindRemoteAudioTrack(track, identity, remoteAudioContainer.current),
    );
    proximityAudio.current = session;
    return () => {
      active = false;
      void session.stop();
      proximityAudio.current = null;
    };
  }, []);

  useEffect(() => {
    mediaContextKey.current = activeVoiceContextKey;
    return () => {
      mediaContextKey.current = null;
      void proximityAudio.current?.stop();
    };
  }, [activeVoiceContextKey]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api.officeMessages(detail.id, detail.officeId, controller.signal),
      api.workspaceMembers(detail.id, controller.signal),
    ])
      .then(([messages, members]) => {
        if (controller.signal.aborted) return;
        setChatMessages((current) => mergeOfficeMessages(current, messages));
        setChatUsers(
          members.map((member, index) => ({
            userId: member.userId,
            name: member.displayName,
            color: MEMBER_COLORS[index % MEMBER_COLORS.length] ?? MEMBER_COLORS[0]!,
          })),
        );
        setChatAvailable(true);
        setChatError('');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setChatError('Could not load office messages. Check your connection and retry.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setChatLoading(false);
      });
    return () => controller.abort();
  }, [api, connected, detail.id, detail.officeId]);

  async function runOfficeAction(action: () => Promise<void>) {
    setOfficeActionError('');
    setOfficeActionPending(true);
    try {
      await action();
    } catch (error) {
      setOfficeActionError(
        error instanceof Error
          ? `Office action failed (${error.message}).`
          : 'Office action failed.',
      );
    } finally {
      setOfficeActionPending(false);
    }
  }

  async function changeProximityOptIn() {
    const enabled = !proximityOptedIn;
    if (!participationId) return;
    setProximityPending(true);
    setProximityAudioError('');
    if (!enabled) await proximityAudio.current?.stop();
    try {
      await client.setProximityOptIn(enabled);
      setProximityOptIn(enabled ? { participationId, enabled: true } : null);
    } catch {
      setProximityAudioError('Could not update nearby voice. Check your connection and retry.');
    } finally {
      setProximityPending(false);
    }
  }

  async function leaveProximityConversation() {
    if (!activeProximityConversation) return;
    await proximityAudio.current?.stop();
    await runOfficeAction(() =>
      client.leaveConversation(
        activeProximityConversation.conversationId,
        activeProximityConversation.version,
      ),
    );
  }

  function toggleProximityMicrophone() {
    const session = proximityAudio.current;
    if (!session || !activeProximityConversation || !participationId) return;
    if (proximityAudioStatus === 'live' || proximityAudioStatus === 'muted') {
      void session.toggleMicrophone();
      return;
    }
    const contextKey = activeVoiceContextKey;
    const conversation = activeProximityConversation;
    const currentParticipationId = participationId;
    if (!contextKey) return;
    void session.start(
      (signal) =>
        api.proximityMediaToken(
          conversation.conversationId,
          {
            participationId: currentParticipationId,
            conversationVersion: conversation.version,
          },
          signal,
        ),
      () => mediaContextKey.current === contextKey,
      conversation.version,
      conversation.generation,
    );
  }

  async function sendChatMessage(text: string) {
    setChatError('');
    const pendingMessage =
      pendingChatMessage.current?.text === text
        ? pendingChatMessage.current
        : { text, id: crypto.randomUUID() };
    pendingChatMessage.current = pendingMessage;
    try {
      const message = await api.sendOfficeMessage(detail.id, detail.officeId, {
        clientMessageId: pendingMessage.id,
        text,
      });
      setChatMessages((current) => mergeOfficeMessages(current, [message]));
      pendingChatMessage.current = null;
    } catch {
      setChatError('Your message could not be sent. Check your connection and try again.');
      throw new Error('office_message_send_failed');
    }
  }

  const chatViewMessages: ChatMessage[] = useMemo(
    () =>
      mergeOfficeMessages(chatMessages, state.chatEvents).map((message) => ({
        id: message.id,
        participantId: message.senderId,
        userId: message.senderId,
        name: message.senderName,
        text: message.text,
        channel: 'channel',
        channelId: OFFICE_CHANNEL.id,
        createdAt: message.createdAt,
      })),
    [chatMessages, state.chatEvents],
  );

  if (!connected) {
    return (
      <main className="office-prejoin" data-workspace-id={detail.id}>
        <a className="skip-link" href="#join-office-form">
          Skip to office entry
        </a>
        <header className="office-prejoin-header">
          <button
            className="office-prejoin-brand"
            type="button"
            aria-label="Back to companies"
            onClick={onBack}
          >
            <span className="office-prejoin-logo" aria-hidden="true">
              <LayoutGrid size={19} />
            </span>
            <strong>{detail.name}</strong>
          </button>
          <div className="office-prejoin-account" title={account.email}>
            <span aria-hidden="true">{account.displayName.slice(0, 1).toUpperCase()}</span>
            <span>{account.email}</span>
          </div>
        </header>

        <section className="office-prejoin-content" aria-label="Join the office">
          <div className="office-prejoin-camera" aria-label="Camera preview">
            <p>Your camera is off</p>
            <div className="office-prejoin-device-controls" aria-label="Media controls">
              <button
                type="button"
                aria-label="Microphone unavailable in this release"
                title="Microphone unavailable in this release"
                disabled
              >
                <MicOff size={17} />
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                aria-label="Camera unavailable in this release"
                title="Camera unavailable in this release"
                disabled
              >
                <VideoOff size={17} />
                <ChevronDown size={12} />
              </button>
            </div>
          </div>

          <div className="office-prejoin-form-wrap">
            <h1 id="company-office-preview-title" ref={titleRef} tabIndex={-1}>
              Welcome to {detail.name}
            </h1>
            <form
              id="join-office-form"
              className="office-prejoin-form"
              onSubmit={(event) => {
                event.preventDefault();
                void client.connect();
              }}
            >
              <input
                id="office-display-name"
                type="text"
                value={account.displayName}
                readOnly
                aria-label="Display name"
                aria-readonly="true"
                autoComplete="name"
              />
              {state.message && state.status !== 'connecting' && (
                <p className="office-prejoin-error" role="alert">
                  {state.message}
                </p>
              )}
              {state.status === 'connecting' && (
                <p className="office-prejoin-connecting" role="status" aria-live="polite">
                  Connecting to the office…
                </p>
              )}
              <button className="primary" type="submit" disabled={state.status === 'connecting'}>
                {state.status === 'connecting' ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  if (
    !state.bootstrap ||
    !state.ready ||
    !state.snapshot ||
    state.snapshot.participants.some(
      (participant) => !sceneAvatarForAppearance(participant.appearance),
    )
  ) {
    return (
      <main className="office-prejoin" data-workspace-id={detail.id}>
        <section className="office-prejoin-content" aria-labelledby="office-data-error-title">
          <div className="office-prejoin-form-wrap">
            <h1 id="office-data-error-title" ref={titleRef} tabIndex={-1}>
              Office data unavailable
            </h1>
            <p role="alert">
              The office map or participant appearance is missing or unsupported in this frontend.
              Return to your companies and try again.
            </p>
            <button className="primary" type="button" onClick={onBack}>
              Back to companies
            </button>
          </div>
        </section>
      </main>
    );
  }

  const { bootstrap, ready, snapshot } = state;
  const mapId = bootstrap.manifest.mapId;
  const participantCount = snapshot.participants.length;
  const pairedName = activeProximityConversation?.participants.find(
    (participant) => participant.participationId !== ready.participationId,
  )?.displayName;
  const nearbyVoiceSummary = activeProximityConversation
    ? proximityAudioStatus === 'live'
      ? `Microphone on with ${pairedName ?? 'your teammate'}.`
      : proximityAudioStatus === 'muted'
        ? `Connected to ${pairedName ?? 'your teammate'}; microphone is off.`
        : `Paired with ${pairedName ?? 'your teammate'}. Turn on your microphone when ready.`
    : latestConversation?.state === 'joining'
      ? 'Pair found. Preparing guarded voice…'
      : proximityOptedIn
        ? 'Looking for a nearby coworker. Your microphone is off.'
        : 'Nearby voice is off. Your microphone will stay off until you turn it on.';
  const self = snapshot.participants.find(
    (participant) => participant.participationId === ready.participationId,
  );
  const sceneParticipants: Participant[] = snapshot.participants.map((participant) => ({
    id: participant.participationId,
    name: participant.displayName,
    color: '#f6c08f',
    avatar: sceneAvatarForAppearance(participant.appearance),
    x: participant.position.x,
    y: participant.position.y,
    facing: participant.facing,
    ...(participant.seatId ? { seatId: participant.seatId } : {}),
    status: participant.availability,
  }));
  const noOverrides: Overrides = {};
  const connectionMessage =
    participantCount === 1 ? '1 person in the office' : `${participantCount} people in the office`;

  return (
    <div className="app-shell office-shell" data-workspace-id={detail.id}>
      <a className="skip-link" href="#office-map">
        Skip to office map
      </a>
      <nav className="rail" aria-label="Office navigation">
        <div className="brand" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="rail-main">
          <button
            className={`nav-item${section === 'office' ? ' current' : ''}`}
            type="button"
            aria-label="Office"
            aria-pressed={section === 'office'}
            title="Office"
            onClick={() => setSection('office')}
          >
            <MapIcon size={22} />
          </button>
          <button
            className={`nav-item${section === 'chat' ? ' current' : ''}`}
            type="button"
            aria-label="Messages"
            aria-pressed={section === 'chat'}
            title="Messages"
            onClick={() => setSection('chat')}
          >
            <MessageCircle size={22} />
          </button>
          <button
            className={`nav-item${section === 'calendar' ? ' current' : ''}`}
            type="button"
            aria-label="Calendar"
            aria-pressed={section === 'calendar'}
            title="Calendar"
            onClick={() => setSection('calendar')}
          >
            <CalendarDays size={22} />
          </button>
          <button
            className={`nav-item${section === 'activity' ? ' current' : ''}`}
            type="button"
            aria-label="Activity"
            aria-pressed={section === 'activity'}
            title="Activity"
            onClick={() => setSection('activity')}
          >
            <Bell size={22} />
          </button>
        </div>
        <div className="rail-bottom">
          {detail.role === 'owner' && (
            <button
              className={`nav-item${section === 'invitations' ? ' current' : ''}`}
              type="button"
              aria-label="Invite people"
              aria-pressed={section === 'invitations'}
              title="Invite people"
              onClick={() => setSection('invitations')}
            >
              <UserPlus size={22} />
            </button>
          )}
          <button
            className="icon-button"
            type="button"
            aria-label="Back to companies"
            title="Back to companies"
            onClick={onBack}
          >
            <ArrowLeft size={19} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Account security"
            title="Account security"
            onClick={onOpenSecurity}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </nav>

      <div className="workspace">
        <aside className="side-panel panel-people office-shell-sidebar" aria-label="Office details">
          <div className="panel-heading">
            <h1 id="company-office-preview-title" ref={titleRef} tabIndex={-1}>
              {detail.name}
            </h1>
          </div>

          {section === 'office' ? (
            <>
              <div className="floor-selector">
                <LayoutGrid size={15} />
                <span>{mapId === 'vivo' ? 'Vivo office' : 'Commons office'}</span>
                <span className="office-preview-badge">Office</span>
              </div>
              <p className="office-sidebar-summary">
                Choose a room on the map and talk with your team.
              </p>
            </>
          ) : section === 'invitations' ? (
            <div className="office-nav-placeholder">
              <strong>Invite people</strong>
              <p>Invite coworkers to {detail.name} and manage pending invitations.</p>
              <button
                className="dashboard-secondary"
                type="button"
                onClick={() => setSection('office')}
              >
                Return to office
              </button>
            </div>
          ) : section === 'chat' ? (
            <div className="chat-sidebar office-chat-sidebar" aria-label="Message conversations">
              <p className="chat-section">
                <span>CHANNELS</span>
              </p>
              <button className="chat-nav-row is-active" type="button" aria-current="page">
                <Hash size={16} />
                <span>{OFFICE_CHANNEL.name}</span>
              </button>
              <p className="office-sidebar-summary">
                One company-wide office channel. Messages are retained for 90 days.
              </p>
            </div>
          ) : (
            <div className="office-nav-placeholder">
              <strong>{section === 'calendar' ? 'Calendar' : 'Activity'}</strong>
              <p>
                {section === 'calendar'
                  ? 'Calendar events are not connected to a company API yet.'
                  : 'Company activity is not connected to an activity feed yet.'}
              </p>
            </div>
          )}

          {section === 'office' && connected && state.snapshot && self ? (
            <div className="office-world-controls" role="group" aria-label="Office controls">
              <div role="group" aria-labelledby="office-availability-title">
                <h3 id="office-availability-title">Your availability</h3>
                <div className="office-world-control-row">
                  {(['available', 'busy', 'away'] as const).map((availability) => (
                    <button
                      key={availability}
                      className="dashboard-secondary"
                      type="button"
                      aria-pressed={self.availability === availability}
                      disabled={officeActionPending || self.availability === availability}
                      onClick={() =>
                        void runOfficeAction(() => client.setAvailability(availability))
                      }
                    >
                      {availability[0]?.toUpperCase()}
                      {availability.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div role="group" aria-labelledby="office-proximity-title">
                <h3 id="office-proximity-title">Nearby voice</h3>
                <p className="office-voice-help">
                  Opt in to pair with an available coworker nearby. Pairing never turns on your
                  microphone by itself.
                </p>
                <div className="office-world-control-row">
                  <button
                    className="dashboard-secondary"
                    type="button"
                    aria-pressed={proximityOptedIn}
                    disabled={proximityPending}
                    onClick={() => void changeProximityOptIn()}
                  >
                    {proximityPending
                      ? 'Updating…'
                      : proximityOptedIn
                        ? 'Opt out of nearby voice'
                        : 'Opt in to nearby voice'}
                  </button>
                  {activeProximityConversation && (
                    <button
                      className="dashboard-secondary"
                      type="button"
                      disabled={proximityPending || officeActionPending}
                      onClick={() => void leaveProximityConversation()}
                    >
                      Leave conversation
                    </button>
                  )}
                </div>
                <p className="office-voice-status" role="status" aria-live="polite">
                  {nearbyVoiceSummary}
                </p>
                {proximityAudioError && (
                  <p className="office-action-error" role="alert">
                    {proximityAudioError}
                  </p>
                )}
              </div>
              {mapId === 'commons' && (
                <div role="group" aria-labelledby="office-seats-title">
                  <h3 id="office-seats-title">Seats</h3>
                  <div className="office-world-control-row">
                    {self.seatId ? (
                      <button
                        className="dashboard-secondary"
                        type="button"
                        disabled={officeActionPending}
                        onClick={() => void runOfficeAction(() => client.stand())}
                      >
                        Stand up
                      </button>
                    ) : (
                      state.snapshot.seats
                        .filter((seat) => seat.occupantParticipationId === null)
                        .map((seat) => (
                          <button
                            className="dashboard-secondary"
                            type="button"
                            key={seat.seatId}
                            disabled={officeActionPending}
                            onClick={() => void runOfficeAction(() => client.sit(seat.seatId))}
                          >
                            Sit · {seat.seatId}
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
              <p className="office-scene-help">
                {mapId === 'vivo'
                  ? 'Use the arrow keys or WASD to move. Click a chair or press E to sit.'
                  : 'Use the arrow keys or WASD to move. Choose an available seat here.'}
              </p>
              {officeActionError && (
                <p className="office-action-error" role="alert">
                  {officeActionError}
                </p>
              )}
            </div>
          ) : section === 'office' ? (
            <p className="empty-small">Enter the office to update your status or use a seat.</p>
          ) : null}

          {section === 'office' && snapshot && snapshot.participants.length > 0 && (
            <section className="office-people-list" aria-label="People in the office">
              <h2>People here</h2>
              <ul>
                {snapshot.participants.map((participant) => (
                  <li key={participant.participationId}>
                    <span>{participant.displayName}</span>
                    <small>{participant.availability}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="sidebar-foot">
            <span className={`connection ${connected ? 'connected' : ''}`}>
              <i />
              {connected
                ? 'Connected'
                : state.status === 'connecting'
                  ? 'Connecting…'
                  : 'Not connected'}
            </span>
            <span>{mapId === 'vivo' ? 'Vivo' : 'Commons'}</span>
          </div>
        </aside>

        <main
          id="office-map"
          className={`map-area office-shell-map${section === 'chat' ? ' is-chat-view' : ''}`}
          tabIndex={-1}
          aria-label={
            section === 'office'
              ? `OpenOfficeForAll ${mapId === 'vivo' ? 'Vivo' : 'Commons'} office map`
              : section === 'chat'
                ? 'Office messages'
                : section === 'invitations'
                  ? 'Invite people'
                  : section === 'calendar'
                    ? 'Office calendar'
                    : 'Office activity'
          }
        >
          <div
            ref={remoteAudioContainer}
            className="office-proximity-audio-output"
            aria-hidden="true"
          />
          {section === 'office' ? (
            <>
              <div className="office-map-heading">
                <strong>
                  {connected
                    ? `Live ${mapId === 'vivo' ? 'Vivo' : 'Commons'} office`
                    : `${mapId === 'vivo' ? 'Vivo' : 'Commons'} office`}
                </strong>
                <span className="office-preview-badge">{connected ? 'Live' : 'Read only'}</span>
              </div>
              <div className="office-map-stage">
                {mapId === 'vivo' ? (
                  <VivoScene
                    participants={sceneParticipants}
                    selfId={connected ? (state.ready?.participationId ?? null) : null}
                    objects={[]}
                    zoom={zoom}
                    simplified={false}
                    editItem={null}
                    selectedObject={null}
                    editorOpen={false}
                    overrides={noOverrides}
                    onMove={() => {}}
                    onMovementIntent={(dx, dy) => client.move(dx, dy)}
                    onPlace={() => {}}
                    onSelect={() => {}}
                    onSelectObject={() => {}}
                    onMoveObject={() => {}}
                    onRemove={() => {}}
                    onSit={(seatId) => void runOfficeAction(() => client.sit(seatId))}
                    onStand={() => void runOfficeAction(() => client.stand())}
                    meetings={{}}
                    areaNames={{}}
                    onZoom={setZoom}
                    onAreaClick={() => {}}
                  />
                ) : connected && state.bootstrap && state.ready && state.snapshot ? (
                  <Suspense fallback={<p role="status">Loading office map…</p>}>
                    <LiveCommonsScene
                      bootstrap={state.bootstrap}
                      snapshot={state.snapshot}
                      localParticipationId={state.ready.participationId}
                      onMovement={(dx, dy) => client.move(dx, dy)}
                    />
                  </Suspense>
                ) : (
                  <Suspense fallback={<p role="status">Loading office map…</p>}>
                    <CommonsScene />
                  </Suspense>
                )}
              </div>
              <div
                className="controlbar office-controlbar"
                role="group"
                aria-label="Office connection controls"
              >
                <span
                  className={`status-dot ${connected ? 'available' : 'away'}`}
                  aria-hidden="true"
                />
                <span className="office-control-status" role="status" aria-live="polite">
                  <span>{connectionMessage}</span>
                  <small>
                    {connected
                      ? 'Use arrow keys or WASD to move.'
                      : 'Enter the office to move and interact.'}
                  </small>
                </span>
                <span className="control-separator" />
                {connected ? (
                  <>
                    <button
                      className={`media-control ${proximityAudioStatus === 'live' ? 'enabled' : 'muted'}`}
                      type="button"
                      aria-label={
                        proximityAudioStatus === 'live'
                          ? 'Mute proximity microphone'
                          : proximityAudioStatus === 'muted'
                            ? 'Unmute proximity microphone'
                            : 'Activate proximity microphone'
                      }
                      title={
                        activeProximityConversation && proximityOptedIn
                          ? proximityAudioStatus === 'live'
                            ? 'Mute microphone'
                            : proximityAudioStatus === 'muted'
                              ? 'Unmute microphone'
                              : 'Activate microphone'
                          : 'Opt in and wait for a nearby pair to use voice'
                      }
                      aria-pressed={proximityAudioStatus === 'live'}
                      disabled={
                        !proximityOptedIn ||
                        !activeProximityConversation ||
                        proximityPending ||
                        proximityAudioStatus === 'connecting' ||
                        proximityAudioStatus === 'reconnecting'
                      }
                      onClick={toggleProximityMicrophone}
                    >
                      {proximityAudioStatus === 'live' ? <Mic size={19} /> : <MicOff size={19} />}
                    </button>
                    <button
                      className="icon-button leave-meeting"
                      type="button"
                      aria-label="Leave office"
                      title="Leave office"
                      onClick={() =>
                        void proximityAudio.current?.stop().finally(() => client.close())
                      }
                    >
                      <ArrowLeft size={19} />
                    </button>
                  </>
                ) : (
                  <button
                    className="primary enter-button"
                    type="button"
                    disabled={state.status === 'connecting'}
                    onClick={() => void client.connect()}
                  >
                    {state.status === 'connecting' ? 'Connecting…' : 'Enter office'}
                  </button>
                )}
              </div>
            </>
          ) : section === 'invitations' && detail.role === 'owner' ? (
            <div className="dashboard office-invitations">
              <CompanyInvitationManager
                api={api}
                company={detail}
                mutationPending={mutationPending}
                runMutation={runMutation}
                onUnauthorized={onUnauthorized}
              />
            </div>
          ) : section === 'chat' ? (
            <>
              <ChatView
                conversation={{ kind: 'channel', id: OFFICE_CHANNEL.id }}
                channels={[OFFICE_CHANNEL]}
                users={chatUsers}
                participants={[]}
                selfUserId={account.id}
                messages={chatViewMessages}
                online={chatAvailable}
                draft={chatDraft}
                onDraft={setChatDraft}
                onSend={sendChatMessage}
                onTopic={() => {}}
                englishOnly
                topicEditable={false}
                showChannelTools={false}
                statusMessage={
                  chatLoading
                    ? 'Loading recent office messages…'
                    : chatError || (chatAvailable ? '' : 'Office messages are unavailable.')
                }
              />
            </>
          ) : (
            <section className="office-section-placeholder" aria-live="polite">
              <span className="office-placeholder-icon" aria-hidden="true">
                {section === 'calendar' ? <CalendarDays size={24} /> : <Bell size={24} />}
              </span>
              <h2>{section === 'calendar' ? 'Calendar' : 'Activity'}</h2>
              <p>
                {section === 'calendar'
                  ? 'Calendar events are not available until the company calendar API is connected.'
                  : 'Activity notifications are not available until the company activity API is connected.'}
              </p>
              <button
                className="dashboard-secondary"
                type="button"
                onClick={() => setSection('office')}
              >
                Return to office
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
