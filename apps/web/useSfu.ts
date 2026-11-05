import { useEffect, useRef, useState } from 'react';
import type { Send } from './types';

export type MediaToken = { url: string; token: string; room: string; areaId: string };

/** Meeting rooms on a media server (LiveKit). Inside a room every participant publishes once to the server and
    receives everyone else from it, instead of one connection per person; outside rooms, proximity stays peer to peer.
    The library is loaded only when an office has a media server configured. */
export function useSfu({
  areaId,
  enabled,
  token,
  localStream,
  send,
}: {
  areaId: string | null;
  enabled: boolean;
  token: MediaToken | null;
  localStream: MediaStream | null;
  send: Send;
}) {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [connected, setConnected] = useState(false);
  const room = useRef<import('livekit-client').Room | null>(null);
  const published = useRef(new Map<string, MediaStreamTrack>());
  const active = enabled && !!areaId;

  // Ask for a token whenever we enter a meeting room.
  useEffect(() => {
    if (active) send({ type: 'media:token' });
  }, [active, areaId, send]);

  // Connect with the token for the current room; leave when we walk out.
  useEffect(() => {
    if (!active || !token || token.areaId !== areaId) return;
    let cancelled = false;
    const streams = new Map<string, MediaStream>();
    const publish = () =>
      setRemoteStreams(
        Object.fromEntries(
          [...streams].map(([id, stream]) => [id, new MediaStream(stream.getTracks())]),
        ),
      );
    void (async () => {
      const { Room, RoomEvent } = await import('livekit-client');
      if (cancelled) return;
      // Tiles render raw tracks in our own <video> elements, so LiveKit cannot see their size: no adaptive pausing.
      const next = new Room({ adaptiveStream: false, dynacast: true });
      next.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        const stream = streams.get(participant.identity) ?? new MediaStream();
        stream
          .getTracks()
          .filter((old) => old.kind === track.kind)
          .forEach((old) => stream.removeTrack(old));
        stream.addTrack(track.mediaStreamTrack);
        streams.set(participant.identity, stream);
        publish();
      });
      next.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        const stream = streams.get(participant.identity);
        if (!stream) return;
        stream.removeTrack(track.mediaStreamTrack);
        if (!stream.getTracks().length) streams.delete(participant.identity);
        publish();
      });
      next.on(RoomEvent.ParticipantDisconnected, (participant) => {
        streams.delete(participant.identity);
        publish();
      });
      next.on(RoomEvent.Disconnected, () => {
        if (!cancelled) {
          setConnected(false);
          streams.clear();
          publish();
        }
      });
      try {
        await next.connect(token.url, token.token);
        if (cancelled) {
          await next.disconnect();
          return;
        }
        room.current = next;
        published.current.clear();
        setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
      setConnected(false);
      setRemoteStreams({});
      const current = room.current;
      room.current = null;
      published.current.clear();
      void current?.disconnect();
    };
  }, [active, token?.token, areaId]);

  // Keep the published tracks equal to the local microphone, camera or screen. Changes run one at a time and each
  // run reads the latest stream, so quick toggles (microphone, then camera) never race each other.
  const latest = useRef(localStream);
  latest.current = localStream;
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    if (!room.current || !connected) return;
    queue.current = queue.current
      .then(async () => {
        const current = room.current;
        if (!current) return;
        const { Track } = await import('livekit-client');
        const wanted = new Map(
          (latest.current?.getTracks() ?? []).map((track) => [track.kind, track]),
        );
        for (const [kind, track] of [...published.current]) {
          if (wanted.get(kind) === track) continue;
          try {
            await current.localParticipant.unpublishTrack(track, false);
          } catch {
            /* already gone */
          }
          published.current.delete(kind);
        }
        for (const [kind, track] of wanted) {
          if (published.current.get(kind) === track) continue;
          try {
            await current.localParticipant.publishTrack(track, {
              source: kind === 'audio' ? Track.Source.Microphone : Track.Source.Camera,
            });
            published.current.set(kind, track);
          } catch {
            /* retried on the next change */
          }
        }
      })
      .catch(() => undefined);
  }, [localStream, connected]);

  return { remoteStreams, connected };
}
