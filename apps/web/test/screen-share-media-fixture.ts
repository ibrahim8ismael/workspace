import { Room, RoomEvent, Track, TrackEvent } from 'livekit-client';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { MeetingScreenSharePresentation } from '@gather/contracts';
import { MeetingScreenShareViewer } from '../src/features/office/meeting-screen-share-viewer';
import type { ProximityRemoteScreenShare } from '../src/features/office/proximity-audio-session';

type StartMessage = {
  kind: 'start';
  grant: { serverUrl: string; token: string };
  publishMicrophone?: boolean;
};
type PublishScreenMessage = { kind: 'publish-screen'; bypassClientPermissions?: boolean };
type StopScreenMessage = { kind: 'stop-screen' };
type StopMessage = { kind: 'stop' };
type ViewerStateMessage = {
  kind: 'viewer-state';
  presentation: MeetingScreenSharePresentation | null;
  presenterName: string;
};
type FixtureMessage =
  StartMessage | PublishScreenMessage | StopScreenMessage | StopMessage | ViewerStateMessage;

declare global {
  interface Window {
    __meetingScreenFixture: {
      status: string;
      identity: string;
      error: string;
      permissions: string[];
      screenPublishResult: string;
      screenPublishAttempts: number;
      screenPublishError: string;
      screenPublished: boolean;
      remoteScreenOwners: string[];
      remoteAudioOwners: string[];
      remoteAudioSamples: number;
      lastRemoteAudioAt: number;
      localMicrophonePublished: boolean;
      messageEvents: number;
      lastMessageKind: string;
      viewerPresent: boolean;
      fullscreen: boolean;
    };
  }
}

window.__meetingScreenFixture = {
  status: 'off',
  identity: '',
  error: '',
  permissions: [],
  screenPublishResult: '',
  screenPublishAttempts: 0,
  screenPublishError: '',
  screenPublished: false,
  remoteScreenOwners: [],
  remoteAudioOwners: [],
  remoteAudioSamples: 0,
  lastRemoteAudioAt: 0,
  localMicrophonePublished: false,
  messageEvents: 0,
  lastMessageKind: '',
  viewerPresent: false,
  fullscreen: false,
};

let room: Room | undefined;
let audioTrack: MediaStreamTrack | undefined;
let audioContext: AudioContext | undefined;
let oscillator: OscillatorNode | undefined;
let screenTrack: MediaStreamTrack | undefined;
let screenCanvas: HTMLCanvasElement | undefined;
let paintTimer: number | undefined;
const remoteScreens = new Map<string, ProximityRemoteScreenShare>();
const remoteAudioContexts = new Set<AudioContext>();
const viewerRoot = createRoot(document.getElementById('meeting-screen-share-viewer-root')!);
let viewerPresentation: MeetingScreenSharePresentation | null = null;
let viewerPresenterName = '';
document.addEventListener('fullscreenchange', () => {
  window.__meetingScreenFixture.fullscreen = document.fullscreenElement !== null;
});

function renderViewer() {
  window.__meetingScreenFixture.viewerPresent = viewerPresentation !== null;
  if (!viewerPresentation) {
    viewerRoot.render(null);
    return;
  }
  viewerRoot.render(
    createElement(MeetingScreenShareViewer, {
      presentation: viewerPresentation,
      presenterName: viewerPresenterName,
      remoteScreenShares: [...remoteScreens.values()],
      onFirstFrame: () => undefined,
    }),
  );
}

function updatePermissions() {
  const values = room?.localParticipant.permissions?.canPublishSources ?? [];
  window.__meetingScreenFixture.permissions = values.map((source) => Track.sourceFromProto(source));
}

async function start(grant: StartMessage['grant'], publishMicrophone: boolean) {
  room = new Room({
    adaptiveStream: false,
    dynacast: false,
    publishDefaults: { preConnectBuffer: false },
  });
  room.on(RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
    if (participant === room?.localParticipant) updatePermissions();
  });
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
      remoteScreens.set(participant.identity, {
        track,
        identity: participant.identity,
      });
      window.__meetingScreenFixture.remoteScreenOwners = [...remoteScreens.keys()];
      renderViewer();
      return;
    }
    if (track.kind !== Track.Kind.Audio) return;
    const element = track.attach() as HTMLAudioElement;
    element.autoplay = true;
    document.body.append(element);
    void element.play().catch(() => undefined);
    window.__meetingScreenFixture.remoteAudioOwners = [
      ...new Set([...window.__meetingScreenFixture.remoteAudioOwners, participant.identity]),
    ];
    const context = new AudioContext();
    remoteAudioContexts.add(context);
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    source.connect(analyser);
    analyser.connect(context.destination);
    void context.resume();
    const samples = new Float32Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      if (samples.some((sample) => Math.abs(sample) > 0.01)) {
        window.__meetingScreenFixture.remoteAudioSamples += 1;
        window.__meetingScreenFixture.lastRemoteAudioAt = Date.now();
      }
    }, 20);
    track.once(TrackEvent.Ended, () => {
      window.clearInterval(timer);
      track.detach(element);
      element.remove();
      remoteAudioContexts.delete(context);
      window.__meetingScreenFixture.remoteAudioOwners =
        window.__meetingScreenFixture.remoteAudioOwners.filter(
          (identity) => identity !== participant.identity,
        );
      void context.close();
    });
  });
  room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
    if (track.kind !== Track.Kind.Video || track.source !== Track.Source.ScreenShare) return;
    remoteScreens.delete(participant.identity);
    window.__meetingScreenFixture.remoteScreenOwners = [...remoteScreens.keys()];
    renderViewer();
  });
  room.on(RoomEvent.LocalTrackPublished, (publication, participant) => {
    if (participant === room?.localParticipant) {
      if (publication.source === Track.Source.Microphone)
        window.__meetingScreenFixture.localMicrophonePublished = true;
      window.__meetingScreenFixture.screenPublished = Boolean(
        room.localParticipant.getTrackPublication(Track.Source.ScreenShare),
      );
    }
  });
  room.on(RoomEvent.LocalTrackUnpublished, (publication, participant) => {
    if (participant === room?.localParticipant && publication.source === Track.Source.Microphone)
      window.__meetingScreenFixture.localMicrophonePublished = false;
    if (participant === room?.localParticipant && publication.source === Track.Source.ScreenShare)
      window.__meetingScreenFixture.screenPublished = false;
  });
  room.on(RoomEvent.Disconnected, () => {
    window.__meetingScreenFixture.status = 'disconnected';
  });

  await room.connect(grant.serverUrl, grant.token);
  updatePermissions();
  if (publishMicrophone) {
    audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    oscillator = audioContext.createOscillator();
    oscillator.frequency.value = 660;
    oscillator.connect(destination);
    oscillator.start();
    await audioContext.resume();
    audioTrack = destination.stream.getAudioTracks()[0]!;
    await room.localParticipant.publishTrack(audioTrack, {
      source: Track.Source.Microphone,
    });
  }
  window.__meetingScreenFixture.identity = room.localParticipant.identity;
  window.__meetingScreenFixture.status = 'connected';
}

async function publishScreen(bypassClientPermissions: boolean) {
  const activeRoom = room;
  if (!activeRoom) throw new Error('not_connected');
  window.__meetingScreenFixture.screenPublishAttempts += 1;
  window.__meetingScreenFixture.screenPublishResult = 'pending';
  window.__meetingScreenFixture.screenPublishError = '';

  if (screenTrack?.readyState === 'live') screenTrack.stop();
  screenCanvas = document.createElement('canvas');
  screenCanvas.width = 320;
  screenCanvas.height = 180;
  const context = screenCanvas.getContext('2d');
  if (!context) throw new Error('screen_canvas_unavailable');
  let frame = 0;
  paintTimer = window.setInterval(() => {
    context.fillStyle = `hsl(${frame++ % 360}, 100%, 50%)`;
    context.fillRect(0, 0, screenCanvas!.width, screenCanvas!.height);
    context.fillStyle = '#111';
    context.fillText(String(frame), 12, 24);
  }, 50);
  screenTrack = screenCanvas.captureStream(15).getVideoTracks()[0]!;

  if (bypassClientPermissions) {
    const permissions = activeRoom.localParticipant.permissions;
    if (!permissions) throw new Error('local_permissions_unavailable');
    // The SDK treats an empty source list as unrestricted. The signed server
    // grant and LiveKit participant permission remain source restricted.
    permissions.canPublishSources = [];
  }

  const publishing = activeRoom.localParticipant.publishTrack(screenTrack, {
    source: Track.Source.ScreenShare,
    name: 'screen-share-policy-fixture',
  });
  window.__meetingScreenFixture.screenPublishResult = 'attempted';
  void publishing.then(
    () => {
      window.__meetingScreenFixture.screenPublishResult = 'published';
    },
    (error: unknown) => {
      window.__meetingScreenFixture.screenPublishResult = 'rejected';
      window.__meetingScreenFixture.screenPublishError =
        error instanceof Error ? error.message.slice(0, 300) : 'publish_rejected';
      void stopScreenTrack();
    },
  );
}

async function stopScreenTrack() {
  if (paintTimer !== undefined) window.clearInterval(paintTimer);
  paintTimer = undefined;
  const activeRoom = room;
  const publication = activeRoom?.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  if (publication?.track) await activeRoom!.localParticipant.unpublishTrack(publication.track);
  screenTrack?.stop();
  screenTrack = undefined;
}

async function stop() {
  await stopScreenTrack();
  audioTrack?.stop();
  audioTrack = undefined;
  oscillator?.stop();
  oscillator = undefined;
  for (const context of remoteAudioContexts) void context.close();
  remoteAudioContexts.clear();
  await room?.disconnect();
  room = undefined;
  remoteScreens.clear();
  viewerPresentation = null;
  renderViewer();
  await audioContext?.close();
  audioContext = undefined;
  window.__meetingScreenFixture.status = 'off';
}

window.addEventListener('message', (event: MessageEvent<FixtureMessage>) => {
  window.__meetingScreenFixture.messageEvents += 1;
  window.__meetingScreenFixture.lastMessageKind = String(event.data?.kind ?? 'unknown');
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.kind === 'start') {
    window.__meetingScreenFixture.status = 'connecting';
    void start(event.data.grant, event.data.publishMicrophone !== false).catch((error: unknown) => {
      window.__meetingScreenFixture.status = 'error';
      window.__meetingScreenFixture.error =
        error instanceof Error ? error.message.slice(0, 300) : 'connection_failed';
    });
  } else if (event.data?.kind === 'publish-screen') {
    void publishScreen(Boolean(event.data.bypassClientPermissions)).catch((error: unknown) => {
      window.__meetingScreenFixture.screenPublishResult = 'error';
      window.__meetingScreenFixture.screenPublishError =
        error instanceof Error ? error.message.slice(0, 300) : 'publish_failed';
    });
  } else if (event.data?.kind === 'stop-screen') {
    void stopScreenTrack();
  } else if (event.data?.kind === 'viewer-state') {
    viewerPresentation = event.data.presentation;
    viewerPresenterName = event.data.presenterName;
    renderViewer();
  } else if (event.data?.kind === 'stop') {
    void stop();
  }
});
