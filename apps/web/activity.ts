import type { CalendarEvent, Channel, ChatMessage } from './types';
import { locale, t } from './i18n';

export type ActivityItem = {
  id: string;
  kind: 'tip' | 'mention' | 'dm' | 'event' | 'soon';
  title: string;
  body: string;
  at: string;
  target:
    | { type: 'channel'; id: string }
    | { type: 'dm'; userId: string }
    | { type: 'event'; id: string }
    | { type: 'none' };
};

const excerpt = (text: string) =>
  text
    .replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

/** What deserves your attention, as the reference's activity feed: mentions, direct messages and meetings. */
export function activityItems({
  messages,
  channels,
  events,
  selfUserId,
  selfName,
  now,
}: {
  messages: ChatMessage[];
  channels: Channel[];
  events: CalendarEvent[];
  selfUserId: string;
  selfName: string;
  now: number;
}): ActivityItem[] {
  const first = selfName.trim().split(/\s+/)[0];
  const mention = first
    ? new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')
    : null;
  const items: ActivityItem[] = [
    {
      id: 'tip:activity',
      kind: 'tip',
      title: t('La actividad del chat vive aquí'),
      body: t('Cuando alguien te mencione, te escriba o programe una reunión, aparecerá aquí.'),
      at: '0000',
      target: { type: 'none' },
    },
  ];
  for (const message of messages) {
    if (message.userId === selfUserId || message.system) continue;
    if (message.channel === 'dm')
      items.push({
        id: `dm:${message.id}`,
        kind: 'dm',
        title: t('{name} te escribió', { name: message.name }),
        body: excerpt(message.text),
        at: message.createdAt,
        target: { type: 'dm', userId: message.userId ?? '' },
      });
    else if (message.channel === 'channel' && mention?.test(message.text))
      items.push({
        id: `mention:${message.id}`,
        kind: 'mention',
        title: t('{name} te mencionó en #{channel}', {
          name: message.name,
          channel:
            channels.find((channel) => channel.id === message.channelId)?.name ??
            message.channelId ??
            '',
        }),
        body: excerpt(message.text),
        at: message.createdAt,
        target: { type: 'channel', id: message.channelId ?? 'general' },
      });
  }
  for (const event of events) {
    const start = Date.parse(event.start),
      end = Date.parse(event.end);
    if (end < now) continue;
    if (event.organizerId !== selfUserId)
      items.push({
        id: `event:${event.id}`,
        kind: 'event',
        title: t('{name} programó «{title}»', { name: event.organizer, title: event.title }),
        body: new Date(event.start).toLocaleString(locale(), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: 'numeric',
          minute: '2-digit',
        }),
        at: new Date(Math.min(start, now)).toISOString(),
        target: { type: 'event', id: event.id },
      });
    if (start - now <= 15 * 60_000 && start > now - 5 * 60_000)
      items.push({
        id: `soon:${event.id}`,
        kind: 'soon',
        title: t('«{title}» empieza pronto', { title: event.title }),
        body: t('A las {time}', {
          time: new Date(event.start).toLocaleTimeString(locale(), {
            hour: 'numeric',
            minute: '2-digit',
          }),
        }),
        at: new Date(now).toISOString(),
        target: { type: 'event', id: event.id },
      });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}
