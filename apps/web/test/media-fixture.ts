import type { MediaTokenResponse } from '@gather/contracts';
import {
  ProximityAudioSession,
  createLiveKitProximityRoom,
  type ProximityRemoteAudioTrack,
} from '../src/features/office/proximity-audio-session';

type StartMessage = {
  kind: 'start';
  grant: MediaTokenResponse;
};
type StopMessage = { kind: 'stop' };
type FixtureMessage = StartMessage | StopMessage;

declare global {
  interface Window {
    __mediaFixture: {
      status: string;
      error: string;
      remoteIdentities: string[];
      activeAudioSamples: number;
      lastActiveAudioAt: number;
      startedAt: number;
      disconnectReason: string;
    };
  }
}

window.__mediaFixture = {
  status: 'off',
  error: '',
  remoteIdentities: [],
  activeAudioSamples: 0,
  lastActiveAudioAt: 0,
  startedAt: 0,
  disconnectReason: '',
};

const session = new ProximityAudioSession(
  (status, error) => {
    window.__mediaFixture.status = status;
    window.__mediaFixture.error = error ?? '';
  },
  (track, identity) => {
    const element = track.attach() as HTMLAudioElement;
    element.autoplay = true;
    element.dataset.participantId = identity;
    document.body.append(element);
    void element.play().catch(() => undefined);
    window.__mediaFixture.remoteIdentities = [
      ...window.__mediaFixture.remoteIdentities.filter((candidate) => candidate !== identity),
      identity,
    ];

    const audioTrack = (track as ProximityRemoteAudioTrack & { mediaStreamTrack: MediaStreamTrack })
      .mediaStreamTrack;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
    source.connect(analyser);
    analyser.connect(context.destination);
    void context.resume();
    const samples = new Float32Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      if (samples.some((sample) => Math.abs(sample) > 0.01)) {
        window.__mediaFixture.activeAudioSamples += 1;
        window.__mediaFixture.lastActiveAudioAt = Date.now();
      }
    }, 20);

    return () => {
      window.clearInterval(timer);
      track.detach(element);
      element.remove();
      void context.close();
    };
  },
  () =>
    createLiveKitProximityRoom((reason) => {
      window.__mediaFixture.disconnectReason = String(reason ?? '');
    }),
);

let contextCurrent = true;
window.addEventListener('message', (event: MessageEvent<FixtureMessage>) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (message?.kind === 'start') {
    contextCurrent = true;
    window.__mediaFixture.startedAt = Date.now();
    void session.start(
      async () => message.grant,
      () => contextCurrent,
      message.grant.conversationVersion,
      message.grant.generation,
    );
  } else if (message?.kind === 'stop') {
    contextCurrent = false;
    void session.stop();
  }
});
