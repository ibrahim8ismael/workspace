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
};

/** The existing office chat surface, pinned to an explicitly disconnected, empty state. */
export function OfficePreviewChat({ companyName }: Props) {
  return (
    <section className="office-preview-chat" aria-labelledby="office-preview-chat-title">
      <div className="office-preview-chat-status" role="status">
        <span className="status-dot away" aria-hidden="true" />
        <div>
          <h2 id="office-preview-chat-title">Chat is disconnected</h2>
          <p>
            No participants or messages are loaded for {companyName}. Sending is disabled until live
            office chat is available.
          </p>
        </div>
      </div>
      <fieldset
        className="office-preview-chat-frame"
        disabled
        aria-label="Disconnected office chat preview"
      >
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
