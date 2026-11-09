import ChatView, { type Conversation } from '../../../chat/ChatView';
import type { Channel, ChatMessage, DirectoryUser, Participant } from '../../../types';

const PREVIEW_CONVERSATION: Conversation = { kind: 'channel', id: 'office-preview' };
const PREVIEW_CHANNELS: Channel[] = [
  {
    id: 'office-preview',
    name: 'office-preview',
    topic: 'Preview channel. No company messages are loaded.',
  },
];
const NO_USERS: DirectoryUser[] = [];
const NO_PARTICIPANTS: Participant[] = [];
const NO_MESSAGES: ChatMessage[] = [];
const ignoreChange = () => undefined;

type Props = {
  companyName: string;
  connected?: boolean;
  participants?: Array<{
    participationId: string;
    displayName: string;
    availability: 'available' | 'busy' | 'away';
  }>;
};

/** The existing office chat surface, pinned to an explicitly disconnected, empty state. */
export function OfficePreviewChat({ companyName, connected = false, participants = [] }: Props) {
  return (
    <section className="office-preview-chat" aria-labelledby="office-preview-chat-title">
      <div className="office-preview-chat-status" role="status">
        <span className={`status-dot ${connected ? 'available' : 'away'}`} aria-hidden="true" />
        <div>
          <h2 id="office-preview-chat-title">Text chat is unavailable</h2>
          <p>
            {connected
              ? `The office connection is live for ${companyName}, but this release has no text-message service.`
              : `No participants or messages are loaded for ${companyName}.`}{' '}
            Sending is disabled.
          </p>
          {connected && (
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
      <fieldset className="office-preview-chat-frame" disabled aria-label="Text chat unavailable">
        <ChatView
          conversation={PREVIEW_CONVERSATION}
          channels={PREVIEW_CHANNELS}
          users={NO_USERS}
          participants={NO_PARTICIPANTS}
          selfUserId="office-preview"
          messages={NO_MESSAGES}
          online={false}
          draft=""
          onDraft={ignoreChange}
          onSend={ignoreChange}
          onTopic={ignoreChange}
          englishOnly
        />
      </fieldset>
    </section>
  );
}
