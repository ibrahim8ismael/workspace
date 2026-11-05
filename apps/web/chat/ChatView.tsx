import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AtSign,
  Bold,
  Code,
  Hash,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreVertical,
  Paperclip,
  Quote,
  Radio,
  Send,
  Smile,
  SquareCode,
  Strikethrough,
  User,
} from 'lucide-react';
import type { Channel, ChatMessage, DirectoryUser, Participant } from '../types';
import { applyFormat, renderMessage } from './markdown';
import { locale, t } from '../i18n';

/** A conversation the chat view can show: a company channel, a direct message, or the nearby chat. */
export type Conversation =
  { kind: 'channel'; id: string } | { kind: 'dm'; userId: string } | { kind: 'nearby' };
export const conversationKey = (conversation: Conversation, selfUserId: string) =>
  conversation.kind === 'channel'
    ? `channel:${conversation.id}`
    : conversation.kind === 'dm'
      ? `dm:${[selfUserId, conversation.userId].sort().join(':')}`
      : 'nearby';
export const messageKey = (message: ChatMessage) =>
  message.channel === 'channel'
    ? `channel:${message.channelId}`
    : message.channel === 'dm'
      ? (message.dmKey ?? '')
      : message.channel;

const EMOJI = ['🙂', '😂', '👍', '🎉', '❤️', '👀', '🙏', '🔥', '✅', '☕'];
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';
const sameGroup = (a: ChatMessage, b: ChatMessage) =>
  a.userId === b.userId &&
  !a.system &&
  !b.system &&
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() < 5 * 60_000;
const dayLabel = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return t('Hoy');
  if (date.toDateString() === yesterday.toDateString()) return t('Ayer');
  return date.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
};

type Props = {
  conversation: Conversation;
  channels: Channel[];
  users: DirectoryUser[];
  participants: Participant[];
  selfUserId: string;
  messages: ChatMessage[];
  online: boolean;
  draft: string;
  onDraft: (text: string) => void;
  onSend: (text: string) => void;
  onTopic: (channelId: string, topic: string) => void;
};

/** The reference's chat page: header, conversation introduction, grouped messages and a formatting composer. */
export default function ChatView({
  conversation,
  channels,
  users,
  participants,
  selfUserId,
  messages,
  online,
  draft,
  onDraft,
  onSend,
  onTopic,
}: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topic, setTopic] = useState('');
  const channel =
    conversation.kind === 'channel'
      ? channels.find((candidate) => candidate.id === conversation.id)
      : undefined;
  const other =
    conversation.kind === 'dm'
      ? users.find((user) => user.userId === conversation.userId)
      : undefined;
  const onlineIds = new Set(participants.map((person) => person.userId));
  const names = useMemo(() => users.map((user) => user.name), [users]);
  const title =
    conversation.kind === 'channel'
      ? (channel?.name ?? conversation.id)
      : conversation.kind === 'dm'
        ? `${other?.name ?? t('Persona')}${conversation.userId === selfUserId ? t(' (tú)') : ''}`
        : t('Cerca de ti');
  const placeholder =
    conversation.kind === 'channel'
      ? t('Mensaje a {name}', { name: title })
      : conversation.kind === 'dm'
        ? t('Mensaje a {name}', { name: other?.name ?? t('esta persona') })
        : t('Mensaje a quienes están cerca');
  const colorOf = (message: ChatMessage) =>
    users.find((user) => user.userId === message.userId)?.color ??
    participants.find((person) => person.id === message.participantId)?.color ??
    '#7968e6';

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, conversation]);
  useEffect(() => {
    box.current?.focus();
    setEditingTopic(false);
    setMenuOpen(false);
  }, [conversation]);

  const send = () => {
    if (!draft.trim() || !online) return;
    onSend(draft.trim());
    onDraft('');
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
    if ((event.metaKey || event.ctrlKey) && ['b', 'i'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      format(event.key.toLowerCase() === 'b' ? 'bold' : 'italic');
    }
  };
  const format = (kind: Parameters<typeof applyFormat>[2]) => {
    const element = box.current;
    if (!element) return;
    const next = applyFormat(element, draft, kind);
    onDraft(next.text);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(next.from, next.to);
    });
  };
  const insert = (text: string) => {
    const element = box.current;
    const at = element?.selectionStart ?? draft.length;
    onDraft(draft.slice(0, at) + text + draft.slice(element?.selectionEnd ?? at));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(at + text.length, at + text.length);
    });
  };

  const header =
    conversation.kind === 'channel' ? (
      <>
        <Hash size={18} />
        <span>{title}</span>
      </>
    ) : conversation.kind === 'dm' ? (
      <>
        <span className="chat-avatar small" style={{ background: other?.color }}>
          {initial(other?.name ?? '?')}
          <i
            className={`status-dot ${onlineIds.has(conversation.userId) ? 'available' : 'away'}`}
          />
        </span>
        <span>{title}</span>
      </>
    ) : (
      <>
        <Radio size={18} />
        <span>{title}</span>
      </>
    );
  const members =
    conversation.kind === 'channel'
      ? users
      : conversation.kind === 'dm'
        ? users.filter((user) => user.userId === conversation.userId || user.userId === selfUserId)
        : [];
  const here = members.filter((user) => onlineIds.has(user.userId));

  return (
    <section className="chat-view" aria-label={t('Conversación: {name}', { name: title })}>
      <header className="chat-view-header">
        <button
          type="button"
          className="chat-title"
          onClick={() =>
            conversation.kind === 'channel' &&
            (setTopic(channel?.topic ?? ''), setEditingTopic(true))
          }
          title={conversation.kind === 'channel' ? t('Editar la descripción del canal') : title}
        >
          {header}
        </button>
        {conversation.kind !== 'nearby' && (
          <div className="chat-header-tools">
            <div
              className="chat-members"
              title={t('{online} en línea · {total} miembros', {
                online: here.length,
                total: members.length,
              })}
            >
              <span className="chat-members-online">
                {here.slice(0, 3).map((user) => (
                  <span
                    key={user.userId}
                    className="chat-avatar tiny"
                    style={{ background: user.color }}
                  >
                    {initial(user.name)}
                  </span>
                ))}
                <b>{here.length}</b>
                <i className="status-dot available" />
              </span>
              <span className="chat-members-total">
                <User size={13} />
                {members.length}
              </span>
            </div>
            <div className="chat-menu-wrap">
              <button
                type="button"
                className="chat-icon"
                aria-label={t('Más opciones')}
                title={t('Más opciones')}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="chat-menu" role="menu">
                  {conversation.kind === 'channel' && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setTopic(channel?.topic ?? '');
                        setEditingTopic(true);
                        setMenuOpen(false);
                      }}
                    >
                      {t('Editar descripción')}
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        `${location.origin}/?room=${new URLSearchParams(location.search).get('room') ?? ''}`,
                      );
                      setMenuOpen(false);
                    }}
                  >
                    {t('Copiar enlace de la oficina')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>
      <div className="chat-scroll">
        <div className="chat-intro">
          {conversation.kind === 'channel' && (
            <>
              <h2>{t('Bienvenido a #{name}', { name: title })}</h2>
              {editingTopic ? (
                <form
                  className="chat-topic-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onTopic(conversation.id, topic);
                    setEditingTopic(false);
                  }}
                >
                  <input
                    autoFocus
                    value={topic}
                    maxLength={160}
                    onChange={(event) => setTopic(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingTopic(false);
                    }}
                    placeholder={t('Añade una descripción')}
                    aria-label={t('Descripción del canal')}
                  />
                  <button className="primary" type="submit">
                    {t('Guardar')}
                  </button>
                </form>
              ) : (
                <p>
                  {channel?.topic
                    ? t(channel.topic)
                    : t('Este canal todavía no tiene descripción.')}
                </p>
              )}
            </>
          )}
          {conversation.kind === 'dm' && (
            <>
              <span className="chat-avatar large" style={{ background: other?.color }}>
                {initial(other?.name ?? '?')}
              </span>
              <h2>{conversation.userId === selfUserId ? t('Este es tu espacio') : other?.name}</h2>
              <p>
                {conversation.userId === selfUserId
                  ? t('Escribe notas, enlaces o borradores. Solo tú puedes verlos.')
                  : t(
                      'Esta es tu conversación privada con {name}. Solo ustedes dos pueden verla.',
                      { name: other?.name ?? t('esta persona') },
                    )}
              </p>
            </>
          )}
          {conversation.kind === 'nearby' && (
            <>
              <h2>{t('Cerca de ti')}</h2>
              <p>
                {t(
                  'Los mensajes llegan solo a quienes están en tu zona de conversación. No se guardan.',
                )}
              </p>
            </>
          )}
        </div>
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay =
            !previous ||
            new Date(previous.createdAt).toDateString() !==
              new Date(message.createdAt).toDateString();
          const grouped = !newDay && previous && sameGroup(previous, message);
          const time = new Date(message.createdAt).toLocaleTimeString(locale(), {
            hour: 'numeric',
            minute: '2-digit',
          });
          return (
            <div key={message.id}>
              {newDay && (
                <div className="chat-day">
                  <span>{dayLabel(new Date(message.createdAt))}</span>
                </div>
              )}
              <article
                className={`chat-message${grouped ? ' is-grouped' : ''}${message.userId === selfUserId ? ' is-own' : ''}`}
              >
                {grouped ? (
                  <time className="chat-gutter-time">{time}</time>
                ) : (
                  <span className="chat-avatar" style={{ background: colorOf(message) }}>
                    {initial(message.name)}
                  </span>
                )}
                <div>
                  {!grouped && (
                    <header>
                      <strong>{message.name}</strong>
                      <time>{time}</time>
                    </header>
                  )}
                  <div className="chat-body">{renderMessage(message.text, names)}</div>
                </div>
              </article>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          ref={box}
          rows={1}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={keyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={4000}
          disabled={!online}
        />
        <div className="chat-toolbar">
          <button
            type="button"
            title={t('Adjuntar archivo (próximamente)')}
            aria-label={t('Adjuntar archivo')}
            disabled
          >
            <Paperclip size={16} />
          </button>
          <button
            type="button"
            title={t('Mencionar')}
            aria-label={t('Mencionar')}
            onClick={() => insert('@')}
          >
            <AtSign size={16} />
          </button>
          <span className="chat-emoji-wrap">
            <button
              type="button"
              title={t('Emoji')}
              aria-label={t('Emoji')}
              aria-expanded={emojiOpen}
              onClick={() => setEmojiOpen((open) => !open)}
            >
              <Smile size={16} />
            </button>
            {emojiOpen && (
              <span className="chat-emoji" role="menu">
                {EMOJI.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    onClick={() => {
                      insert(emoji);
                      setEmojiOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </span>
            )}
          </span>
          <i className="chat-toolbar-divider" />
          <button
            type="button"
            title={t('Negrita (⌘ B)')}
            aria-label={t('Negrita')}
            onClick={() => format('bold')}
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            title={t('Cursiva (⌘ I)')}
            aria-label={t('Cursiva')}
            onClick={() => format('italic')}
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            title={t('Tachado')}
            aria-label={t('Tachado')}
            onClick={() => format('strike')}
          >
            <Strikethrough size={16} />
          </button>
          <button
            type="button"
            title={t('Enlace')}
            aria-label={t('Enlace')}
            onClick={() => format('link')}
          >
            <Link2 size={16} />
          </button>
          <button
            type="button"
            title={t('Lista numerada')}
            aria-label={t('Lista numerada')}
            onClick={() => format('ol')}
          >
            <ListOrdered size={16} />
          </button>
          <button
            type="button"
            title={t('Lista con viñetas')}
            aria-label={t('Lista con viñetas')}
            onClick={() => format('ul')}
          >
            <List size={16} />
          </button>
          <button
            type="button"
            title={t('Cita')}
            aria-label={t('Cita')}
            onClick={() => format('quote')}
          >
            <Quote size={16} />
          </button>
          <button
            type="button"
            title={t('Código')}
            aria-label={t('Código')}
            onClick={() => format('code')}
          >
            <Code size={16} />
          </button>
          <button
            type="button"
            title={t('Bloque de código')}
            aria-label={t('Bloque de código')}
            onClick={() => format('codeblock')}
          >
            <SquareCode size={16} />
          </button>
          <button
            type="submit"
            className="chat-send"
            title={t('Enviar (Intro)')}
            aria-label={t('Enviar mensaje')}
            disabled={!online || !draft.trim()}
          >
            <Send size={15} />
          </button>
        </div>
      </form>
    </section>
  );
}
