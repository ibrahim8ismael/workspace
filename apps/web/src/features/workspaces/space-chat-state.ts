import type { SpaceConversation, SpaceMessage } from '@gather/contracts';

export const SPACE_CHANNELS: { id: 'general' | 'social'; name: string; topic: string }[] = [
  {
    id: 'general',
    name: 'General',
    topic: 'Company announcements and team discussions · Messages are retained for 90 days.',
  },
  {
    id: 'social',
    name: 'Social',
    topic: 'Casual conversations with your team · Messages are retained for 90 days.',
  },
];
export const spaceConversationKey = (conversation: SpaceConversation) =>
  conversation.kind === 'channel' ? `channel:${conversation.id}` : `dm:${conversation.userId}`;

export function messageBelongsTo(
  message: SpaceMessage,
  conversation: SpaceConversation,
  selfId: string,
) {
  return conversation.kind === 'channel'
    ? message.scope.kind === 'channel' && message.scope.id === conversation.id
    : message.scope.kind === 'dm' &&
        message.scope.userIds.includes(selfId) &&
        message.scope.userIds.includes(conversation.userId);
}

export function mergeSpaceMessages(current: SpaceMessage[], incoming: SpaceMessage[]) {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(-100);
}
