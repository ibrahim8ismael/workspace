import { useEffect, useRef, useState } from 'react';
import type { SpaceConversation, SpaceMessage } from '@gather/contracts';
import type { ChatMessage, DirectoryUser } from '../../../types';
import { ApiClient, ApiError } from '../../lib/api';
import { messageBelongsTo, mergeSpaceMessages, spaceConversationKey } from './space-chat-state';
const COLORS = ['#7968e6', '#54a98f', '#d18b49', '#6888bf', '#bd6b83'];

type ChatState = {
  requestKey: string;
  messages: SpaceMessage[];
  loading: boolean;
  available: boolean;
  error: string;
};
const EMPTY: ChatState = {
  requestKey: '',
  messages: [],
  loading: true,
  available: false,
  error: '',
};

export function useSpaceChat(
  api: ApiClient,
  workspaceId: string,
  officeId: string,
  selfId: string,
  events: Record<string, SpaceMessage[]>,
  connected: boolean,
  onUnauthorized: (notice?: string) => void,
) {
  const [conversation, setConversation] = useState<SpaceConversation>({
    kind: 'channel',
    id: 'general',
  });
  const key = spaceConversationKey(conversation);
  const realtimeKey =
    conversation.kind === 'channel'
      ? `channel:${conversation.id}`
      : `dm:${[selfId, conversation.userId].sort().join(':')}`;
  const [directoryError, setDirectoryError] = useState(false);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [states, setStates] = useState<Record<string, ChatState>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(new Map<string, { text: string; id: string }>());
  const sending = useRef(new Set<string>());
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => {
    unauthorized.current = onUnauthorized;
  }, [onUnauthorized]);
  const requestKey = `${key}:${connected}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    void api
      .workspaceMembers(workspaceId, controller.signal)
      .then((members) => {
        if (controller.signal.aborted) return;
        setDirectoryError(false);
        setUsers(
          members.map((member, index) => ({
            userId: member.userId,
            name: member.displayName,
            color: COLORS[index % COLORS.length]!,
          })),
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) unauthorized.current();
        setDirectoryError(true);
        setUsers([]);
      });
    return () => controller.abort();
  }, [api, workspaceId, connected, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    void api
      .spaceMessages(workspaceId, officeId, conversation, controller.signal)
      .then((messages) => {
        if (controller.signal.aborted) return;
        setStates((current) => ({
          ...current,
          [key]: { requestKey, messages, loading: false, available: true, error: '' },
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) unauthorized.current();
        setStates((current) => ({
          ...current,
          [key]: {
            requestKey,
            messages: [],
            loading: false,
            available: false,
            error: 'Could not load messages. Check your access and connection, then retry.',
          },
        }));
      });
    return () => controller.abort();
  }, [api, workspaceId, officeId, key, conversation, connected, attempt, requestKey]);

  const cached = states[key];
  const state = cached?.requestKey === requestKey ? cached : EMPTY;
  const messages: ChatMessage[] = mergeSpaceMessages(
    state.messages,
    (events[realtimeKey] ?? []).filter((message) =>
      messageBelongsTo(message, conversation, selfId),
    ),
  ).map((message) => ({
    id: message.id,
    participantId: message.senderId,
    userId: message.senderId,
    name: message.senderName,
    text: message.text,
    createdAt: message.createdAt,
    channel: conversation.kind === 'channel' ? 'channel' : 'dm',
    channelId: conversation.kind === 'channel' ? conversation.id : undefined,
    dmKey:
      conversation.kind === 'dm'
        ? `dm:${[selfId, conversation.userId].sort().join(':')}`
        : undefined,
  }));

  async function send(text: string) {
    if (sending.current.has(key)) throw new Error('send_in_progress');
    sending.current.add(key);
    const previous = pending.current.get(key);
    const message = previous?.text === text ? previous : { text, id: crypto.randomUUID() };
    pending.current.set(key, message);
    try {
      const sent = await api.sendSpaceMessage(workspaceId, officeId, conversation, {
        clientMessageId: message.id,
        text,
      });
      setStates((current) => ({
        ...current,
        [key]: {
          ...(current[key] ?? EMPTY),
          messages: mergeSpaceMessages(current[key]?.messages ?? [], [sent]),
          error: '',
        },
      }));
      pending.current.delete(key);
      setDrafts((current) => (current[key]?.trim() === text ? { ...current, [key]: '' } : current));
    } catch (error) {
      const denied =
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403 || error.status === 404);
      if (error instanceof ApiError && error.status === 401) unauthorized.current();
      setStates((current) => ({
        ...current,
        [key]: {
          ...(current[key] ?? EMPTY),
          ...(denied ? { messages: [], available: false } : {}),
          error: denied
            ? 'This conversation is no longer available. Retry to check access.'
            : 'Your message could not be sent. Press Send to retry.',
        },
      }));
      throw error;
    } finally {
      sending.current.delete(key);
    }
  }
  return {
    conversation,
    directoryError,
    select: setConversation,
    users,
    messages: state.available ? messages : [],
    draft: drafts[key] ?? '',
    setDraft: (text: string) => setDrafts((current) => ({ ...current, [key]: text })),
    send,
    available: state.available,
    status: state.loading ? 'Loading recent messages…' : state.error,
    retry: () => setAttempt((value) => value + 1),
    key,
  };
}

export type SpaceChat = ReturnType<typeof useSpaceChat>;
