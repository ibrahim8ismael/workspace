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
type ToggleMicrophoneMessage = { kind: 'toggle-microphone' };
type FixtureMessage = StartMessage | StopMessage | ToggleMicrophoneMessage;

declare global {
  interface Window {
    __mediaFixture: {
      status: string;
      statusHistory: string[];
      error: string;
      remoteIdentities: string[];
      remoteTrackIdentities: string[];
      activeAudioSamples: number;
      decodedAudioSamples: number;
      lastDecodedAudioAt: number;
      lastActiveAudioAt: number;
      startedAt: number;
      gatheredCandidateTypes: string[];
      iceStates: string[];
      disconnectReason: string;
      refreshedToken: string;
      tokenRefreshCount: number;
    };
  }
}

window.__mediaFixture = {
  status: 'off',
  statusHistory: [],
  error: '',
  remoteIdentities: [],
  remoteTrackIdentities: [],
  activeAudioSamples: 0,
  decodedAudioSamples: 0,
  lastDecodedAudioAt: 0,
  lastActiveAudioAt: 0,
  startedAt: 0,
  gatheredCandidateTypes: [],
  iceStates: [],
  disconnectReason: '',
  refreshedToken: '',
  tokenRefreshCount: 0,
};

const NativeRTCPeerConnection = window.RTCPeerConnection;
const mediaPeerConnections: RTCPeerConnection[] = [];
const lastInboundSamples = new Map<string, number>();
let samplingInboundAudio = false;
window.RTCPeerConnection = new Proxy(NativeRTCPeerConnection, {
  construct(target, args, newTarget) {
    const peer = Reflect.construct(target, args, newTarget);
    mediaPeerConnections.push(peer);
    peer.addEventListener('icecandidate', (event: Event) => {
      const candidate = (event as RTCPeerConnectionIceEvent).candidate;
      const type = candidate?.type;
      if (type && !window.__mediaFixture.gatheredCandidateTypes.includes(type))
        window.__mediaFixture.gatheredCandidateTypes.push(type);
    });
    peer.addEventListener('iceconnectionstatechange', () => {
      const state = `connection:${peer.iceConnectionState}`;
      if (!window.__mediaFixture.iceStates.includes(state))
        window.__mediaFixture.iceStates.push(state);
    });
    peer.addEventListener('icegatheringstatechange', () => {
      const state = `gathering:${peer.iceGatheringState}`;
      if (!window.__mediaFixture.iceStates.includes(state))
        window.__mediaFixture.iceStates.push(state);
    });
    return peer;
  },
});

window.setInterval(() => {
  if (samplingInboundAudio) return;
  samplingInboundAudio = true;
  void Promise.all(
    mediaPeerConnections.map(async (peer, peerIndex) => {
      const report = await peer.getStats();
      let samples = 0;
      report.forEach((stat) => {
        if (
          stat.type === 'inbound-rtp' &&
          'kind' in stat &&
          stat.kind === 'audio' &&
          'totalSamplesReceived' in stat &&
          typeof stat.totalSamplesReceived === 'number'
        ) {
          const key = `${peerIndex}:${stat.id}`;
          const previous = lastInboundSamples.get(key);
          samples +=
            previous === undefined
              ? stat.totalSamplesReceived
              : stat.totalSamplesReceived >= previous
                ? stat.totalSamplesReceived - previous
                : stat.totalSamplesReceived;
          lastInboundSamples.set(key, stat.totalSamplesReceived);
        }
      });
      return samples;
    }),
  )
    .then((increments) => {
      const decodedAudioSamples = increments.reduce((total, value) => total + value, 0);
      if (decodedAudioSamples > 0) {
        window.__mediaFixture.decodedAudioSamples += decodedAudioSamples;
        window.__mediaFixture.lastDecodedAudioAt = Date.now();
      }
    })
    .catch(() => undefined)
    .finally(() => {
      samplingInboundAudio = false;
    });
}, 100);

const relayOnly = new URLSearchParams(location.search).get('ice') === 'relay';
const remoteAudioSources = new Map<string, MediaStreamAudioSourceNode>();
let remoteAudioContext: AudioContext | null = null;
let remoteAudioAnalyser: AnalyserNode | null = null;
let remoteAudioMeterTimer: number | undefined;

function attachAudioMeterTrack(identity: string, track: MediaStreamTrack) {
  if (!remoteAudioContext || !remoteAudioAnalyser) {
    remoteAudioContext = new AudioContext();
    remoteAudioAnalyser = remoteAudioContext.createAnalyser();
    const silentOutput = remoteAudioContext.createGain();
    silentOutput.gain.value = 0;
    remoteAudioAnalyser.connect(silentOutput);
    silentOutput.connect(remoteAudioContext.destination);
    const samples = new Float32Array(remoteAudioAnalyser.fftSize);
    remoteAudioMeterTimer = window.setInterval(() => {
      remoteAudioAnalyser?.getFloatTimeDomainData(samples);
      if (samples.some((sample) => Math.abs(sample) > 0.01)) {
        window.__mediaFixture.activeAudioSamples += 1;
        window.__mediaFixture.lastActiveAudioAt = Date.now();
      }
    }, 20);
  }
  remoteAudioSources.get(identity)?.disconnect();
  const source = remoteAudioContext.createMediaStreamSource(new MediaStream([track]));
  source.connect(remoteAudioAnalyser);
  remoteAudioSources.set(identity, source);
  void remoteAudioContext.resume().catch(() => undefined);
}

function detachAudioMeterTrack(identity: string) {
  remoteAudioSources.get(identity)?.disconnect();
  remoteAudioSources.delete(identity);
  if (remoteAudioSources.size > 0 || !remoteAudioContext) return;
  if (remoteAudioMeterTimer !== undefined) window.clearInterval(remoteAudioMeterTimer);
  remoteAudioMeterTimer = undefined;
  remoteAudioAnalyser = null;
  void remoteAudioContext.close();
  remoteAudioContext = null;
}

const session = new ProximityAudioSession(
  (status, error) => {
    window.__mediaFixture.status = status;
    window.__mediaFixture.statusHistory.push(status);
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
    window.__mediaFixture.remoteTrackIdentities.push(identity);

    const audioTrack = (track as ProximityRemoteAudioTrack & { mediaStreamTrack: MediaStreamTrack })
      .mediaStreamTrack;
    attachAudioMeterTrack(identity, audioTrack);

    return () => {
      detachAudioMeterTrack(identity);
      track.detach(element);
      element.remove();
      window.__mediaFixture.remoteIdentities = window.__mediaFixture.remoteIdentities.filter(
        (candidate) => candidate !== identity,
      );
      const trackIndex = window.__mediaFixture.remoteTrackIdentities.indexOf(identity);
      if (trackIndex >= 0) window.__mediaFixture.remoteTrackIdentities.splice(trackIndex, 1);
    };
  },
  () =>
    createLiveKitProximityRoom(
      (reason) => {
        window.__mediaFixture.disconnectReason = String(reason ?? '');
      },
      (token) => {
        window.__mediaFixture.refreshedToken = token;
        window.__mediaFixture.tokenRefreshCount += 1;
      },
      relayOnly ? { iceTransportPolicy: 'relay' } : undefined,
    ),
);

let contextCurrent = true;
window.addEventListener('message', (event: MessageEvent<FixtureMessage>) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (message?.kind === 'start') {
    contextCurrent = true;
    window.__mediaFixture.startedAt = Date.now();
    // The fixture's start command explicitly opts into publishing its synthetic microphone.
    // Production sessions remain muted until a member chooses to enable their microphone.
    void session.setMicrophoneEnabled(true);
    void session.start(
      async () => message.grant,
      () => contextCurrent,
      message.grant.conversationVersion,
      message.grant.generation,
    );
  } else if (message?.kind === 'stop') {
    contextCurrent = false;
    void session.stop();
  } else if (message?.kind === 'toggle-microphone') {
    void session.toggleMicrophone();
  }
});
