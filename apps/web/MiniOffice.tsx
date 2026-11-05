import type { ReactNode } from 'react';
import { ChevronDown, MapPin, PictureInPicture2 } from 'lucide-react';
import { AREAS, WORLD } from '../shared/vivo-map.js';
import type { Participant } from './types';
import { t } from './i18n';

/** The office shrunk into the side panel while another view (chat, calendar) is open, as the reference does. */
export default function MiniOffice({
  label,
  participants,
  selfId,
  onOpen,
  children,
}: {
  label: string;
  participants: Participant[];
  selfId: string | null;
  onOpen: () => void;
  children: ReactNode;
}) {
  const self = participants.find((person) => person.id === selfId);
  return (
    <div className="mini-office">
      <div className="mini-office-head">
        <MapPin size={12} />
        <span>{label}</span>
        <button
          type="button"
          aria-label={t('Volver a la oficina')}
          title={t('Volver a la oficina')}
          onClick={onOpen}
        >
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          aria-label={t('Abrir la oficina')}
          title={t('Abrir la oficina')}
          onClick={onOpen}
        >
          <PictureInPicture2 size={13} />
        </button>
      </div>
      <button
        type="button"
        className="mini-office-map"
        aria-label={t('Abrir la oficina')}
        onClick={onOpen}
      >
        <svg
          viewBox={`0 0 ${WORLD.width} ${WORLD.height}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {AREAS.filter((area) => area.walls).map((area) => (
            <rect
              key={area.id}
              x={area.x * 32}
              y={area.y * 32}
              width={area.w * 32}
              height={area.h * 32}
              fill="none"
              stroke="#ffffff33"
              strokeWidth="14"
            />
          ))}
          {self && (
            <circle
              cx={self.x}
              cy={self.y}
              r="190"
              fill="none"
              stroke="#ffffff26"
              strokeWidth="8"
              strokeDasharray="30 30"
            />
          )}
          {participants.map((person) => (
            <circle
              key={person.id}
              cx={person.x}
              cy={person.y}
              r={person.id === selfId ? 26 : 20}
              fill={person.id === selfId ? '#39d98a' : '#d0c7ef'}
            />
          ))}
        </svg>
      </button>
      {children}
    </div>
  );
}
