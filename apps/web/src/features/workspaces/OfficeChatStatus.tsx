import type { WorldSnapshot } from '@gather/contracts';

type Props = {
  connected: boolean;
  participants: WorldSnapshot['participants'];
};

/** Honest capability state until the separately scoped company chat service is implemented. */
export function OfficeChatStatus({ connected, participants }: Props) {
  return (
    <section className="office-chat-status" aria-labelledby="office-chat-status-title">
      <div className="office-chat-status-copy" role="status">
        <span className={`status-dot ${connected ? 'available' : 'away'}`} aria-hidden="true" />
        <div>
          <h2 id="office-chat-status-title">Text chat is unavailable</h2>
          <p>
            {connected
              ? 'This office is connected, but company messages and chat history are not available in this release.'
              : 'Enter the office to see who is here. Company messages and chat history are not available in this release.'}
          </p>
          {connected && participants.length > 0 && (
            <ul className="office-live-participants" aria-label="People in the office">
              {participants.map((participant) => (
                <li key={participant.participationId} data-availability={participant.availability}>
                  <span>{participant.displayName}</span>
                  <small>{participant.availability}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
