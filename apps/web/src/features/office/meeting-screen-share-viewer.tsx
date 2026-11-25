import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MeetingScreenSharePresentation } from '@gather/contracts';
import type { ProximityRemoteScreenShare } from './proximity-audio-session';

type Props = {
  presentation: MeetingScreenSharePresentation;
  presenterName: string;
  remoteScreenShares: readonly ProximityRemoteScreenShare[];
};

export function MeetingScreenShareViewer({
  presentation,
  presenterName,
  remoteScreenShares,
}: Props) {
  const containerRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const screenTrack =
    presentation.status === 'live'
      ? remoteScreenShares.find(
          ({ identity }) => identity === presentation.presenterParticipationId,
        )?.track
      : undefined;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === container);
    setFullscreenSupported(Boolean(document.fullscreenEnabled && container.requestFullscreen));
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreen);
      if (document.fullscreenElement === container) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !screenTrack || presentation.status !== 'live') return;
    screenTrack.attach(video);
    void video.play().catch(() => undefined);
    return () => {
      screenTrack.detach(video);
      video.pause();
      video.srcObject = null;
    };
  }, [screenTrack, presentation.presenterParticipationId, presentation.status]);

  async function toggleFullscreen() {
    const container = containerRef.current;
    if (!container || !fullscreenSupported) return;
    setFullscreenMessage('');
    try {
      if (document.fullscreenElement === container) await document.exitFullscreen();
      else await container.requestFullscreen();
    } catch {
      setFullscreenMessage('Fullscreen is unavailable in this browser.');
    }
  }

  return (
    <section
      ref={containerRef}
      className="meeting-screen-share-viewer"
      aria-label="Meeting screen share"
      data-screen-share-status={presentation.status}
    >
      <header className="meeting-screen-share-heading">
        <p>
          <strong>{presenterName}</strong>{' '}
          {presentation.status === 'live' ? 'is sharing a screen' : 'is preparing a screen share'}
        </p>
        <button
          className="meeting-screen-share-fullscreen"
          type="button"
          onClick={() => void toggleFullscreen()}
          disabled={!fullscreenSupported}
          aria-label={fullscreen ? 'Exit fullscreen' : 'View fullscreen'}
          title={fullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        >
          {fullscreen ? (
            <Minimize2 size={16} aria-hidden="true" />
          ) : (
            <Maximize2 size={16} aria-hidden="true" />
          )}
        </button>
      </header>
      {screenTrack ? (
        <video
          ref={videoRef}
          className="meeting-screen-share-video"
          autoPlay
          muted
          playsInline
          aria-label={`${presenterName}'s shared screen`}
        />
      ) : (
        <p className="meeting-screen-share-pending" role="status" aria-live="polite">
          {presentation.status === 'starting'
            ? 'Waiting for the presentation to start…'
            : 'Connecting to the presentation…'}
        </p>
      )}
      {fullscreenMessage && (
        <p className="meeting-screen-share-fullscreen-message" role="status">
          {fullscreenMessage}
        </p>
      )}
    </section>
  );
}
