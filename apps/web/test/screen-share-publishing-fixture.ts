import {
  MeetingScreenShareController,
  type MeetingScreenShareActions,
} from '../src/features/office/meeting-screen-share';
import {
  createLiveKitProximityRoom,
  ProximityAudioSession,
  type ProximityAudioStatus,
} from '../src/features/office/proximity-audio-session';

type Grant = {
  serverUrl: string;
  token: string;
  expiresAt: string;
  conversationVersion: number;
  generation: string;
};

declare global {
  interface Window {
    __meetingScreenPublishingFixture: {
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
      captureRequests: DisplayMediaStreamOptions[];
      cancelNextCapture: boolean;
      shareId: string;
      shareState: string;
    };
    __reserveMeetingScreenShare?: (shareId: string) => Promise<void>;
    __confirmMeetingScreenShare?: (shareId: string) => Promise<void>;
    __releaseMeetingScreenShare?: (shareId: string) => Promise<void>;
  }
}

window.__meetingScreenPublishingFixture = {
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
  captureRequests: [],
  cancelNextCapture: false,
  shareId: '',
  shareState: 'idle',
};

let session: ProximityAudioSession | undefined;
let shareController: MeetingScreenShareController | undefined;
let screenCanvas: HTMLCanvasElement | undefined;
let capturedScreenStream: MediaStream | undefined;
let paintTimer: number | undefined;
const remoteAudioContexts = new Set<AudioContext>();

function installDeterministicDisplayCapture() {
  Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
    configurable: true,
    value: async (constraints: DisplayMediaStreamOptions) => {
      window.__meetingScreenPublishingFixture.captureRequests.push(constraints);
      if (window.__meetingScreenPublishingFixture.cancelNextCapture) {
        window.__meetingScreenPublishingFixture.cancelNextCapture = false;
        throw new DOMException('Permission denied', 'NotAllowedError');
      }
      screenCanvas = document.createElement('canvas');
      screenCanvas.width = 1280;
      screenCanvas.height = 720;
      const context = screenCanvas.getContext('2d');
      if (!context) throw new Error('screen_canvas_unavailable');
      let frame = 0;
      paintTimer = window.setInterval(() => {
        context.fillStyle = `hsl(${frame++ % 360}, 100%, 50%)`;
        context.fillRect(0, 0, screenCanvas!.width, screenCanvas!.height);
        context.fillStyle = '#111';
        context.fillText(String(frame), 12, 24);
      }, 50);
      capturedScreenStream = screenCanvas.captureStream(15);
      return capturedScreenStream;
    },
  });
}

function createAudioSession() {
  return new ProximityAudioSession(
    (status: ProximityAudioStatus, error) => {
      window.__meetingScreenPublishingFixture.status =
        (status === 'live' || status === 'muted') &&
        window.__meetingScreenPublishingFixture.identity
          ? 'connected'
          : status;
      if (error) window.__meetingScreenPublishingFixture.error = error;
    },
    (track, identity) => {
      const element = track.attach() as HTMLAudioElement;
      element.autoplay = true;
      document.body.append(element);
      void element.play().catch(() => undefined);
      window.__meetingScreenPublishingFixture.remoteAudioOwners = [
        ...new Set([...window.__meetingScreenPublishingFixture.remoteAudioOwners, identity]),
      ];
      const context = new AudioContext();
      remoteAudioContexts.add(context);
      const analyser = context.createAnalyser();
      const source = context.createMediaStreamSource(
        new MediaStream([
          (track as typeof track & { mediaStreamTrack: MediaStreamTrack }).mediaStreamTrack,
        ]),
      );
      source.connect(analyser);
      analyser.connect(context.destination);
      void context.resume();
      const samples = new Float32Array(analyser.fftSize);
      const timer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        if (samples.some((sample) => Math.abs(sample) > 0.01)) {
          window.__meetingScreenPublishingFixture.remoteAudioSamples += 1;
          window.__meetingScreenPublishingFixture.lastRemoteAudioAt = Date.now();
        }
      }, 20);
      return () => {
        window.clearInterval(timer);
        track.detach(element);
        element.remove();
        remoteAudioContexts.delete(context);
        window.__meetingScreenPublishingFixture.remoteAudioOwners =
          window.__meetingScreenPublishingFixture.remoteAudioOwners.filter(
            (owner) => owner !== identity,
          );
        void context.close();
      };
    },
    async () => createLiveKitProximityRoom(),
  );
}

function createShareActions(conversationId: string): MeetingScreenShareActions {
  return {
    reserve: async (shareId) => {
      window.__meetingScreenPublishingFixture.shareId = shareId;
      if (!window.__reserveMeetingScreenShare) throw new Error('server_command_unavailable');
      await window.__reserveMeetingScreenShare(shareId);
    },
    waitForPermission: (signal) => session!.waitForScreenSharePermission(signal),
    publish: async (track) => {
      window.__meetingScreenPublishingFixture.screenPublishAttempts += 1;
      window.__meetingScreenPublishingFixture.screenPublishResult = 'attempted';
      window.__meetingScreenPublishingFixture.permissions = session!.isScreenSharePermitted()
        ? ['microphone', 'screen_share']
        : ['microphone'];
      await session!.publishScreenShare(track);
      window.__meetingScreenPublishingFixture.screenPublished = true;
      window.__meetingScreenPublishingFixture.screenPublishResult = 'published';
    },
    confirm: async (shareId) => {
      if (!window.__confirmMeetingScreenShare) throw new Error('server_command_unavailable');
      await window.__confirmMeetingScreenShare(shareId);
    },
    unpublish: async (track) => {
      await session!.unpublishScreenShare(track);
      window.__meetingScreenPublishingFixture.screenPublished = false;
      window.__meetingScreenPublishingFixture.screenPublishResult = 'unpublished';
      if (paintTimer !== undefined) window.clearInterval(paintTimer);
      paintTimer = undefined;
      screenCanvas = undefined;
    },
    release: async (shareId) => {
      if (!window.__releaseMeetingScreenShare) throw new Error('server_command_unavailable');
      await window.__releaseMeetingScreenShare(shareId);
    },
    isCurrent: () =>
      window.__meetingScreenPublishingFixture.status === 'connected' && Boolean(conversationId),
  };
}

async function connect(grant: Grant, publishMicrophone: boolean, identity: string) {
  session = createAudioSession();
  shareController = new MeetingScreenShareController();
  installDeterministicDisplayCapture();
  const restore = shareController.subscribe(() => {
    const state = shareController!.getSnapshot();
    window.__meetingScreenPublishingFixture.shareState = state.status;
    if (state.status === 'error')
      window.__meetingScreenPublishingFixture.screenPublishError = state.message;
  });
  await session.start(
    async () => grant,
    () => true,
    grant.conversationVersion,
    grant.generation,
  );
  if (publishMicrophone) {
    await session.setMicrophoneEnabled(true);
    window.__meetingScreenPublishingFixture.localMicrophonePublished = true;
  }
  window.__meetingScreenPublishingFixture.identity = identity;
  window.__meetingScreenPublishingFixture.status = 'connected';
  document.querySelector('#share-screen')?.addEventListener('click', () => {
    void shareController!.start(createShareActions(identity));
  });
  document.querySelector('#stop-screen')?.addEventListener('click', () => {
    void shareController!.stop();
  });
  document.querySelector('#native-stop-screen')?.addEventListener('click', () => {
    const track = capturedScreenStream?.getVideoTracks()[0];
    if (!track) return;
    track.stop();
    track.dispatchEvent(new Event('ended'));
  });
  window.addEventListener('beforeunload', () => {
    restore();
    void shareController?.stop();
    void session?.stop();
    for (const context of remoteAudioContexts) void context.close();
  });
}

async function stopFixture() {
  await shareController?.stop();
  await session?.stop();
  session = undefined;
  shareController = undefined;
  for (const context of remoteAudioContexts) void context.close();
  remoteAudioContexts.clear();
  window.__meetingScreenPublishingFixture.status = 'off';
}

window.addEventListener('message', (event: MessageEvent) => {
  window.__meetingScreenPublishingFixture.messageEvents += 1;
  window.__meetingScreenPublishingFixture.lastMessageKind = String(event.data?.kind ?? 'unknown');
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.kind === 'start') {
    window.__meetingScreenPublishingFixture.status = 'connecting';
    void connect(
      event.data.grant,
      Boolean(event.data.publishMicrophone),
      String(event.data.identity ?? ''),
    ).catch((error: unknown) => {
      window.__meetingScreenPublishingFixture.status = 'error';
      window.__meetingScreenPublishingFixture.error =
        error instanceof Error ? error.message.slice(0, 300) : 'connection_failed';
    });
  } else if (event.data?.kind === 'enable-microphone') {
    void session?.setMicrophoneEnabled(true);
  } else if (event.data?.kind === 'stop') {
    void stopFixture();
  }
});
