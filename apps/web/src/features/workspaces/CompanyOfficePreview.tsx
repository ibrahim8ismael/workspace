import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Hand,
  Bell,
  CalendarDays,
  X,
  LayoutGrid,
  Map as MapIcon,
  Mic,
  MicOff,
  MessageCircle,
  Settings2,
  UserPlus,
  Volume2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { AccountDto } from '@gather/contracts';
import type { OfficeWorkspaceDetail } from '../../lib/api';
import { ApiClient, ApiError } from '../../lib/api';
import { DEFAULT_LOOK } from '../../../avatarLook';
import VivoScene from '../../../VivoScene';
import type { Overrides } from '../../../../shared/office-objects.js';
import { SpaceChatNavigation, SpaceChatView } from './space-chat';
import { useSpaceChat } from './use-space-chat';
import type { Participant } from '../../../types';
import { EntryMicrophone } from '../office/entry-microphone';
import { MicrophonePermission } from '../office/microphone-permission';
import { AppLink } from '../../routing/AppLink';
import { companySettingsPath, officePath, type OfficePage } from '../../routing/routes';
import { OfficeClient } from '../office/office-client';
import { OfficeReconnectSupervisor } from '../office/office-reconnect-supervisor';
import {
  latestMeetingConversation,
  latestProximityConversation,
} from '../office/proximity-conversation';
import {
  ProximityAudioSession,
  type ProximityAudioStatus,
} from '../office/proximity-audio-session';
import { RemoteAudioPlayback } from '../office/remote-audio-playback';
import { effectsVolume } from '../../../footsteps';
import { notifyReceivedWaves, WaveNotificationSound } from '../office/wave-notification';
import { CompanyInvitationManager } from './CompanyInvitationManager';
import { WorkspacePeopleDirectory } from './WorkspacePeopleDirectory';
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
const proximityVoiceEnabled = import.meta.env.VITE_PROXIMITY_VOICE_ENABLED !== 'false';
function sceneAvatarForAppearance(appearance: { bodyId: string; paletteId: string }) {
  if (appearance.bodyId === 'commons-worker' && appearance.paletteId === 'teal')
    return DEFAULT_LOOK;
  return undefined;
}

type Props = {
  routePage?: OfficePage;
  onNavigatePage?: (page: OfficePage, replace?: boolean) => void;
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
  routePage,
  onNavigatePage,
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
  const onUnauthorizedRef = useRef(onUnauthorized);
  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);
  const client = useMemo(
    () => new OfficeClient(api, detail.id, detail.officeId),
    [api, detail.id, detail.officeId],
  );
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const reconnectSupervisor = useMemo(() => new OfficeReconnectSupervisor(client), [client]);
  useEffect(() => {
    reconnectSupervisor.start();
    return () => reconnectSupervisor.stop();
  }, [reconnectSupervisor]);
  const reconnectState = useSyncExternalStore(
    reconnectSupervisor.subscribe,
    reconnectSupervisor.getSnapshot,
    reconnectSupervisor.getSnapshot,
  );
  const [waveSound] = useState(() => new WaveNotificationSound());
  const seenWaveNotifications = useRef(new Set<string>());
  const connected = state.status === 'connected';
  const [entryMicrophone] = useState(() => new EntryMicrophone());
  const [microphonePermission] = useState(() => new MicrophonePermission());
  const permissionState = useSyncExternalStore(
    microphonePermission.subscribe,
    microphonePermission.getSnapshot,
    microphonePermission.getSnapshot,
  );
  const [permissionWaitLong, setPermissionWaitLong] = useState(false);
  const entryAudio = useSyncExternalStore(
    entryMicrophone.subscribe,
    entryMicrophone.getSnapshot,
    entryMicrophone.getSnapshot,
  );
  const joinWithMicrophone = useRef(false);
  useEffect(
    () => () => {
      entryMicrophone.stop();
      microphonePermission.cancel();
    },
    [entryMicrophone, microphonePermission],
  );

  const participationId = connected ? (state.ready?.participationId ?? null) : null;
  useEffect(() => {
    if (!participationId) waveSound.stop();
    notifyReceivedWaves(state.waves, participationId, seenWaveNotifications.current, () => {
      waveSound.play(effectsVolume(), effectsVolume);
    });
  }, [state.waves, participationId, waveSound]);
  useEffect(() => () => waveSound.stop(), [waveSound]);
  const latestConversation = latestProximityConversation(
    state.conversationUpdates,
    participationId,
  );
  const activeProximityConversation =
    latestConversation?.state === 'active' && latestConversation.mediaReady
      ? latestConversation
      : null;
  const latestMeeting = latestMeetingConversation(state.conversationUpdates, participationId);
  const activeMeetingConversation =
    latestMeeting?.state === 'active' && latestMeeting.mediaReady ? latestMeeting : null;
  const voiceMembership = latestMeeting ?? latestConversation;
  const voiceMembershipKey = voiceMembership
    ? `${voiceMembership.kind}:${voiceMembership.conversationId}:${participationId}`
    : null;
  const activeVoiceConversation = activeMeetingConversation ?? activeProximityConversation;
  const activeVoiceContextKey = activeVoiceConversation
    ? `${activeVoiceConversation.kind}:${activeVoiceConversation.conversationId}:${activeVoiceConversation.version}:${activeVoiceConversation.generation}:${participationId}`
    : null;
  const [officeActionError, setOfficeActionError] = useState('');
  const [officeActionPending, setOfficeActionPending] = useState(false);
  const [wavePending, setWavePending] = useState(false);
  const [meetingActionPending, setMeetingActionPending] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedOfflineMemberId, setSelectedOfflineMemberId] = useState<string | null>(null);
  const [memberActionMessage, setMemberActionMessage] = useState('');
  const [navigationTarget, setNavigationTarget] = useState<
    | {
        x: number;
        y: number;
        nonce: number;
        participantId: string;
      }
    | undefined
  >();
  const navigationNonce = useRef(0);
  const selectionTrigger = useRef<HTMLElement | SVGElement | null>(null);
  const memberCardRef = useRef<HTMLElement | null>(null);
  const officeMapRef = useRef<HTMLElement | null>(null);
  const closeMemberCard = useCallback((restoreFocus = true) => {
    setSelectedMemberId(null);
    setSelectedOfflineMemberId(null);
    setMemberActionMessage('');
    setNavigationTarget(undefined);
    if (restoreFocus) requestAnimationFrame(() => selectionTrigger.current?.focus());
  }, []);

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedMemberId) closeMemberCard();
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [selectedMemberId, closeMemberCard]);
  const [proximityOptIn, setProximityOptIn] = useState<{
    participationId: string;
    enabled: true;
  } | null>(null);
  const [proximityPending, setProximityPending] = useState(false);
  const [proximityAudioStatus, setProximityAudioStatus] = useState<ProximityAudioStatus>('off');
  const [proximityAudioError, setProximityAudioError] = useState('');
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const [audioPlayback] = useState(() => new RemoteAudioPlayback(setAudioPlaybackBlocked));
  const [microphoneIntent, setMicrophoneIntent] = useState<string | null>(null);
  const remoteAudioContainer = useRef<HTMLDivElement>(null);
  const mediaContextKey = useRef<string | null>(null);
  const [voiceActivity, setVoiceActivity] = useState<{
    contextKey: string | null;
    ids: readonly string[];
  }>({ contextKey: null, ids: [] });
  const speakingIds = useMemo(() => {
    if (
      !activeVoiceContextKey ||
      voiceActivity.contextKey !== activeVoiceContextKey ||
      (proximityAudioStatus !== 'live' && proximityAudioStatus !== 'muted')
    )
      return [];
    const members = new Set(
      activeVoiceConversation?.participants.map((member) => member.participationId),
    );
    return voiceActivity.ids.filter(
      (id) => members.has(id) && (id !== participationId || proximityAudioStatus === 'live'),
    );
  }, [
    activeVoiceContextKey,
    activeVoiceConversation,
    participationId,
    proximityAudioStatus,
    voiceActivity,
  ]);
  const microphoneMembershipKey = useRef(voiceMembershipKey);
  const audioParticipation = useRef(participationId);
  const proximityAudio = useRef<ProximityAudioSession | null>(null);
  const [proximityAudioStage, setProximityAudioStage] = useState('authorizing');
  const proximityOptedIn = Boolean(
    connected && proximityOptIn?.participationId === participationId && proximityOptIn.enabled,
  );
  const [zoom, setZoom] = useState(1.35);
  const [localSection, setLocalSection] = useState<OfficeSection>('office');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [memberRefresh, setMemberRefresh] = useState(0);
  const memberDirectoryKey = `${detail.id}:${memberRefresh}`;
  const [memberDirectory, setMemberDirectory] = useState<{
    key: string;
    members: Awaited<ReturnType<ApiClient['workspaceMembers']>>;
    loading: boolean;
    error: string;
  }>({ key: `${detail.id}:0`, members: [], loading: true, error: '' });
  const memberDirectoryCurrent = memberDirectory.key === memberDirectoryKey;
  const workspaceMembers = memberDirectoryCurrent ? memberDirectory.members : [];
  const workspaceMembersLoading = !memberDirectoryCurrent || memberDirectory.loading;
  const workspaceMembersError = memberDirectoryCurrent ? memberDirectory.error : '';
  const section = routePage && routePage !== 'entry' ? routePage : localSection;
  const selectedMember = connected
    ? selectedMemberId
      ? (state.snapshot?.participants.find(
          (participant) => participant.participationId === selectedMemberId,
        ) ?? null)
      : selectedOfflineMemberId
        ? (state.snapshot?.participants.find(
            (participant) => participant.userId === selectedOfflineMemberId,
          ) ?? null)
        : null
    : null;
  const selectedOfflineMember =
    selectedOfflineMemberId && !selectedMember
      ? (workspaceMembers.find((member) => member.userId === selectedOfflineMemberId) ?? null)
      : null;
  const selectedDirectoryUserId =
    selectedMember?.userId ?? selectedOfflineMember?.userId ?? selectedOfflineMemberId ?? null;
  useEffect(() => {
    if (selectedMemberId || selectedOfflineMemberId)
      memberCardRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [selectedMemberId, selectedOfflineMemberId]);
  const selectOnlineMember = useCallback(
    (
      entry: { member: { userId: string }; participant: { participationId: string } },
      trigger: HTMLButtonElement,
    ) => {
      selectionTrigger.current = trigger;
      setSelectedOfflineMemberId(null);
      setSelectedMemberId(entry.participant.participationId);
      setMemberActionMessage('');
    },
    [],
  );
  const selectOfflineMember = useCallback(
    (member: { userId: string }, trigger: HTMLButtonElement) => {
      selectionTrigger.current = trigger;
      setSelectedMemberId(null);
      setSelectedOfflineMemberId(member.userId);
      setMemberActionMessage('');
    },
    [],
  );
  const retryMemberDirectory = useCallback(() => setMemberRefresh((n) => n + 1), []);
  const meetingParticipationIds = useMemo(
    () => new Set((state.meetingZones?.zones ?? []).flatMap((zone) => zone.admittedMembers)),
    [state.meetingZones],
  );
  const setSection = (next: OfficeSection) => {
    if (next !== 'office') closeMemberCard(false);
    if (onNavigatePage) onNavigatePage(next);
    else setLocalSection(next);
  };
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    void api.workspaceMembers(detail.id, controller.signal).then(
      (members) => {
        if (current)
          setMemberDirectory({ key: memberDirectoryKey, members, loading: false, error: '' });
      },
      (caught: unknown) => {
        if (!current || controller.signal.aborted) return;
        if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403))
          onUnauthorizedRef.current('Your access to this space changed.');
        setMemberDirectory({
          key: memberDirectoryKey,
          members: [],
          loading: false,
          error:
            caught instanceof ApiError && (caught.status === 401 || caught.status === 403)
              ? ''
              : 'Could not load the member directory.',
        });
      },
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [api, detail.id, memberDirectoryKey]);
  const joiningFromEntry = useRef(false);
  const previousPage = useRef(routePage);
  useEffect(() => {
    if (routePage === 'entry' && previousPage.current !== 'entry') {
      joiningFromEntry.current = false;
      entryMicrophone.stop();
      microphonePermission.cancel();
      setMicrophoneIntent(null);
      void proximityAudio.current?.stop();
      client.close();
    } else if (
      routePage &&
      routePage !== 'entry' &&
      !['connected', 'connecting'].includes(client.getSnapshot().status)
    ) {
      void client.connect();
    }
    previousPage.current = routePage;
  }, [routePage, client, entryMicrophone, microphonePermission]);
  useEffect(() => {
    if (connected && joiningFromEntry.current) {
      joiningFromEntry.current = false;
      onNavigatePage?.('office');
    }
  }, [connected, onNavigatePage]);
  const chat = useSpaceChat(
    api,
    detail.id,
    detail.officeId,
    account.id,
    state.spaceChatEvents,
    connected,
    onUnauthorized,
  );

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
        if (status === 'error') microphonePermission.cancel();
        if (status === 'muted' && error) setMicrophoneIntent(null);
      },
      (track, identity) => audioPlayback.attach(track, identity, remoteAudioContainer.current),
      undefined,
      (identities) => {
        if (!active) return;
        const contextKey = mediaContextKey.current;
        const ids = [...identities].sort();
        setVoiceActivity((previous) =>
          previous.contextKey === contextKey &&
          previous.ids.length === ids.length &&
          previous.ids.every((id, index) => id === ids[index])
            ? previous
            : { contextKey, ids },
        );
      },
      (stage) => {
        setProximityAudioStage(stage);
        if (stage === 'capturing') setPermissionWaitLong(false);
      },
    );
    proximityAudio.current = session;
    return () => {
      active = false;
      void session.stop();
      proximityAudio.current = null;
    };
  }, [audioPlayback, microphonePermission]);

  useLayoutEffect(() => {
    mediaContextKey.current = activeVoiceContextKey;
    return () => {
      mediaContextKey.current = null;
      // Cut reception synchronously; the membership effect below decides whether microphone
      // intent belongs to the new conversation.
      void proximityAudio.current?.stop(true);
    };
  }, [activeVoiceContextKey, voiceMembershipKey]);

  useEffect(() => {
    if (!participationId) {
      microphonePermission.cancel();
      return;
    }
    if (audioParticipation.current !== participationId) {
      audioParticipation.current = participationId;
      setMicrophoneIntent(null);
      microphoneMembershipKey.current = null;
      microphonePermission.cancel();
      proximityAudio.current?.clearMicrophoneIntent();
      void proximityAudio.current?.stop();
    }
  }, [participationId, microphonePermission]);

  useEffect(() => {
    const waitingForCapture =
      permissionState.status === 'requesting' ||
      (proximityAudioStatus === 'connecting' && proximityAudioStage === 'capturing');
    if (!waitingForCapture) return;
    const timer = window.setTimeout(() => setPermissionWaitLong(true), 5000);
    return () => window.clearTimeout(timer);
  }, [permissionState.status, proximityAudioStatus, proximityAudioStage]);

  useEffect(() => {
    const previousKey = microphoneMembershipKey.current;
    if (previousKey === voiceMembershipKey) return;
    microphoneMembershipKey.current = voiceMembershipKey;
    // Keep a user-authorized microphone intent made before the first group forms. A later
    // conversation replacement or forced leave must clear it; generation rotations keep the key.
    if (previousKey) {
      setMicrophoneIntent(null);
      proximityAudio.current?.clearMicrophoneIntent();
    }
  }, [voiceMembershipKey]);

  useEffect(() => {
    const conversation = activeVoiceConversation;
    if (!participationId || !conversation || !activeVoiceContextKey) return;
    if (conversation.kind === 'proximity' && !proximityOptedIn) return;
    const contextKey = activeVoiceContextKey;
    if (microphoneIntent === participationId && permissionState.status === 'granted')
      void proximityAudio.current?.setMicrophoneEnabled(true);
    void proximityAudio.current?.start(
      (signal) =>
        api.proximityMediaToken(
          conversation.conversationId,
          {
            participationId,
            conversationVersion: conversation.version,
          },
          signal,
        ),
      () => mediaContextKey.current === contextKey,
      conversation.version,
      conversation.generation,
    );
  }, [
    api,
    participationId,
    microphoneIntent,
    proximityOptedIn,
    activeVoiceConversation,
    activeVoiceContextKey,
    permissionState.status,
  ]);

  useEffect(() => {
    if (!participationId || !joinWithMicrophone.current) return;
    joinWithMicrophone.current = false;
    let current = true;
    setProximityPending(true);
    void client
      .setProximityOptIn(true)
      .then(() => {
        if (!current) return;
        microphonePermission.markGranted();
        setProximityOptIn({ participationId, enabled: true });
        setMicrophoneIntent(participationId);
      })
      .catch(() => {
        if (current)
          setProximityAudioError(
            'Could not enable nearby voice. Use the microphone button to retry.',
          );
      })
      .finally(() => {
        if (current) setProximityPending(false);
      });
    return () => {
      current = false;
    };
  }, [client, participationId, microphonePermission]);
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
    if (!enabled) {
      microphonePermission.cancel();
      setMicrophoneIntent(null);
      await proximityAudio.current?.stop();
    }
    try {
      await client.setProximityOptIn(enabled);
      setProximityOptIn(enabled ? { participationId, enabled: true } : null);
    } catch (error) {
      setProximityAudioError(
        error instanceof Error && error.message === 'participation_conflict'
          ? 'Leave the meeting before changing nearby voice.'
          : 'Could not update nearby voice. Check your connection and retry.',
      );
    } finally {
      setProximityPending(false);
    }
  }

  async function leaveProximityConversation() {
    microphonePermission.cancel();
    setMicrophoneIntent(null);
    if (!activeProximityConversation) return;
    await proximityAudio.current?.stop();
    await runOfficeAction(() =>
      client.leaveConversation(
        activeProximityConversation.conversationId,
        activeProximityConversation.version,
      ),
    );
  }

  async function leaveMeetingConversation() {
    setMicrophoneIntent(null);
    if (!activeMeetingConversation) return;
    await proximityAudio.current?.stop();
    await runOfficeAction(() =>
      client.leaveMeeting(
        activeMeetingConversation.conversationId,
        activeMeetingConversation.version,
      ),
    );
  }

  async function joinMeeting(zoneId: string) {
    setOfficeActionError('');
    setOfficeActionPending(true);
    try {
      await client.joinMeeting(zoneId);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setOfficeActionError(
        code === 'room_full'
          ? 'This meeting room is full.'
          : code === 'zone_unavailable'
            ? 'Move fully inside the meeting room and try again.'
            : code === 'participation_conflict'
              ? 'Leave your current voice conversation before joining this meeting.'
              : 'Could not join the meeting. Check your connection and try again.',
      );
    } finally {
      setOfficeActionPending(false);
    }
  }

  function toggleConversationMicrophone() {
    const session = proximityAudio.current;
    if (!session || !participationId) return;
    if (permissionState.status === 'requesting') {
      microphonePermission.cancel();
      setPermissionWaitLong(false);
      setMicrophoneIntent(null);
      void session.stop();
      return;
    }
    if (proximityAudioStatus === 'live') {
      setMicrophoneIntent(null);
      void session.setMicrophoneEnabled(false);
      return;
    }
    if (proximityAudioStatus === 'muted' && permissionState.status === 'granted') {
      setMicrophoneIntent(participationId);
      void session.setMicrophoneEnabled(true);
      return;
    }
    if (microphoneIntent === participationId && proximityAudioStatus !== 'error') {
      microphonePermission.cancel();
      setPermissionWaitLong(false);
      setMicrophoneIntent(null);
      void session.setMicrophoneEnabled(false);
      if (!activeVoiceConversation && proximityOptedIn) void changeProximityOptIn();
      return;
    }
    setPermissionWaitLong(false);
    setProximityAudioError('');
    void microphonePermission.request().then((granted) => {
      const current = client.getSnapshot();
      if (
        !granted ||
        current.status !== 'connected' ||
        current.ready?.participationId !== participationId
      )
        return;
      setPermissionWaitLong(false);
      setMicrophoneIntent(participationId);
      if (!proximityOptedIn && !activeMeetingConversation) void changeProximityOptIn();
    });
  }

  const keepOfficeShell = Boolean(
    !connected &&
    state.status !== 'idle' &&
    state.status !== 'ended' &&
    routePage !== 'entry' &&
    state.bootstrap &&
    state.ready &&
    state.snapshot,
  );
  const displayBootstrap = state.bootstrap;
  const displayReady = state.ready;
  const displaySnapshot = state.snapshot;

  if (!connected && !keepOfficeShell) {
    return (
      <main className="office-prejoin" data-workspace-id={detail.id}>
        <a className="skip-link" href="#join-office-form">
          Skip to office entry
        </a>
        <header className="office-prejoin-header">
          <AppLink
            to="/companies"
            className="office-prejoin-brand"
            aria-label="Back to companies"
            onNavigate={onBack}
          >
            <span className="office-prejoin-logo" aria-hidden="true">
              <LayoutGrid size={19} />
            </span>
            <strong>{detail.name}</strong>
          </AppLink>
          <div className="office-prejoin-account" title={account.email}>
            <span aria-hidden="true">{account.displayName.slice(0, 1).toUpperCase()}</span>
            <span>{account.email}</span>
          </div>
        </header>

        <section className="office-prejoin-content" aria-label="Join the office">
          <div className="office-prejoin-form-wrap">
            <h1 id="company-office-preview-title" ref={titleRef} tabIndex={-1}>
              Welcome to {detail.name}
            </h1>
            <p className="office-prejoin-summary">
              {detail.memberCount} company {detail.memberCount === 1 ? 'member' : 'members'} ·{' '}
              {detail.role === 'owner' ? 'Owner' : 'Member'}
            </p>
            <form
              id="join-office-form"
              className="office-prejoin-form"
              onSubmit={(event) => {
                event.preventDefault();
                joiningFromEntry.current = true;
                joinWithMicrophone.current = entryMicrophone.getSnapshot().status === 'on';
                entryMicrophone.stop();
                void client.connect();
              }}
            >
              <label htmlFor="office-display-name">Joining as</label>
              <input
                id="office-display-name"
                type="text"
                value={account.displayName}
                readOnly
                aria-label="Display name"
                aria-readonly="true"
                autoComplete="name"
              />
              <div className="office-entry-audio">
                <button
                  type="button"
                  className="office-entry-microphone"
                  aria-pressed={entryAudio.status === 'on'}
                  aria-label={
                    entryAudio.status === 'on'
                      ? 'Turn microphone off'
                      : entryAudio.status === 'requesting'
                        ? 'Cancel microphone access'
                        : 'Turn microphone on'
                  }
                  disabled={state.status === 'connecting' || !proximityVoiceEnabled}
                  onClick={() => void entryMicrophone.toggle()}
                >
                  {entryAudio.status === 'on' ? <Mic size={20} /> : <MicOff size={20} />}
                  {entryAudio.status === 'on'
                    ? 'Microphone on'
                    : entryAudio.status === 'requesting'
                      ? 'Requesting access…'
                      : 'Microphone off'}
                </button>
                <p role="status" aria-live="polite">
                  {!proximityVoiceEnabled
                    ? 'Nearby voice is unavailable in this deployment.'
                    : entryAudio.status === 'on'
                      ? 'Ready for nearby voice. No audio is sent until you join a conversation.'
                      : 'You can join with your microphone off and turn it on inside the office.'}
                </p>
                {entryAudio.message && (
                  <p role="alert" className="office-prejoin-error">
                    {entryAudio.message}
                  </p>
                )}
              </div>
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
              <button
                className="primary"
                type="submit"
                disabled={state.status === 'connecting' || entryAudio.status === 'requesting'}
              >
                {state.status === 'connecting' ? 'Joining…' : 'Join'}
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  if (
    !displayBootstrap ||
    !displayReady ||
    !displaySnapshot ||
    displaySnapshot.participants.some(
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
            <AppLink to="/companies" className="primary" onNavigate={onBack}>
              Back to companies
            </AppLink>
          </div>
        </section>
      </main>
    );
  }

  const bootstrap = displayBootstrap;
  const ready = displayReady;
  const snapshot = displaySnapshot;
  const mapId = bootstrap.manifest.mapId;
  const mapName = mapId === 'vivo' ? 'Vivo' : mapId === 'workspace' ? 'Workspace' : 'Commons';
  const participantCount = snapshot.participants.length;
  const conversationMembers = activeProximityConversation?.participants ?? [];
  const conversationMemberNames = conversationMembers.map((participant) =>
    participant.participationId === ready.participationId
      ? `${participant.displayName} (you)`
      : participant.displayName,
  );
  const conversationPartnerNames = conversationMembers
    .filter((participant) => participant.participationId !== ready.participationId)
    .map((participant) => participant.displayName);
  const conversationPartners = conversationPartnerNames.join(', ');
  const nearbyVoiceSummary = !proximityVoiceEnabled
    ? 'Nearby voice is unavailable in this deployment.'
    : activeProximityConversation
      ? proximityAudioStatus === 'live'
        ? `Microphone on in a ${conversationMembers.length}-person conversation with ${conversationPartners}.`
        : proximityAudioStatus === 'muted'
          ? `Connected to ${conversationMembers.length}-person conversation with ${conversationPartners}; microphone is off.`
          : `In a ${conversationMembers.length}-person conversation with ${conversationPartners}. Turn on your microphone when ready.`
      : latestConversation?.state === 'joining'
        ? 'Nearby group found. Preparing guarded voice…'
        : proximityOptedIn
          ? 'Looking for a nearby coworker. Your microphone is off.'
          : 'Nearby voice is off. Your microphone will stay off until you turn it on.';
  const microphoneEnabled =
    proximityVoiceEnabled &&
    (proximityAudioStatus === 'live' ||
      (microphoneIntent === participationId &&
        (proximityOptedIn || activeVoiceConversation?.kind === 'meeting') &&
        proximityAudioStatus !== 'error' &&
        proximityAudioStatus !== 'muted'));
  const microphoneHelp = !proximityVoiceEnabled
    ? 'Nearby voice is unavailable in this deployment.'
    : permissionState.status === 'requesting'
      ? permissionWaitLong
        ? 'Waiting for browser microphone access. Allow the request in the browser, or cancel and check site permissions in browser and device settings.'
        : 'Waiting for browser microphone access…'
      : permissionState.status === 'error'
        ? permissionState.message
        : proximityAudioError
          ? proximityAudioError
          : proximityAudioStatus === 'connecting'
            ? proximityAudioStage === 'authorizing'
              ? 'Authorizing voice…'
              : proximityAudioStage === 'loading'
                ? 'Loading voice connection…'
                : proximityAudioStage === 'capturing'
                  ? permissionWaitLong
                    ? 'Waiting for microphone access or device setup. Allow any browser request, or cancel and check site permissions and connected devices.'
                    : 'Preparing microphone…'
                  : proximityAudioStage === 'connecting'
                    ? 'Connecting to coworker…'
                    : 'Starting microphone…'
            : proximityAudioStatus === 'error'
              ? proximityAudioError
              : proximityAudioStatus === 'reconnecting'
                ? 'Reconnecting voice…'
                : proximityAudioStatus === 'live'
                  ? 'Your microphone is on.'
                  : proximityAudioStatus === 'muted'
                    ? activeVoiceConversation
                      ? 'Connected and listening. Your microphone is off; click to unmute.'
                      : 'Your microphone is muted. Click to unmute.'
                    : activeProximityConversation
                      ? 'Ready to talk. Click the microphone and allow browser access.'
                      : proximityOptedIn
                        ? 'Voice enabled; waiting for a nearby coworker. Your permission check is complete and no microphone audio is being captured.'
                        : 'Turn on your microphone to enable nearby voice. Coworkers must enable voice and move nearby.';
  const self = snapshot.participants.find(
    (participant) => participant.participationId === ready.participationId,
  );
  const currentMeetingZone =
    state.meetingZones?.zones.find((zone) => zone.occupancy.includes(ready.participationId)) ??
    null;
  const sceneMeetings = Object.fromEntries(
    (state.meetingZones?.zones ?? [])
      .filter((zone) => zone.zoneId.startsWith('vivo-'))
      .map((zone) => [
        zone.zoneId.slice('vivo-'.length),
        {
          active: zone.occupancy.length > 0,
          locked: false,
          participants: zone.admittedMembers.length,
        },
      ]),
  );
  const meetingMembers = activeMeetingConversation?.participants ?? [];
  const meetingMemberNames = meetingMembers.map((participant) =>
    participant.participationId === ready.participationId
      ? `${participant.displayName} (you)`
      : participant.displayName,
  );
  const sceneParticipants: Participant[] = snapshot.participants.map((participant) => ({
    id: participant.participationId,
    speaking: speakingIds.includes(participant.participationId),
    name: participant.displayName,
    color: '#f6c08f',
    avatar: sceneAvatarForAppearance(participant.appearance),
    x: participant.position.x,
    y: participant.position.y,
    facing: participant.facing,
    ...(participant.seatId ? { seatId: participant.seatId } : {}),
    status: participant.availability,
  }));
  const canNavigateOffice = mapId === 'vivo' || Boolean(bootstrap.layout);
  const selectedMemberIsLive = Boolean(selectedMember && selectedMember.availability !== 'away');
  const goToDisabledReason = !connected
    ? 'Join the office to use Go to.'
    : !selectedMemberIsLive
      ? 'Go to is available when this member is online.'
      : !canNavigateOffice
        ? 'Go to is unavailable on this floor plan.'
        : !self || self.availability === 'away'
          ? 'Change your status to online to use Go to.'
          : self.seatId
            ? 'Stand up before using Go to.'
            : '';
  const navigateToSelection =
    selectedMember && navigationTarget?.participantId === selectedMember.participationId
      ? navigationTarget
      : undefined;
  function selectMapMember(id: string, trigger?: HTMLElement | SVGElement | null) {
    if (id === ready.participationId) return;
    if (!snapshot.participants.some((participant) => participant.participationId === id)) return;
    selectionTrigger.current = trigger ?? null;
    setSelectedOfflineMemberId(null);
    setSelectedMemberId(id);
    setMemberActionMessage('');
  }
  function recordNavigationResult(
    id: string,
    result: 'moving' | 'nearby' | 'stopped' | 'unavailable',
  ) {
    if (id !== selectedMemberId) return;
    setMemberActionMessage(
      result === 'moving'
        ? `Moving toward ${selectedMember?.displayName ?? 'member'}…`
        : result === 'nearby'
          ? 'Destination reached.'
          : result === 'stopped'
            ? 'Movement stopped.'
            : 'Go to is unavailable right now.',
    );
  }
  const noOverrides: Overrides = {};
  const connectionMessage = connected
    ? participantCount === 1
      ? '1 person in the office'
      : `${participantCount} people in the office`
    : 'Reconnecting to the office';
  const waveNotice = state.waves
    .filter((wave) => wave.recipientParticipationId === ready.participationId)
    .at(-1);
  const recipientMeetingNotice = state.meetingInvitations
    .filter((invitation) => invitation.recipientParticipationId === participationId)
    .at(-1);
  const senderMeetingNotice = state.meetingInvitations
    .filter((invitation) => invitation.senderParticipationId === participationId)
    .at(-1);

  return (
    <div
      className={`app-shell office-shell${sidebarOpen ? '' : ' is-sidebar-collapsed'}`}
      data-workspace-id={detail.id}
    >
      <a className="skip-link" href="#office-map">
        Skip to office map
      </a>
      {waveNotice && (
        <div
          key={waveNotice.eventId}
          data-wave-id={waveNotice.eventId}
          className="office-wave-toast"
          role="status"
          aria-live="polite"
        >
          {waveNotice.senderName} waved to you.
        </div>
      )}
      {recipientMeetingNotice && (
        <div className="office-wave-toast" role="status" aria-live="polite">
          {recipientMeetingNotice.status === 'pending'
            ? `${recipientMeetingNotice.senderDisplayName} invited you to ${recipientMeetingNotice.zoneLabel}.`
            : recipientMeetingNotice.status === 'arriving'
              ? `Walking to ${recipientMeetingNotice.zoneLabel}…`
              : recipientMeetingNotice.status === 'joined'
                ? `You arrived at ${recipientMeetingNotice.zoneLabel}.`
                : recipientMeetingNotice.reason === 'obstructed'
                  ? 'The meeting route was interrupted.'
                  : recipientMeetingNotice.reason === 'destination_full'
                    ? 'The meeting room is full.'
                    : recipientMeetingNotice.reason === 'destination_unavailable'
                      ? 'The meeting room is unavailable.'
                      : recipientMeetingNotice.status === 'expired'
                        ? 'The meeting invitation expired.'
                        : recipientMeetingNotice.status === 'declined'
                          ? 'The meeting invitation was declined.'
                          : 'The meeting invitation ended.'}
          {recipientMeetingNotice.status === 'pending' && (
            <span className="meeting-invitation-actions">
              <button
                type="button"
                onClick={() =>
                  void runOfficeAction(() =>
                    client.respondToMeetingInvitation(
                      recipientMeetingNotice.invitationId,
                      'accept',
                    ),
                  )
                }
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() =>
                  void runOfficeAction(() =>
                    client.respondToMeetingInvitation(
                      recipientMeetingNotice.invitationId,
                      'decline',
                    ),
                  )
                }
              >
                Decline
              </button>
            </span>
          )}
        </div>
      )}
      <nav className="rail" aria-label="Office navigation">
        <div className="brand" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="rail-main">
          <button
            type="button"
            className="sidebar-toggle-rail"
            aria-label={sidebarOpen ? 'Close member sidebar' : 'Open member sidebar'}
            aria-expanded={sidebarOpen}
            aria-controls="office-member-sidebar"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? (
              <PanelLeftClose size={20} aria-hidden="true" />
            ) : (
              <PanelLeftOpen size={20} aria-hidden="true" />
            )}
          </button>
          <AppLink
            to={officePath(detail.id, detail.officeId, 'office')}
            className={`nav-item${section === 'office' ? ' current' : ''}`}

            aria-label="Office"
            aria-current={section === 'office' ? 'page' : undefined}
            title="Office"
            onNavigate={() => setSection('office')}
          >
            <MapIcon size={22} />
          </AppLink>
          <AppLink
            to={officePath(detail.id, detail.officeId, 'chat')}
            className={`nav-item${section === 'chat' ? ' current' : ''}`}

            aria-label="Messages"
            aria-current={section === 'chat' ? 'page' : undefined}
            title="Messages"
            onNavigate={() => setSection('chat')}
          >
            <MessageCircle size={22} />
          </AppLink>
          <AppLink
            to={officePath(detail.id, detail.officeId, 'calendar')}
            className={`nav-item${section === 'calendar' ? ' current' : ''}`}

            aria-label="Calendar"
            aria-current={section === 'calendar' ? 'page' : undefined}
            title="Calendar"
            onNavigate={() => setSection('calendar')}
          >
            <CalendarDays size={22} />
          </AppLink>
          <AppLink
            to={officePath(detail.id, detail.officeId, 'activity')}
            className={`nav-item${section === 'activity' ? ' current' : ''}`}

            aria-label="Activity"
            aria-current={section === 'activity' ? 'page' : undefined}
            title="Activity"
            onNavigate={() => setSection('activity')}
          >
            <Bell size={22} />
          </AppLink>
        </div>
        <div className="rail-bottom">
          <AppLink
            to={companySettingsPath(detail.id)}
            className="nav-item"
            aria-label="Space settings"
            title="Space settings"
          >
            <Settings2 size={19} />
          </AppLink>
          {detail.role === 'owner' && (
            <AppLink
              to={officePath(detail.id, detail.officeId, 'invitations')}
              className={`nav-item${section === 'invitations' ? ' current' : ''}`}

              aria-label="Invite people"
              aria-current={section === 'invitations' ? 'page' : undefined}
              title="Invite people"
              onNavigate={() => setSection('invitations')}
            >
              <UserPlus size={22} />
            </AppLink>
          )}
          <AppLink
            to="/companies"
            className="icon-button"
            aria-label="Back to companies"
            title="Back to companies"
            onNavigate={onBack}
          >
            <ArrowLeft size={19} />
          </AppLink>
          <AppLink
            to="/account/security"
            className="icon-button"
            aria-label="Account security"
            title="Account security"
            onNavigate={onOpenSecurity}
          >
            <Settings2 size={19} />
          </AppLink>
        </div>
      </nav>

      <div className="workspace">
        <aside
          id="office-member-sidebar"
          className="side-panel panel-people office-shell-sidebar"
          aria-label="Office details"
          aria-hidden={!sidebarOpen}
        >
          <div className="panel-heading">
            <h1 id="company-office-preview-title" ref={titleRef} tabIndex={-1}>
              {detail.name}
            </h1>
            <button
              type="button"
              className="office-sidebar-close"
              aria-label="Close member sidebar"
              aria-expanded={sidebarOpen}
              aria-controls="office-member-sidebar"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose size={18} aria-hidden="true" />
            </button>
          </div>

          {section === 'office' ? (
            <>
              <div className="floor-selector">
                <LayoutGrid size={15} />
                <span>Floor 1</span>
                <span className="office-floor-map-name">{mapName}</span>
              </div>
              <p className="office-sidebar-summary">
                Choose a room on the map and talk with your team.
              </p>
            </>
          ) : section === 'invitations' ? (
            <div className="office-nav-placeholder">
              <strong>Invite people</strong>
              <p>Invite coworkers to {detail.name} and manage pending invitations.</p>
              <AppLink
                to={officePath(detail.id, detail.officeId, 'office')}
                className="dashboard-secondary"

                onNavigate={() => setSection('office')}
              >
                Return to office
              </AppLink>
            </div>
          ) : section === 'chat' ? (
            <SpaceChatNavigation chat={chat} selfId={account.id} />
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

          {section === 'office' && (
            <WorkspacePeopleDirectory
              client={client}
              members={workspaceMembers}
              meetingParticipationIds={meetingParticipationIds}
              selfId={account.id}
              selectedUserId={selectedDirectoryUserId}
              loading={workspaceMembersLoading}
              error={workspaceMembersError}
              onRetry={retryMemberDirectory}
              onSelectOnline={selectOnlineMember}
              onSelectOffline={selectOfflineMember}
            />
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
                {proximityVoiceEnabled ? (
                  <p className="office-voice-help">
                    Opt in to join a nearby group conversation with up to six coworkers. Joining
                    never turns on your microphone by itself.
                  </p>
                ) : (
                  <p className="office-voice-help" role="status">
                    Nearby voice is unavailable in this deployment.
                  </p>
                )}
                <div className="office-world-control-row">
                  {proximityVoiceEnabled && (
                    <button
                      className="dashboard-secondary"
                      type="button"
                      aria-pressed={proximityOptedIn}
                      disabled={proximityPending || !!activeMeetingConversation}
                      onClick={() => void changeProximityOptIn()}
                    >
                      {proximityPending
                        ? 'Updating…'
                        : proximityOptedIn
                          ? 'Opt out of nearby voice'
                          : 'Opt in to nearby voice'}
                    </button>
                  )}
                  {activeMeetingConversation && (
                    <span className="office-voice-help" role="status">
                      Leave the meeting before opting into nearby voice.
                    </span>
                  )}
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
                {activeProximityConversation && (
                  <p className="office-voice-members" aria-label="Conversation participants">
                    {conversationMembers.length} participants: {conversationMemberNames.join(', ')}
                  </p>
                )}
                {proximityAudioError && (
                  <p className="office-action-error" role="alert">
                    {proximityAudioError}
                  </p>
                )}
              </div>
              <div role="group" aria-labelledby="office-meeting-title">
                <h3 id="office-meeting-title">Meeting room</h3>
                {activeMeetingConversation ? (
                  <>
                    <p className="office-voice-help">
                      In {currentMeetingZone?.label ?? 'a meeting room'} · {meetingMembers.length}/
                      {state.meetingZones?.zones.find(
                        (zone) => zone.zoneId === activeMeetingConversation.zoneId,
                      )?.capacity ?? 6}{' '}
                      participants
                    </p>
                    <p className="office-voice-members" aria-label="Meeting participants">
                      {meetingMemberNames.join(', ')}
                    </p>
                    <button
                      className="dashboard-secondary"
                      type="button"
                      disabled={officeActionPending}
                      onClick={() => void leaveMeetingConversation()}
                    >
                      Leave meeting
                    </button>
                  </>
                ) : latestMeeting?.state === 'joining' ? (
                  <p className="office-voice-help" role="status">
                    Preparing secured meeting audio…
                  </p>
                ) : currentMeetingZone ? (
                  <>
                    <p className="office-voice-help">
                      You are inside {currentMeetingZone.label}. Joining is explicit; your
                      microphone stays off until you turn it on.
                    </p>
                    <button
                      className="dashboard-secondary"
                      type="button"
                      disabled={officeActionPending || !!activeProximityConversation}
                      onClick={() => void joinMeeting(currentMeetingZone.zoneId)}
                    >
                      {officeActionPending ? 'Joining…' : 'Join meeting'}
                    </button>
                  </>
                ) : (
                  <p className="office-voice-help">
                    Move inside a meeting room to join its group call.
                  </p>
                )}
                {activeProximityConversation && !activeMeetingConversation && (
                  <p className="office-voice-help" role="status">
                    Leave your nearby conversation before joining a meeting.
                  </p>
                )}
                {officeActionError && (
                  <p className="office-action-error" role="alert">
                    {officeActionError}
                  </p>
                )}
                {senderMeetingNotice &&
                  ['pending', 'arriving'].includes(senderMeetingNotice.status) && (
                    <p className="office-voice-status" role="status">
                      Invitation {senderMeetingNotice.status}:{' '}
                      {senderMeetingNotice.recipientDisplayName}{' '}
                      <button
                        type="button"
                        onClick={() =>
                          void client
                            .cancelMeetingInvitation(senderMeetingNotice.invitationId)
                            .catch(() =>
                              setOfficeActionError('Could not cancel meeting invitation.'),
                            )
                        }
                      >
                        Cancel
                      </button>
                    </p>
                  )}
              </div>
              {(mapId === 'commons' || bootstrap.layout) && (
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
                {canNavigateOffice
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
            <p className="empty-small">
              {keepOfficeShell
                ? 'Office controls are paused while your connection is restored.'
                : 'Enter the office to update your status or use a seat.'}
            </p>
          ) : null}

          <div className="sidebar-foot">
            <span className={`connection ${connected ? 'connected' : ''}`}>
              <i />
              {connected
                ? 'Connected'
                : keepOfficeShell
                  ? 'Reconnecting…'
                  : state.status === 'connecting'
                    ? 'Connecting…'
                    : 'Not connected'}
            </span>
            <span>{mapName}</span>
            {!connected && keepOfficeShell && reconnectState.exhausted && (
              <button
                className="office-reconnect-button"
                type="button"
                onClick={() => reconnectSupervisor.retryNow()}
              >
                Retry
              </button>
            )}
          </div>
        </aside>

        <main
          ref={officeMapRef}
          id="office-map"
          className={`map-area office-shell-map${section === 'chat' ? ' is-chat-view' : ''}`}
          tabIndex={-1}
          aria-label={
            section === 'office'
              ? `OpenOfficeForAll ${mapName} office map`
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
          {section === 'office' &&
            connected &&
            selectedMember &&
            typeof document !== 'undefined' &&
            createPortal(
              <section
                ref={memberCardRef}
                className="member-actions-card"
                role="dialog"
                aria-label="Member actions"
                aria-modal="false"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="member-actions-header">
                  <span className="member-actions-avatar" aria-hidden="true">
                    {selectedMember.displayName.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <div className="member-actions-identity">
                    <strong>{selectedMember.displayName}</strong>
                    <span className="member-actions-status">
                      <i className={selectedMemberIsLive ? 'is-online' : ''} />
                      {selectedMemberIsLive ? 'Online' : 'Away'}
                    </span>
                  </div>
                  <button
                    className="member-actions-close"
                    type="button"
                    aria-label="Close member actions"
                    onClick={() => closeMemberCard()}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="member-actions-buttons">
                  {activeMeetingConversation && (
                    <button
                      type="button"
                      className="dashboard-secondary"
                      disabled={!selectedMemberIsLive || meetingActionPending}
                      onClick={() => {
                        setMeetingActionPending(true);
                        setMemberActionMessage('');
                        void client
                          .inviteToMeeting(
                            selectedMember.participationId,
                            activeMeetingConversation.zoneId!,
                          )
                          .then(() =>
                            setMemberActionMessage(
                              `Invitation sent to ${selectedMember.displayName}.`,
                            ),
                          )
                          .catch((error: unknown) =>
                            setMemberActionMessage(
                              error instanceof Error
                                ? `Could not invite ${selectedMember.displayName} (${error.message}).`
                                : 'Could not send meeting invitation.',
                            ),
                          )
                          .finally(() => setMeetingActionPending(false));
                      }}
                    >
                      Invite to meeting
                    </button>
                  )}
                  <button
                    type="button"
                    className="member-action-wave"
                    aria-label={`Wave to ${selectedMember.displayName}`}
                    title="Wave"
                    aria-busy={wavePending}
                    disabled={!connected || !selectedMemberIsLive || wavePending}
                    onClick={() => {
                      const latest = client.getSnapshot();
                      const target = latest.snapshot?.participants.find(
                        (participant) =>
                          participant.participationId === selectedMember.participationId,
                      );
                      if (!connected || !target || target.availability === 'away') {
                        setMemberActionMessage(
                          `${selectedMember.displayName} is no longer online.`,
                        );
                        closeMemberCard(false);
                        return;
                      }
                      setWavePending(true);
                      setMemberActionMessage('');
                      void client
                        .wave(target.participationId)
                        .catch((error: unknown) => {
                          setMemberActionMessage(
                            error instanceof Error && error.message === 'conflict'
                              ? `${selectedMember.displayName} is no longer online.`
                              : 'Could not send the wave. Try again shortly.',
                          );
                        })
                        .finally(() => setWavePending(false));
                    }}
                  >
                    <Hand size={23} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="member-action-go"
                    disabled={
                      !connected ||
                      !selectedMemberIsLive ||
                      !self ||
                      Boolean(self.seatId) ||
                      self.availability === 'away' ||
                      !canNavigateOffice
                    }
                    onClick={() => {
                      const latest = client.getSnapshot().snapshot;
                      const target = latest?.participants.find(
                        (participant) =>
                          participant.participationId === selectedMember.participationId,
                      );
                      if (
                        !connected ||
                        !target ||
                        target.availability === 'away' ||
                        !self ||
                        self.seatId ||
                        self.availability === 'away'
                      ) {
                        setMemberActionMessage('Go to is unavailable right now.');
                        return;
                      }
                      officeMapRef.current?.focus({ preventScroll: true });
                      setNavigationTarget({
                        ...target.position,
                        participantId: target.participationId,
                        nonce: ++navigationNonce.current,
                      });
                      setMemberActionMessage(`Finding a path to ${target.displayName}…`);
                    }}
                  >
                    Go to
                  </button>
                </div>
                {(memberActionMessage || goToDisabledReason) && (
                  <p className="member-actions-message" role="status" aria-live="polite">
                    {memberActionMessage || goToDisabledReason}
                  </p>
                )}
              </section>,
              document.body,
            )}
          {section === 'office' &&
            selectedOfflineMember &&
            !selectedMember &&
            typeof document !== 'undefined' &&
            createPortal(
              <section
                ref={memberCardRef}
                className="member-actions-card"
                role="dialog"
                aria-label="Member actions"
                aria-modal="false"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="member-actions-header">
                  <span className="member-actions-avatar" aria-hidden="true">
                    {selectedOfflineMember.displayName.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <div className="member-actions-identity">
                    <strong>{selectedOfflineMember.displayName}</strong>
                    <span className="member-actions-status">
                      <i />
                      Offline
                    </span>
                  </div>
                  <button
                    className="member-actions-close"
                    type="button"
                    aria-label="Close member actions"
                    onClick={() => closeMemberCard()}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="member-actions-message">This person is offline.</p>
              </section>,
              document.body,
            )}
          {section === 'office' ? (
            <>
              <div className="office-map-heading">
                <strong>{connected ? `Live ${mapName} office` : `${mapName} office`}</strong>
                <span className="office-preview-badge">{connected ? 'Live' : 'Read only'}</span>
              </div>
              <div className="office-map-stage">
                {mapId === 'vivo' ? (
                  <VivoScene
                    participants={sceneParticipants}
                    selfId={connected ? ready.participationId : null}
                    objects={[]}
                    zoom={zoom}
                    simplified={false}
                    editItem={null}
                    selectedObject={null}
                    editorOpen={false}
                    overrides={noOverrides}
                    authoritativeMovement
                    authoritativeRevision={{
                      epoch: snapshot.officeEpoch,
                      version: snapshot.stateVersion,
                    }}
                    onMove={() => {}}
                    onMovementIntent={(dx, dy) => client.move(dx, dy)}
                    onPlace={() => {}}
                    onSelect={selectMapMember}
                    navigationTarget={navigateToSelection}
                    onNavigationResult={recordNavigationResult}
                    onSelectObject={() => {}}
                    onMoveObject={() => {}}
                    onRemove={() => {}}
                    onSit={(seatId) => void runOfficeAction(() => client.sit(seatId))}
                    onStand={() => void runOfficeAction(() => client.stand())}
                    meetings={sceneMeetings}
                    currentMeetingZone={currentMeetingZone}
                    conversationAreas={state.conversationAreas?.areas ?? []}
                    areaNames={{}}
                    onZoom={setZoom}
                    onAreaClick={() => {}}
                  />
                ) : connected && state.bootstrap && state.ready && state.snapshot ? (
                  <Suspense fallback={<p role="status">Loading office map…</p>}>
                    <LiveCommonsScene
                      bootstrap={state.bootstrap}
                      snapshot={state.snapshot}
                      speakingIds={speakingIds}
                      localParticipationId={state.ready.participationId}
                      onMovement={(dx, dy, waypoint) => client.move(dx, dy, waypoint)}
                      conversationAreas={state.conversationAreas?.areas ?? []}
                      meetingZones={state.meetingZones?.zones ?? []}
                      currentMeetingZone={currentMeetingZone}
                      navigationTarget={navigateToSelection}
                      actions={{
                        onSelect: selectMapMember,
                        onNavigationResult: recordNavigationResult,
                        onSit: (seatId) => void runOfficeAction(() => client.sit(seatId)),
                        onStand: () => void runOfficeAction(() => client.stand()),
                      }}
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
                      : 'Interactions are paused while your office connection is restored.'}
                  </small>
                  {connected && (
                    <small id="office-microphone-help" className="office-microphone-help">
                      {microphoneHelp}
                    </small>
                  )}
                </span>
                <span className="control-separator" />
                {connected ? (
                  <>
                    {audioPlaybackBlocked && (
                      <button
                        className="media-control muted"
                        type="button"
                        aria-label="Enable speaker audio"
                        title="Your browser blocked sound. Click to hear your coworkers."
                        onClick={() => void audioPlayback.resume()}
                      >
                        <Volume2 size={19} />
                      </button>
                    )}
                    <button
                      className={`media-control ${microphoneEnabled ? 'enabled' : 'muted'}`}
                      type="button"
                      aria-label={
                        !proximityVoiceEnabled
                          ? 'Nearby voice unavailable in this deployment'
                          : permissionState.status === 'requesting'
                            ? 'Cancel microphone access'
                            : proximityAudioStatus === 'connecting' &&
                                microphoneIntent === participationId
                              ? 'Cancel microphone setup'
                              : microphoneEnabled
                                ? 'Mute proximity microphone'
                                : proximityAudioStatus === 'muted'
                                  ? 'Unmute proximity microphone'
                                  : 'Activate proximity microphone'
                      }
                      title={microphoneHelp}
                      aria-describedby="office-microphone-help"
                      aria-pressed={microphoneEnabled}
                      disabled={!proximityVoiceEnabled || proximityPending}
                      onClick={toggleConversationMicrophone}
                    >
                      {microphoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
                    </button>
                    <button
                      className="icon-button leave-meeting"
                      type="button"
                      aria-label="Leave office"
                      title="Leave office"
                      onClick={() =>
                        void proximityAudio.current?.stop().finally(() => {
                          client.close();
                          onNavigatePage?.('entry');
                        })
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
              <SpaceChatView chat={chat} selfId={account.id} />
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
              <AppLink
                to={officePath(detail.id, detail.officeId, 'office')}
                className="dashboard-secondary"

                onNavigate={() => setSection('office')}
              >
                Return to office
              </AppLink>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
