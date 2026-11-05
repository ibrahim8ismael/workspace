import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant, Send, Signal } from './types';
import { MEDIA_RADIUS, sharesConversationArea } from '../shared/office-world.js';
import { meetingRoomOf } from '../shared/office-meetings.js';
import { t } from './i18n';
import { officeConfig } from './config';

type MediaOptions = {
  selfId: string | null;
  participants: Participant[];
  send: Send;
  subscribeSignal: (listener: (signal: Signal) => void) => () => void;
  onError: (message: string) => void;
  /** People in this meeting room reach each other through the media server, not peer to peer. */
  sfuRoom?: string | null;
};

type Peer = {
  connection: RTCPeerConnection;
  audio: RTCRtpSender | null;
  video: RTCRtpSender | null;
  stream: MediaStream;
  candidates: RTCIceCandidateInit[];
  operations: Promise<void>;
  makingOffer: boolean;
};

export function canHearEachOther(self: Participant, other: Participant): boolean {
  if (self.id === other.id || self.status !== 'available' || other.status !== 'available')
    return false;
  return sharesConversationArea(self, other, MEDIA_RADIUS);
}

function rtcConfiguration(): RTCConfiguration {
  // STUN/TURN servers come from the server's runtime configuration (ICE_SERVERS); an empty list still works on a local network.
  return { iceServers: officeConfig().iceServers };
}

function mediaError(error: unknown, kind: string): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return t('No se autorizó {kind}. Revisa los permisos del navegador e inténtalo de nuevo.', {
      kind,
    });
  if (name === 'NotFoundError') return t('No se encontró un dispositivo para {kind}.', { kind });
  if (name === 'NotReadableError')
    return t('No se pudo abrir {kind}. Puede estar en uso por otra aplicación.', { kind });
  return t('No se pudo activar {kind}. {detail}', {
    kind,
    detail: error instanceof Error ? error.message : t('Inténtalo de nuevo.'),
  });
}

export function useMedia({
  selfId,
  participants,
  send,
  subscribeSignal,
  onError,
  sfuRoom = null,
}: MediaOptions) {
  const sfu = useRef(sfuRoom);
  sfu.current = sfuRoom;
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [mic, setMic] = useState(false);
  const [camera, setCamera] = useState(false);
  const [screen, setScreen] = useState(false);
  const current = useRef({ selfId, participants, send, onError });
  current.current = { selfId, participants, send, onError };
  const peers = useRef(new Map<string, Peer>());
  const audioTrack = useRef<MediaStreamTrack | null>(null);
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const mounted = useRef(true);
  const stopped = useRef(false);
  const generation = useRef(0);
  const pending = useRef({ mic: false, camera: false, screen: false });
  const previousId = useRef(selfId);

  const reportError = useCallback((message: string) => {
    if (mounted.current) current.current.onError(message);
  }, []);

  const eligible = useCallback((id: string) => {
    if (stopped.current) return false;
    const state = current.current;
    const self = state.participants.find((person) => person.id === state.selfId);
    const other = state.participants.find((person) => person.id === id);
    if (
      sfu.current &&
      self &&
      other &&
      meetingRoomOf(self)?.id === sfu.current &&
      meetingRoomOf(other)?.id === sfu.current
    )
      return false;
    return Boolean(self && other && canHearEachOther(self, other));
  }, []);

  const closePeer = useCallback((id: string) => {
    const peer = peers.current.get(id);
    if (!peer) return;
    peers.current.delete(id);
    peer.connection.onicecandidate = null;
    peer.connection.ontrack = null;
    peer.connection.onnegotiationneeded = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.close();
    peer.stream.getTracks().forEach((track) => track.stop());
    if (mounted.current)
      setRemoteStreams((streams) => {
        if (!(id in streams)) return streams;
        const next = { ...streams };
        delete next[id];
        return next;
      });
  }, []);

  const getPeer = useCallback(
    (id: string): Peer | undefined => {
      if (!eligible(id)) return;
      const existing = peers.current.get(id);
      if (existing) return existing;
      if (typeof RTCPeerConnection === 'undefined') return;
      const connection = new RTCPeerConnection(rtcConfiguration());
      // Reserve both channels from the initial offer. Toggling devices uses
      // replaceTrack, so either participant can enable media without offer glare.
      // The answerer must use transceivers created by setRemoteDescription, rather
      // than precreating its own unmatched channels before receiving the offer.
      const isOfferer = Boolean(current.current.selfId && current.current.selfId < id);
      const audio = isOfferer
        ? connection.addTransceiver(audioTrack.current ?? 'audio', { direction: 'sendrecv' }).sender
        : null;
      const video = isOfferer
        ? connection.addTransceiver(screenTrack.current ?? cameraTrack.current ?? 'video', {
            direction: 'sendrecv',
          }).sender
        : null;
      const peer: Peer = {
        connection,
        audio,
        video,
        stream: new MediaStream(),
        candidates: [],
        operations: Promise.resolve(),
        makingOffer: false,
      };
      peers.current.set(id, peer);
      const active = () => peers.current.get(id) === peer && eligible(id);
      connection.onicecandidate = (event) => {
        if (event.candidate && active())
          current.current.send({
            type: 'signal',
            to: id,
            data: { candidate: event.candidate.toJSON() },
          });
      };
      connection.ontrack = (event) => {
        if (!active()) return;
        if (!peer.stream.getTrackById(event.track.id)) peer.stream.addTrack(event.track);
        if (mounted.current) setRemoteStreams((streams) => ({ ...streams, [id]: peer.stream }));
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'failed' && active()) {
          closePeer(id);
          reportError(
            t(
              'No se pudo conectar el audio o video con esta persona. Para conexiones entre redes distintas se necesita configurar STUN/TURN.',
            ),
          );
        }
      };
      connection.onnegotiationneeded = () => {
        // Only the lexicographically smaller id initiates the fixed-channel offer.
        if (
          !active() ||
          !current.current.selfId ||
          current.current.selfId > id ||
          peer.makingOffer ||
          connection.signalingState !== 'stable'
        )
          return;
        peer.makingOffer = true;
        peer.operations = peer.operations
          .then(async () => {
            if (!active() || connection.signalingState !== 'stable') return;
            await connection.setLocalDescription(await connection.createOffer());
            if (active() && connection.localDescription)
              current.current.send({
                type: 'signal',
                to: id,
                data: { description: connection.localDescription.toJSON() },
              });
          })
          .catch(() => {
            if (active()) reportError(t('No se pudo iniciar la conexión de audio y video.'));
          })
          .finally(() => {
            peer.makingOffer = false;
          });
      };
      return peer;
    },
    [closePeer, eligible, reportError],
  );

  const reconcilePeers = useCallback(() => {
    for (const id of peers.current.keys()) if (!eligible(id)) closePeer(id);
    for (const person of current.current.participants) {
      if (!eligible(person.id)) continue;
      try {
        getPeer(person.id);
      } catch {
        reportError(t('Este navegador no pudo preparar una conexión de audio y video.'));
      }
    }
  }, [closePeer, eligible, getPeer, reportError]);

  const syncMedia = useCallback(async () => {
    if (!mounted.current) return;
    const audio = audioTrack.current;
    const video = screenTrack.current ?? cameraTrack.current;
    const tracks = [audio, video].filter((track): track is MediaStreamTrack => track !== null);
    setLocalStream(tracks.length ? new MediaStream(tracks) : null);
    setMic(Boolean(audio));
    setCamera(Boolean(cameraTrack.current));
    setScreen(Boolean(screenTrack.current));
    current.current.send({
      type: 'profile',
      mic: Boolean(audio),
      camera: Boolean(cameraTrack.current),
      screen: Boolean(screenTrack.current),
    });
    reconcilePeers();
    await Promise.all(
      Array.from(peers.current.entries(), async ([id, peer]) => {
        try {
          await Promise.all([peer.audio?.replaceTrack(audio), peer.video?.replaceTrack(video)]);
        } catch {
          if (peers.current.get(id) === peer && eligible(id))
            reportError(t('No se pudo actualizar el audio o video de la llamada.'));
        }
      }),
    );
  }, [eligible, reconcilePeers, reportError]);

  const release = useCallback(
    (announce: boolean) => {
      generation.current += 1;
      stopped.current = true;
      for (const id of peers.current.keys()) closePeer(id);
      for (const ref of [audioTrack, cameraTrack, screenTrack]) {
        if (ref.current) {
          ref.current.onended = null;
          ref.current.stop();
          ref.current = null;
        }
      }
      if (mounted.current) {
        setLocalStream(null);
        setRemoteStreams({});
        setMic(false);
        setCamera(false);
        setScreen(false);
      }
      if (announce)
        current.current.send({ type: 'profile', mic: false, camera: false, screen: false });
    },
    [closePeer],
  );

  const stop = useCallback(() => release(true), [release]);

  const toggleDevice = useCallback(
    async (kind: 'mic' | 'camera') => {
      if (pending.current[kind] || !mounted.current) return;
      const ref = kind === 'mic' ? audioTrack : cameraTrack;
      if (ref.current) {
        ref.current.onended = null;
        ref.current.stop();
        ref.current = null;
        await syncMedia();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        reportError(
          t(
            'El navegador no ofrece audio y video aquí. Abre la aplicación en localhost o mediante HTTPS y utiliza un navegador compatible.',
          ),
        );
        return;
      }
      pending.current[kind] = true;
      const attempt = generation.current;
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          kind === 'mic' ? { audio: true, video: false } : { audio: false, video: true },
        );
        if (!mounted.current || generation.current !== attempt) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const track = kind === 'mic' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
        stream
          .getTracks()
          .filter((other) => other !== track)
          .forEach((other) => other.stop());
        if (!track) throw new Error(t('El dispositivo no entregó una pista de medios.'));
        stopped.current = false;
        ref.current = track;
        track.onended = () => {
          if (ref.current === track) {
            ref.current = null;
            void syncMedia();
          }
        };
        await syncMedia();
      } catch (error) {
        if (generation.current === attempt)
          reportError(mediaError(error, kind === 'mic' ? t('el micrófono') : t('la cámara')));
      } finally {
        pending.current[kind] = false;
      }
    },
    [reportError, syncMedia],
  );

  const toggleMic = useCallback(() => toggleDevice('mic'), [toggleDevice]);
  const toggleCamera = useCallback(() => toggleDevice('camera'), [toggleDevice]);

  const toggleScreen = useCallback(async () => {
    if (pending.current.screen || !mounted.current) return;
    if (screenTrack.current) {
      screenTrack.current.onended = null;
      screenTrack.current.stop();
      screenTrack.current = null;
      await syncMedia();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof RTCPeerConnection === 'undefined') {
      reportError(
        t(
          'Compartir pantalla no está disponible en este navegador. Utiliza un navegador compatible en localhost o mediante HTTPS.',
        ),
      );
      return;
    }
    pending.current.screen = true;
    const attempt = generation.current;
    try {
      // Display sharing never requests or enables the microphone implicitly.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (!mounted.current || generation.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      stream
        .getTracks()
        .filter((other) => other !== track)
        .forEach((other) => other.stop());
      if (!track) throw new Error(t('No se recibió una pantalla para compartir.'));
      stopped.current = false;
      screenTrack.current = track;
      track.onended = () => {
        if (screenTrack.current === track) {
          screenTrack.current = null;
          void syncMedia();
        }
      };
      await syncMedia();
    } catch (error) {
      if (generation.current === attempt) reportError(mediaError(error, 'compartir pantalla'));
    } finally {
      pending.current.screen = false;
    }
  }, [reportError, syncMedia]);

  useEffect(() => {
    mounted.current = true;
    stopped.current = false;
    return () => {
      mounted.current = false;
      release(false);
    };
  }, [release]);

  useEffect(
    () =>
      subscribeSignal((signal) => {
        if (!eligible(signal.from)) return;
        let peer: Peer | undefined;
        try {
          peer = getPeer(signal.from);
        } catch {
          reportError(t('No se pudo recibir la conexión de audio y video.'));
          return;
        }
        if (!peer) return;
        const target = peer;
        const active = () => peers.current.get(signal.from) === target && eligible(signal.from);
        target.operations = target.operations
          .then(async () => {
            if (!active()) return;
            const { description, candidate } = signal.data;
            if (description) {
              if (
                description.type === 'offer' &&
                current.current.selfId &&
                current.current.selfId < signal.from
              )
                return;
              if (
                description.type === 'answer' &&
                target.connection.signalingState !== 'have-local-offer'
              )
                return;
              await target.connection.setRemoteDescription(description);
              for (const queued of target.candidates.splice(0))
                await target.connection.addIceCandidate(queued);
              if (description.type === 'offer') {
                for (const transceiver of target.connection.getTransceivers()) {
                  transceiver.direction = 'sendrecv';
                  if (transceiver.receiver.track.kind === 'audio') {
                    target.audio = transceiver.sender;
                    await target.audio.replaceTrack(audioTrack.current);
                  } else if (transceiver.receiver.track.kind === 'video') {
                    target.video = transceiver.sender;
                    await target.video.replaceTrack(screenTrack.current ?? cameraTrack.current);
                  }
                }
                await target.connection.setLocalDescription(await target.connection.createAnswer());
                if (active() && target.connection.localDescription)
                  current.current.send({
                    type: 'signal',
                    to: signal.from,
                    data: { description: target.connection.localDescription.toJSON() },
                  });
              }
            }
            if (candidate) {
              if (target.connection.remoteDescription)
                await target.connection.addIceCandidate(candidate);
              else target.candidates.push(candidate);
            }
          })
          .catch(() => {
            if (active()) reportError(t('No se pudo completar la conexión de audio y video.'));
          });
      }),
    [eligible, getPeer, reportError, subscribeSignal],
  );

  useEffect(() => {
    if (previousId.current !== selfId) {
      release(false);
      previousId.current = selfId;
      stopped.current = false;
    }
    reconcilePeers();
  }, [participants, reconcilePeers, release, selfId, sfuRoom]);

  return {
    localStream,
    remoteStreams,
    mic,
    camera,
    screen,
    toggleMic,
    toggleCamera,
    toggleScreen,
    stop,
  };
}
