import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2, Video, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { locale, t } from '../i18n';

const HOUR = 56; // px per hour, as in the reference week view
const dayName = (date: Date) =>
  date.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '');
const startOfWeek = (date: Date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - day.getDay());
  return day;
};
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export const timeRange = (event: CalendarEvent) => {
  const start = new Date(event.start),
    end = new Date(event.end);
  const format = (date: Date) =>
    date.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  return `${format(start)} – ${format(end)}`;
};

type Props = {
  events: CalendarEvent[];
  roomName: (areaId: string) => string;
  selfUserId: string;
  selected: string | null;
  online: boolean;
  onSelect: (id: string | null) => void;
  onNew: (start: Date) => void;
  onJoin: (areaId: string) => void;
  onDelete: (id: string) => void;
};

/** The reference's week view: navigation, today, a red "now" line, events as tinted blocks, and event details. */
export default function CalendarView({
  events,
  roomName,
  selfUserId,
  selected,
  online,
  onSelect,
  onNew,
  onJoin,
  onDelete,
}: Props) {
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (scroller.current)
      scroller.current.scrollTop = Math.max(0, (Math.min(now.getHours(), 16) - 1) * HOUR);
  }, []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(week, index)), [week]);
  const month = (() => {
    const first = days[0],
      last = days[6];
    const name = (date: Date) => date.toLocaleDateString(locale(), { month: 'long' });
    return first.getMonth() === last.getMonth()
      ? `${name(first)} ${first.getFullYear()}`
      : `${name(first)} – ${name(last)} ${last.getFullYear()}`;
  })();
  const event = events.find((candidate) => candidate.id === selected);

  return (
    <section className="calendar-view" aria-label={t('Calendario')}>
      <header className="calendar-head">
        <button
          type="button"
          className="calendar-nav"
          aria-label={t('Semana anterior')}
          title={t('Semana anterior')}
          onClick={() => setWeek((value) => addDays(value, -7))}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="calendar-nav"
          aria-label={t('Semana siguiente')}
          title={t('Semana siguiente')}
          onClick={() => setWeek((value) => addDays(value, 7))}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className="calendar-today"
          onClick={() => setWeek(startOfWeek(new Date()))}
        >
          {t('Hoy')}
        </button>
        <p className="calendar-month">{month.charAt(0).toUpperCase() + month.slice(1)}</p>
        <span className="calendar-sync">
          <RefreshCw size={13} />
          {t('Hace un momento')}
        </span>
        <span className="calendar-source">
          <i />
          {t('Calendario de la oficina')}
        </span>
        <button
          type="button"
          className="primary calendar-new"
          disabled={!online}
          onClick={() => {
            const start = new Date();
            start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
            onNew(start);
          }}
        >
          <Plus size={15} />
          {t('Nueva reunión')}
        </button>
      </header>
      <div className="calendar-days" aria-hidden="true">
        <span />
        {days.map((day) => (
          <div key={day.toISOString()} className={sameDay(day, now) ? 'is-today' : ''}>
            <span>{dayName(day)}</span>
            <b>{day.getDate()}</b>
          </div>
        ))}
      </div>
      <div className="calendar-grid" ref={scroller}>
        <div className="calendar-hours">
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} style={{ top: hour * HOUR }}>
              {hour === 0 ? (
                ''
              ) : (
                <>
                  {hour % 12 || 12}
                  <small>{hour < 12 ? 'AM' : 'PM'}</small>
                </>
              )}
            </span>
          ))}
        </div>
        {days.map((day) => {
          const dayEvents = events
            .filter((candidate) => sameDay(new Date(candidate.start), day))
            .sort((a, b) => a.start.localeCompare(b.start));
          return (
            <div
              key={day.toISOString()}
              className="calendar-column"
              onDoubleClick={(click) => {
                if (!online) return;
                const box = click.currentTarget.getBoundingClientRect();
                const minutes = Math.floor(((click.clientY - box.top) / HOUR) * 2) * 30;
                const start = new Date(day);
                start.setMinutes(minutes);
                onNew(start);
              }}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <i key={hour} style={{ top: hour * HOUR }} />
              ))}
              {dayEvents.map((item) => {
                const start = new Date(item.start),
                  end = new Date(item.end);
                const top = (start.getHours() + start.getMinutes() / 60) * HOUR,
                  height = Math.max(22, ((end.getTime() - start.getTime()) / 3_600_000) * HOUR - 2);
                const past = end < now;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`calendar-event${past ? ' is-past' : ''}${selected === item.id ? ' is-selected' : ''}`}
                    style={{ top: top + 1, height }}
                    onClick={(click) => {
                      click.stopPropagation();
                      onSelect(item.id);
                    }}
                    onDoubleClick={(click) => click.stopPropagation()}
                  >
                    <p>{item.title}</p>
                    <span>{timeRange(item)}</span>
                  </button>
                );
              })}
              {sameDay(day, now) && (
                <div
                  className="calendar-now"
                  style={{ top: (now.getHours() + now.getMinutes() / 60) * HOUR }}
                >
                  <b>{now.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' })}</b>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {event && (
        <aside className="calendar-detail" role="dialog" aria-label={event.title}>
          <header>
            <h2>{event.title}</h2>
            <button
              type="button"
              aria-label={t('Cerrar')}
              title={t('Cerrar')}
              onClick={() => onSelect(null)}
            >
              <X size={16} />
            </button>
          </header>
          <p className="calendar-detail-time">
            {new Date(event.start).toLocaleDateString(locale(), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}{' '}
            · {timeRange(event)}
          </p>
          {event.areaId && (
            <p className="calendar-detail-room">
              <Video size={14} />
              {roomName(event.areaId)}
            </p>
          )}
          {event.description && <p className="calendar-detail-description">{event.description}</p>}
          <p className="calendar-detail-organizer">
            {t('Organiza {name}', { name: event.organizer })}
          </p>
          <div className="calendar-detail-actions">
            {event.areaId && (
              <button
                type="button"
                className="primary"
                disabled={!online}
                onClick={() => onJoin(event.areaId!)}
              >
                <Video size={15} />
                {t('Unirse')}
              </button>
            )}
            {event.organizerId === selfUserId && (
              <button
                type="button"
                className="meeting-secondary"
                onClick={() => onDelete(event.id)}
              >
                <Trash2 size={15} />
                {t('Cancelar reunión')}
              </button>
            )}
          </div>
        </aside>
      )}
    </section>
  );
}
