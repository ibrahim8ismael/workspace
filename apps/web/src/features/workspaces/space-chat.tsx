import { Hash, User } from 'lucide-react';
import ChatView from '../../../chat/ChatView';
import { SPACE_CHANNELS } from './space-chat-state';
import type { SpaceChat } from './use-space-chat';

export function SpaceChatNavigation({ chat, selfId }: { chat: SpaceChat; selfId: string }) {
  return (
    <div className="chat-sidebar office-chat-sidebar" aria-label="Message conversations">
      <p className="chat-section">
        <span>CHANNELS</span>
      </p>
      {SPACE_CHANNELS.map((channel) => (
        <button
          key={channel.id}
          type="button"
          className={`chat-nav-row${chat.key === `channel:${channel.id}` ? ' is-active' : ''}`}
          aria-current={chat.key === `channel:${channel.id}` ? 'page' : undefined}
          onClick={() => chat.select({ kind: 'channel', id: channel.id })}
        >
          <Hash size={16} />
          <span>{channel.name}</span>
        </button>
      ))}
      <p className="chat-section">
        <span>DIRECT MESSAGES</span>
      </p>
      {chat.users
        .filter((user) => user.userId !== selfId)
        .map((user) => (
          <button
            key={user.userId}
            type="button"
            className={`chat-nav-row${chat.key === `dm:${user.userId}` ? ' is-active' : ''}`}
            aria-current={chat.key === `dm:${user.userId}` ? 'page' : undefined}
            onClick={() => chat.select({ kind: 'dm', userId: user.userId })}
          >
            <User size={16} />
            <span>{user.name}</span>
          </button>
        ))}
      {chat.directoryError && (
        <p className="office-sidebar-summary" role="status">
          Could not load space members.{' '}
          <button type="button" className="dashboard-secondary" onClick={chat.retry}>
            Retry member list
          </button>
        </p>
      )}
      {!chat.directoryError && chat.users.length < 2 && (
        <p className="office-sidebar-summary">Other space members will appear here.</p>
      )}
      <p className="office-sidebar-summary">
        Messages are retained for 90 days. Direct messages are private to the two participants.
      </p>
    </div>
  );
}

export function SpaceChatView({ chat, selfId }: { chat: SpaceChat; selfId: string }) {
  return (
    <ChatView
      key={chat.key}
      conversation={chat.conversation}
      channels={SPACE_CHANNELS}
      users={chat.users}
      participants={[]}
      selfUserId={selfId}
      messages={chat.messages}
      online={chat.available}
      draft={chat.draft}
      onDraft={chat.setDraft}
      onSend={chat.send}
      onTopic={() => {}}
      englishOnly
      topicEditable={false}
      showChannelTools={false}
      statusMessage={
        chat.status ||
        (chat.messages.length === 0 ? 'No messages yet. Start the conversation.' : '')
      }
      onRetryLoad={chat.status && !chat.status.startsWith('Loading') ? chat.retry : undefined}
      clearDraftOnSend={false}
    />
  );
}
