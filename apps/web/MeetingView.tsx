import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AtSign,
  Info,
  Link2,
  MessageCircle,
  MicOff,
  Paperclip,
  Send,
  Smile,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ChatMessage, MeetingState, Participant } from './types';
import { locale, t } from './i18n';

export type MeetingPanel = 'chat' | 'people' | 'details' | null;

type Props = {
  reactions: { participantId: string; emoji: string }[];
  roomName: string;
  meeting: MeetingState | undefined;
  people: Participant[];
  selfId: string | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  messages: ChatMessage[];
  panel: MeetingPanel;
  online: boolean;
  onPanel: (panel: MeetingPanel) => void;
  onSend: (text: string) => void;
  onCopyLink: () => void;
};

function StreamVideo({ stream, muted }: { stream: MediaStream; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(() => {});
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} />;
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

/** Relative start time as the reference shows it ("Started Just now", "Started 5 min ago"). */
function startedLabel(startedAt: number | undefined, now: number) {
  if (!startedAt) return t('Iniciada hace un momento');
  const minutes = Math.floor((now - startedAt) / 60_000);
  if (minutes < 1) return t('Iniciada hace un momento');
  if (minutes < 60) return t('Iniciada hace {n} min', { n: minutes });
  const hours = Math.floor(minutes / 60);
  return t('Iniciada hace {h} h {m} min', { h: hours, m: minutes % 60 });
}

/** One participant tile: their camera, or their initial on a coloured disc when the camera is off. */
export function Tile({
  person,
  stream,
  self,
  reaction,
}: {
  person: Participant;
  stream?: MediaStream;
  self: boolean;
  reaction?: string;
}) {
  // Peers always negotiate a video transceiver; only a participant with the camera (or a screen) on has a picture.
  const video =
    !!stream &&
    (person.camera || person.screen) &&
    stream.getVideoTracks().some((track) => track.readyState === 'live');
  return (
    <div className={`meeting-tile${video ? ' has-video' : ''}${person.screen ? ' is-screen' : ''}`}>
      {video ? (
        <StreamVideo stream={stream!} muted={self} />
      ) : (
        <span className="meeting-tile-avatar" style={{ background: person.color }}>
          <span>{initial(person.name)}</span>
        </span>
      )}
      <span className="meeting-tile-name">
        {!person.mic && <MicOff size={12} />}
        {person.name}
        {person.handRaised && ' ✋'}
      </span>
      {reaction && (
        <span key={reaction} className="meeting-tile-reaction">
          {reaction}
        </span>
      )}
    </div>
  );
}

/** The reference's full-screen meeting view: participant mosaic, side panel (chat, people, details) and the meeting tools. */
export default function MeetingView({
  reactions,
  roomName,
  meeting,
  people,
  selfId,
  localStream,
  remoteStreams,
  messages,
  panel,
  online,
  onPanel,
  onSend,
  onCopyLink,
}: Props) {
  const [text, setText] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, panel]);
  const columns = Math.ceil(Math.sqrt(Math.max(1, people.length)));
  const rows = Math.ceil(Math.max(1, people.length) / columns);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div className={`meeting-view${panel ? ' with-panel' : ''}`}>
      <div
        className={`meeting-stage${people.length > 1 ? ' is-grid' : ''}`}
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {people.map((person) => (
          <Tile
            key={person.id}
            person={person}
            self={person.id === selfId}
            stream={person.id === selfId ? (localStream ?? undefined) : remoteStreams[person.id]}
            reaction={reactions.filter((item) => item.participantId === person.id).at(-1)?.emoji}
          />
        ))}
      </div>
      {panel && (
        <aside
          className="meeting-panel"
          aria-label={
            panel === 'chat'
              ? t('Chat de la reunión')
              : panel === 'people'
                ? t('Personas')
                : t('Detalles de la reunión')
          }
        >
          <header>
            <p>
              {panel === 'chat'
                ? t('Chat de la reunión')
                : panel === 'people'
                  ? t('Personas')
                  : t('Detalles de la reunión')}
            </p>
            <button
              type="button"
              className="meeting-panel-close"
              aria-label={t('Cerrar panel')}
              title={t('Cerrar panel')}
              onClick={() => onPanel(null)}
            >
              <X size={16} />
            </button>
          </header>
          {panel === 'chat' && (
            <>
              <div className="meeting-chat-history">
                <div className="meeting-chat-spacer" />
                {messages.map((message) =>
                  message.system ? (
                    <div className="meeting-chat-system" key={message.id}>
                      <span
                        className="meeting-chat-dot"
                        style={{
                          background: people.find((person) => person.id === message.participantId)
                            ?.color,
                        }}
                      >
                        {initial(message.name)}
                      </span>
                      <strong>{message.name}</strong> {t(message.text)}
                    </div>
                  ) : (
                    <div
                      className={`meeting-chat-message${message.participantId === selfId ? ' own' : ''}`}
                      key={message.id}
                    >
                      <div>
                        <strong>{message.name}</strong>
                        <time>
                          {new Date(message.createdAt).toLocaleTimeString(locale(), {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                      <p>{message.text}</p>
                    </div>
                  ),
                )}
                <div ref={end} />
              </div>
              <form className="meeting-composer" onSubmit={submit}>
                <input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={t('Mensaje a {name}', { name: roomName })}
                  aria-label={t('Mensaje a {name}', { name: roomName })}
                  maxLength={1000}
                  disabled={!online}
                />
                <div>
                  <button
                    type="button"
                    aria-label={t('Adjuntar archivo')}
                    title={t('Adjuntar archivo')}
                    disabled
                  >
                    <Paperclip size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t('Mencionar')}
                    title={t('Mencionar')}
                    onClick={() => setText((value) => `${value}@`)}
                  >
                    <AtSign size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t('Emoji')}
                    title={t('Emoji')}
                    onClick={() => setText((value) => `${value}🙂`)}
                  >
                    <Smile size={16} />
                  </button>
                  <button
                    type="submit"
                    className="meeting-send"
                    aria-label={t('Enviar mensaje')}
                    title={t('Enviar mensaje')}
                    disabled={!online || !text.trim()}
                  >
                    <Send size={15} />
                  </button>
                </div>
              </form>
            </>
          )}
          {panel === 'people' && (
            <div className="meeting-panel-body">
              <div className="meeting-panel-actions">
                <button type="button" className="primary" onClick={onCopyLink}>
                  <UserPlus size={15} />
                  {t('Añadir personas')}
                </button>
                <button type="button" className="meeting-secondary" onClick={onCopyLink}>
                  <Link2 size={15} />
                  {t('Enlace de la reunión')}
                </button>
              </div>
              <div className="meeting-people-heading">
                <span>{t('Aquí ahora')}</span>
                <span className="meeting-count">{people.length}</span>
              </div>
              <ul className="meeting-people">
                {people.map((person) => (
                  <li key={person.id}>
                    <span className="meeting-person-avatar" style={{ background: person.color }}>
                      {initial(person.name)}
                      <i className={`status-dot ${person.status}`} />
                    </span>
                    <span>
                      {person.name}
                      {person.id === selfId ? t(' (tú)') : ''}
                    </span>
                    {!person.mic && <MicOff size={14} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {panel === 'details' && (
            <div className="meeting-panel-body">
              <button type="button" className="meeting-secondary wide" onClick={onCopyLink}>
                <Link2 size={15} />
                {t('Enlace de la reunión')}
              </button>
              <dl className="meeting-details">
                <div>
                  <dt>{t('Inicio')}</dt>
                  <dd>{startedLabel(meeting?.startedAt, now)}</dd>
                </div>
                <div>
                  <dt>{t('Sala')}</dt>
                  <dd>{roomName}</dd>
                </div>
                <div>
                  <dt>{t('Personas')}</dt>
                  <dd>{t('{n} aquí', { n: people.length })}</dd>
                </div>
                <div>
                  <dt>{t('Acceso')}</dt>
                  <dd>
                    {meeting?.locked
                      ? t('Privada: nadie más puede entrar')
                      : t('Abierta: otras personas pueden unirse')}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </aside>
      )}
      <div className="meeting-corner" aria-label={t('Paneles de la reunión')}>
        <button
          type="button"
          className={panel === 'details' ? 'is-active' : ''}
          aria-label={t('Detalles de la reunión')}
          title={t('Detalles de la reunión')}
          aria-pressed={panel === 'details'}
          onClick={() => onPanel(panel === 'details' ? null : 'details')}
        >
          <Info size={18} />
        </button>
        <button
          type="button"
          className={panel === 'people' ? 'is-active' : ''}
          aria-label={t('Personas')}
          title={t('Personas')}
          aria-pressed={panel === 'people'}
          onClick={() => onPanel(panel === 'people' ? null : 'people')}
        >
          <Users size={18} />
          <span className="meeting-badge">{people.length}</span>
        </button>
        <button
          type="button"
          className={panel === 'chat' ? 'is-active' : ''}
          aria-label={t('Chat de la reunión')}
          title={t('Chat de la reunión')}
          aria-pressed={panel === 'chat'}
          onClick={() => onPanel(panel === 'chat' ? null : 'chat')}
        >
          <MessageCircle size={18} />
        </button>
      </div>
    </div>
  );
}
