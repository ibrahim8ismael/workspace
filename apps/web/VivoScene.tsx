import { useEffect, useMemo, useRef, useState } from 'react';
import { DoorOpen, Headphones, Sofa } from 'lucide-react';
import { floorMaterial, playStep } from './footsteps';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { EditItem, FocusRoom, OfficeObject, Participant, Facing } from './types';
import './scene.css';
import { AREAS, TILE, WORLD } from '../shared/vivo-map.js';
import { stepTraffic, vehicleOnTile, VEHICLES_ON_STREET } from './traffic';
import { DOORWAYS, WALLS } from '../shared/vivo-geometry.js';
import { getOfficeSeats } from '../shared/office-seats.js';
import {
  asMapObject,
  baseAsEditorObject,
  catalogEntry,
  effectiveBaseObjects,
  type Overrides,
} from '../shared/office-objects.js';
import {
  deskAt,
  FOCUS_ROOMS,
  focusRoomOf,
  MEETING_ROOMS,
  meetingRoomAt,
  meetingRoomOf,
  type MeetingArea,
} from '../shared/office-meetings.js';
import type { Interaction, Meetings } from './types';
import {
  blockedWith,
  canStep,
  findTilePath,
  nearestFreeTile,
  RUN_STEP_MS,
  sameTile,
  STEP_MS,
  tileCenter,
  tileOf,
  type Blocked,
  type Point,
  type Tile,
} from './navigation';
import { FloorPatterns, floorKey, floorPatternId } from './sprites/floors';
import { DoorwayPiece, WallPiece, WALL_HEIGHT } from './sprites/walls';
import { ObjectArt, ObjectForeground, hasForeground, type MapObjectData } from './sprites/objects';
import { AVATAR_FRAME_URLS, AVATAR_SPRITE, avatarFrame, walkFrameAt } from './avatarSprite';
import { t } from './i18n';
import { lookFrames, lookKey, sanitizeLook } from './avatarLook';

type Seat = ReturnType<typeof getOfficeSeats>[number];
type Props = {
  participants: Participant[];
  selfId: string | null;
  objects: OfficeObject[];
  zoom: number;
  simplified: boolean;
  editItem: EditItem | null;
  selectedObject: string | null;
  editorOpen: boolean;
  overrides: Overrides;
  navigationTarget?: Point & { nonce: number };
  resetViewKey?: number;
  onMove: (x: number, y: number) => void;
  /** Server-authoritative movement intent, emitted for each local navigation step. */
  onMovementIntent?: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
  onPlace: (x: number, y: number, free?: boolean) => void;
  onSelect: (id: string) => void;
  onSelectObject: (id: string | null) => void;
  onMoveObject: (id: string, x: number, y: number, free?: boolean) => void;
  onRemove: (id: string) => void;
  meetings: Meetings;
  areaNames: Record<string, string>;
  interactions?: Record<string, Interaction>;
  onNearInteractive?: (id: string | null) => void;
  onInteract?: (id: string) => void;
  reactions?: { participantId: string; emoji: string }[];
  seatTarget?: { seatId: string; nonce: number };
  onAreaClick: (areaId: string) => void;
  /** Wheel zoom: the scene asks for a new zoom level and keeps the point under the cursor in place. */
  onZoom?: (zoom: number) => void;
  /** Who each desk belongs to, shown when hovering a desk. */
  deskLabels?: Record<string, string>;
  /** Occupied focus offices; a closed one blocks everyone outside who was not let in. */
  focusRooms?: Record<string, FocusRoom>;
  /** Clicking a closed focus office from outside. */
  onFocusClosed?: (areaId: string) => void;
  /** Place and move furniture at the exact pointer position instead of the grid (also while holding Alt). */
  freePlacement?: boolean;
  onSit: (id: string) => void;
  onStand: () => void;
};
type Layer = { key: string; y: number; order: number; node: ReactNode };
export const MIN_ZOOM = 0.45;
/** Below this zoom the office switches to the simplified view, as the reference does when you zoom out. */
export const SIMPLE_BELOW = 0.74;
type Motion = { facing: Facing; moving: boolean; frame: number };
type Remote = { from: Point; to: Point; startedAt: number; facing: Facing; lastMoved: number };

const STATUS_COLOR: Record<Participant['status'], string> = {
  available: '#3ac07a',
  busy: '#e4484f',
  away: '#9b9da9',
  focus: '#aa99ee',
};
const STATUS_LABEL_SOURCE: Record<Participant['status'], string> = {
  available: 'Activo',
  busy: 'Ocupado',
  away: 'Ausente',
  focus: 'No molestar',
};
/** Status labels, translated each time they are read so a language change applies at once. */
const STATUS_LABEL = Object.defineProperties(
  {} as Record<Participant['status'], string>,
  Object.fromEntries(
    Object.entries(STATUS_LABEL_SOURCE).map(([key, value]) => [
      key,
      { enumerable: true, get: () => t(value) },
    ]),
  ),
);
const KEY_DIRECTION: Record<string, [number, number, Facing]> = {
  arrowup: [0, -1, 'north'],
  w: [0, -1, 'north'],
  arrowdown: [0, 1, 'south'],
  s: [0, 1, 'south'],
  arrowleft: [-1, 0, 'west'],
  a: [-1, 0, 'west'],
  arrowright: [1, 0, 'east'],
  d: [1, 0, 'east'],
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const typing = (target: EventTarget | null) =>
  target instanceof Element &&
  (target.matches('input, textarea, select, button, a, [role="button"]') ||
    target.closest('button, a, [role="button"]') !== null ||
    (target instanceof HTMLElement && target.isContentEditable));
const facingFor = (dx: number, dy: number): Facing =>
  Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'south' : 'north';
const footOf = (point: Point) => ({ x: point.x, y: point.y + TILE / 2 - 2 });

/** Objects placed on another object (mugs on tables, laptops on desks) draw just after their parent. */
/** Wall bands sort like in the reference: a north face hides whoever stands on the row above it and shows whoever stands on its own row;
    a south face hides the bottom row of its room and shows the row below. Objects hung on a wall sort just above its face. */
const N_WALL_DEPTH = (ty: number) => ty * TILE;
const S_WALL_DEPTH = (ty: number) => (ty + 1) * TILE + 4;
const WALL_BANDS = WALLS.filter(
  (wall) => !wall.open && (wall.side.startsWith('n') || wall.side.startsWith('s')),
);
function wallMountDepth(object: MapObjectData): number | null {
  if (object.blocks?.length || object.seat?.length) return null;
  const tx = Math.floor((object.x - object.originX + object.w / 2) / TILE);
  let depth: number | null = null; // adjoining rooms share a wall line: hang the object above every band it overlaps
  for (const wall of WALL_BANDS) {
    if (wall.tx !== tx) continue;
    if (
      wall.side.startsWith('n') &&
      object.y >= wall.ty * TILE - WALL_HEIGHT &&
      object.y < N_WALL_DEPTH(wall.ty) + 2
    )
      depth = Math.max(
        depth ?? 0,
        N_WALL_DEPTH(wall.ty) + 0.5 + (object.y - wall.ty * TILE + WALL_HEIGHT) / 1000,
      );
    if (
      wall.side.startsWith('s') &&
      object.y >= wall.ty * TILE - TILE &&
      object.y < S_WALL_DEPTH(wall.ty) + 2
    )
      depth = Math.max(
        depth ?? 0,
        S_WALL_DEPTH(wall.ty) + 0.5 + (object.y - wall.ty * TILE + TILE) / 1000,
      );
  }
  return depth;
}
function objectDepth(object: MapObjectData, byId: Map<string, MapObjectData>, depth = 0): number {
  const parent = object.parent ? byId.get(object.parent) : undefined;
  if (parent && depth < 4) return objectDepth(parent, byId, depth + 1) + 0.01;
  return wallMountDepth(object) ?? object.y;
}

/** A base-map object: selectable in the decorator so it can be rotated, moved or removed like in the reference editor. */
function BaseObject({
  object,
  selected,
  editing,
  onSelectObject,
  onGrab,
}: {
  object: MapObjectData;
  selected: boolean;
  editing: boolean;
  onSelectObject: (id: string | null) => void;
  onGrab: (id: string, event: ReactPointerEvent<SVGGElement>) => void;
}) {
  const label = `${object.kind.replace(/-/g, ' ')} (${object.facing})`;
  return (
    <g
      className={`scene-base-object${selected ? ' is-selected' : ''}${editing ? ' is-editable' : ''}`}
      data-object-id={object.id}
      tabIndex={editing ? 0 : -1}
      role={editing ? 'button' : undefined}
      aria-label={
        editing
          ? t('{label}. Clic para seleccionar, arrastra para mover; R gira, Suprimir elimina.', {
              label,
            })
          : undefined
      }
      onPointerDown={(e) => {
        if (editing) {
          e.stopPropagation();
          onGrab(object.id, e);
        }
      }}
      onClick={(e) => {
        if (editing) e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (editing && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelectObject(object.id);
        }
      }}
    >
      {editing && <title>{label}</title>}
      <g transform={`translate(${object.x} ${object.y})`}>
        <ObjectArt object={object} />
      </g>
    </g>
  );
}
/** Static layers: floors in area depth order, then walls, doorways and furniture sorted with the avatars. */
const AREA_FLOORS = [...AREAS].sort((a, b) => a.depth - b.depth);
/** Outdoor ground touching the edge of the map (the sea, the sand) carries on beyond it, so a beach ends in open sea. */
const OUTER_GROUND = AREA_FLOORS.filter(
  (area) =>
    area.parent &&
    !area.walls &&
    area.type === 'Public' &&
    /^(Sand|Dune|Shore|Water|Road|Sidewalk)$/.test(area.floor),
).flatMap((area) => {
  const far = Math.max(WORLD.width, WORLD.height) * 2,
    x = area.x * TILE,
    y = area.y * TILE,
    w = area.w * TILE,
    h = area.h * TILE;
  const left = area.x === 0,
    right = area.x + area.w === WORLD.cols,
    bottom = area.y + area.h === WORLD.rows;
  const out: {
    id: string;
    floor: string;
    floorColor: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [];
  const base = { floor: area.floor, floorColor: area.floorColor };
  // One pixel of overlap hides the seam between the map's own ground and its continuation outside.
  if (left)
    out.push({
      id: `${area.id}-l`,
      ...base,
      x: x - far,
      y,
      w: far + 1,
      h: bottom ? h + far : h + 1,
    });
  if (right)
    out.push({
      id: `${area.id}-r`,
      ...base,
      x: x + w - 1,
      y,
      w: far + 1,
      h: bottom ? h + far : h + 1,
    });
  if (bottom) out.push({ id: `${area.id}-b`, ...base, x, y: y + h - 1, w, h: far });
  return out;
});
/** Outdoor ground keeps its colour on the minimap. */
const MINIMAP_GROUND: Record<string, string> = {
  Sand: '#cdb88a',
  Dune: '#bfae7d',
  Pier: '#8a6a4a',
  Shore: '#9fd0d8',
  Water: '#3f8fb0',
  StonePath: '#8f8b82',
  Road: '#4b4f57',
  Sidewalk: '#bdbab3',
};
/** The flat colour of an area in the minimap, also used by the simplified view when zoomed out. */
const MINIMAP_BACKGROUND = '#2b2b2b';
const minimapFill = (area: (typeof AREAS)[number]) =>
  MINIMAP_GROUND[area.floor ?? ''] ??
  (area.walls
    ? '#5a5f68'
    : area.type === 'Public' && !area.parent
      ? MINIMAP_BACKGROUND
      : '#474c55');
/** Tall north walls are drawn over the tiles behind them; a click on one means the floor right in front of it. */
const NORTH_WALLS = WALLS.filter(
  (wall) => !wall.open && (wall.side === 'n' || wall.side === 'nw' || wall.side === 'ne'),
);
function inFrontOfWall(point: Point): Tile | null {
  const wall = NORTH_WALLS.find(
    (candidate) =>
      point.x >= candidate.tx * TILE &&
      point.x < (candidate.tx + 1) * TILE &&
      point.y >= candidate.ty * TILE - WALL_HEIGHT &&
      point.y < candidate.ty * TILE,
  );
  return wall ? { tx: wall.tx, ty: wall.ty } : null;
}
const STATIC: Layer[] = [
  ...WALLS.filter((wall) => !wall.open).map((wall) => ({
    key: `wall-${wall.tx}-${wall.ty}-${wall.side}`,
    y: wall.side.startsWith('n')
      ? N_WALL_DEPTH(wall.ty)
      : wall.side.startsWith('s')
        ? S_WALL_DEPTH(wall.ty)
        : wall.ty * TILE + TILE,
    order: 0,
    node: (
      <g transform={`translate(${wall.tx * TILE} ${wall.ty * TILE})`}>
        <WallPiece side={wall.side} texture={wall.texture} open={wall.open} />
      </g>
    ),
  })),
];

function Avatar({
  person,
  self,
  facing,
  moving,
  frame,
  frames,
  reaction,
  onSelect,
}: {
  person: Participant;
  self: boolean;
  facing: Facing;
  moving: boolean;
  frame: number;
  frames?: Record<string, string>;
  reaction?: string;
  onSelect: () => void;
}) {
  const url = avatarFrame(facing, moving, frame, !!person.seatId);
  const name = person.name.length > 22 ? `${person.name.slice(0, 21)}…` : person.name;
  const width = Math.max(56, name.length * 7 + 30);
  return (
    <g
      className={`scene-avatar${self ? ' is-self' : ''}${person.status === 'away' ? ' is-away' : ''}${moving ? ' is-walking' : ''}${person.seatId ? ' is-seated' : ''}`}
      tabIndex={0}
      role="button"
      aria-label={`${person.name}${self ? t(', tú') : ''}${person.seatId ? t(', sentado') : ''}. ${STATUS_LABEL[person.status]}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <title>
        {person.name} · {STATUS_LABEL[person.status]}
      </title>
      <image
        className="pixel-resource character-resource"
        href={frames?.[url] ?? url}
        x={-AVATAR_SPRITE.foot.x * AVATAR_SPRITE.renderScale}
        y={-AVATAR_SPRITE.foot.y * AVATAR_SPRITE.renderScale}
        width={AVATAR_SPRITE.canvasSize * AVATAR_SPRITE.renderScale}
        height={AVATAR_SPRITE.canvasSize * AVATAR_SPRITE.renderScale}
      />
      <g
        className="scene-nameplate"
        transform={`translate(0 ${AVATAR_SPRITE.nameplateY})`}
        shapeRendering="auto"
      >
        <rect
          x={-width / 2}
          y="-20"
          width={width}
          height="20"
          rx="6"
          fill={self ? '#6f3fd6' : '#2b2b33'}
        />
        <circle cx={-width / 2 + 10} cy="-10" r="3" fill={STATUS_COLOR[person.status]} />
        <text x="5" y="-6" textAnchor="middle" fontSize="12" fontWeight="500" fill="#fff">
          {name}
        </text>
        {person.handRaised && (
          <text x={width / 2 + 10} y="-4" fontSize="15" textAnchor="middle">
            ✋
          </text>
        )}
      </g>
      {reaction && (
        <g transform={`translate(0 ${AVATAR_SPRITE.nameplateY - 30})`} pointerEvents="none">
          <text key={reaction} className="scene-reaction" textAnchor="middle" fontSize="22" y="0">
            {reaction}
          </text>
        </g>
      )}
    </g>
  );
}

function SeatTarget({
  seat,
  occupiedBy,
  own,
  enabled,
  onSit,
}: {
  seat: Seat;
  occupiedBy?: string;
  own: boolean;
  enabled: boolean;
  onSit: () => void;
}) {
  const disabled = !enabled || (!!occupiedBy && !own);
  const label = own
    ? t('Levantarse: {seat}', { seat: seat.label })
    : occupiedBy
      ? t('{seat}, ocupada por {name}', { seat: seat.label, name: occupiedBy })
      : t('Sentarse: {seat}', { seat: seat.label });
  return (
    <g
      className={`scene-seat${disabled ? ' is-occupied' : ''}`}
      data-seat-id={seat.id}
      data-facing={seat.facing}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onSit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) onSit();
        }
      }}
    >
      <title>{label} · Clic o E al lado de la silla</title>
      <rect
        className="seat-target"
        x={seat.tx * TILE}
        y={seat.ty * TILE - 8}
        width={TILE}
        height={TILE + 8}
        rx="4"
        fill="transparent"
      />
    </g>
  );
}

function AddedObject({
  object,
  selected,
  editing,
  onSelectObject,
  onGrab,
}: {
  object: OfficeObject;
  selected: boolean;
  editing: boolean;
  onSelectObject: (id: string | null) => void;
  onGrab: (id: string, event: ReactPointerEvent<SVGGElement>) => void;
}) {
  const data = asMapObject(object) as MapObjectData;
  const label = `${catalogEntry(object)?.kind.replace(/-/g, ' ') ?? object.kind} (${data.facing})`;
  return (
    <g
      className={`scene-added-object${selected ? ' is-selected' : ''}${editing ? ' is-editable' : ''}`}
      tabIndex={editing ? 0 : -1}
      role={editing ? 'button' : undefined}
      aria-label={
        editing
          ? t('{label}. Clic para seleccionar, arrastra para mover; R gira, Suprimir elimina.', {
              label,
            })
          : undefined
      }
      onPointerDown={(e) => {
        if (editing) {
          e.stopPropagation();
          onGrab(object.id, e);
        }
      }}
      onClick={(e) => {
        if (editing) e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (editing && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelectObject(object.id);
        }
      }}
    >
      {editing && <title>{label}</title>}
      <g transform={`translate(${data.x} ${data.y})`}>
        <ObjectArt object={data} />
      </g>
    </g>
  );
}

/** Ghost of the object being placed, following the pointer on the tile grid. */
type GhostTile = Tile & { at?: Point };
function Ghost({ item, tile }: { item: EditItem; tile: GhostTile }) {
  const data = asMapObject({
    id: 'ghost',
    ...item,
    x: tile.at?.x ?? tile.tx * TILE + TILE / 2,
    y: tile.at?.y ?? tile.ty * TILE + TILE / 2,
    free: !!tile.at,
  }) as MapObjectData;
  return (
    <g pointerEvents="none" opacity=".75">
      {(data.blocks ?? []).map(([bx, by]) => (
        <rect
          key={`${bx}-${by}`}
          x={bx * TILE}
          y={by * TILE}
          width={TILE}
          height={TILE}
          fill="#e4484f33"
          stroke="#e4484f"
          strokeWidth="1"
        />
      ))}
      {(data.seat ?? []).map(([bx, by]) => (
        <rect
          key={`s${bx}-${by}`}
          x={bx * TILE}
          y={by * TILE}
          width={TILE}
          height={TILE}
          fill="#3ac07a33"
          stroke="#3ac07a"
          strokeWidth="1"
        />
      ))}
      <g transform={`translate(${data.x} ${data.y})`}>
        <ObjectArt object={data} />
      </g>
    </g>
  );
}

/** A person in the simplified view: a round badge with their initial under the nameplate, constant on screen. */
/** The vehicles on the street. The simulation lives in traffic.ts; this only moves the sprites every frame. */
function Traffic() {
  const refs = useRef<Record<string, SVGGElement | null>>({});
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      for (const vehicle of VEHICLES_ON_STREET)
        refs.current[vehicle.id]?.setAttribute(
          'transform',
          `translate(${vehicle.x.toFixed(1)} ${vehicle.y})`,
        );
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <g pointerEvents="none" className="scene-traffic">
      {VEHICLES_ON_STREET.map((vehicle) => (
        <g
          key={vehicle.id}
          ref={(node) => {
            refs.current[vehicle.id] = node;
          }}
          transform={`translate(${vehicle.x} ${vehicle.y})`}
        >
          <image
            className="pixel-resource"
            href={`/assets/pixel/vehicles/${vehicle.kind}.png`}
            width={vehicle.w}
            height={vehicle.h}
            x={-vehicle.w / 2}
            y={0}
            transform={vehicle.direction < 0 ? 'scale(-1 1)' : undefined}
          />
        </g>
      ))}
    </g>
  );
}
function SimpleAvatar({
  person,
  self,
  x,
  y,
  scale,
}: {
  person: Participant;
  self: boolean;
  x: number;
  y: number;
  scale: number;
}) {
  const k = 1 / scale,
    name = self ? `${person.name}` : person.name,
    width = (name.length * 6.4 + 26) * k;
  return (
    <g
      className="scene-avatar scene-simple-avatar"
      transform={`translate(${x} ${y})`}
      shapeRendering="auto"
    >
      <circle
        r={12 * k}
        fill={person.color || '#f6c08f'}
        stroke={self ? '#5a4fcf' : '#ffffff'}
        strokeWidth={2.5 * k}
      />
      <text y={4.5 * k} textAnchor="middle" fontSize={12 * k} fontWeight="700" fill="#2b2b33">
        {(person.name.trim()[0] ?? '?').toUpperCase()}
      </text>
      <g transform={`translate(0 ${-17 * k})`}>
        <rect
          x={-width / 2}
          y={-18 * k}
          width={width}
          height={18 * k}
          rx={6 * k}
          fill={self ? '#5a4fcf' : '#2b2b33'}
        />
        <circle cx={-width / 2 + 9 * k} cy={-9 * k} r={3 * k} fill={STATUS_COLOR[person.status]} />
        <text
          x={5 * k}
          y={-5 * k}
          textAnchor="middle"
          fontSize={11.5 * k}
          fontWeight="500"
          fill="#fff"
        >
          {name}
        </text>
      </g>
    </g>
  );
}
/** Area markers of the simplified view: a door on meeting rooms, a sofa on lounges. */
function SimpleAreaIcons({ scale }: { scale: number }) {
  const k = 1 / scale;
  return (
    <g pointerEvents="none" shapeRendering="auto">
      {[
        ...AREAS.filter((area) => area.type === 'MeetingRoom' || area.type === 'Common'),
        ...FOCUS_ROOMS,
      ].map((area) => {
        const focus = FOCUS_ROOMS.includes(area as (typeof FOCUS_ROOMS)[number]);
        const cx = (area.x + area.w / 2) * TILE,
          cy = (area.y + area.h / 2) * TILE,
          Icon = focus ? Headphones : area.type === 'MeetingRoom' ? DoorOpen : Sofa;
        return (
          <g key={area.id} transform={`translate(${cx} ${cy})`}>
            <rect
              x={-11 * k}
              y={-11 * k}
              width={22 * k}
              height={22 * k}
              rx={5 * k}
              fill="#ffffff"
              stroke="#00000014"
              strokeWidth={k}
            />
            <Icon
              x={-7.5 * k}
              y={-7.5 * k}
              width={15 * k}
              height={15 * k}
              strokeWidth={2}
              color={focus ? '#8b6fe8' : area.type === 'MeetingRoom' ? '#3b6fe0' : '#d26be0'}
            />
          </g>
        );
      })}
    </g>
  );
}
export default function VivoScene({
  participants,
  selfId,
  objects,
  zoom,
  simplified,
  editItem,
  selectedObject,
  editorOpen,
  overrides,
  navigationTarget,
  resetViewKey,
  onMove,
  onMovementIntent,
  onPlace,
  onSelect,
  onSelectObject,
  onMoveObject,
  onSit,
  onStand,
  meetings = {},
  onZoom,
  deskLabels = {},
  focusRooms = {},
  onFocusClosed,
  freePlacement = false,
  areaNames = {},
  interactions = {},
  onNearInteractive,
  onInteract,
  reactions = [],
  seatTarget,
  onAreaClick,
}: Props) {
  const editKind = editItem ? editItem.kind : null;
  const [hoverTile, setHoverTile] = useState<GhostTile | null>(null);
  const editingMode = editorOpen || editItem !== null || selectedObject !== null;
  // Dragging an object in the decorator: the grabbed object follows the pointer on the tile grid.
  const grab = useRef<{ id: string; item: EditItem; moved: boolean; client: Point } | null>(null);
  const [dragTile, setDragTile] = useState<{ id: string; item: EditItem; tile: GhostTile } | null>(
    null,
  );
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const onGrab = (id: string, event: ReactPointerEvent<SVGGElement>) => {
    const placed = objectsRef.current.find((object) => object.id === id);
    const editorObject = placed
      ? { kind: placed.kind, color: placed.color ?? '', facing: placed.facing ?? 'Down' }
      : baseAsEditorObject(id, overridesRef.current);
    if (!editorObject) return;
    const data = placed
      ? asMapObject(placed)
      : effectiveBaseObjects(overridesRef.current).find((object) => object.id === id);
    grab.current = {
      id,
      item: {
        kind: editorObject.kind,
        color: editorObject.color ?? data?.color ?? '',
        facing: (editorObject.facing ?? 'Down') as string,
      },
      moved: false,
      client: { x: event.clientX, y: event.clientY },
    };
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
  };
  useEffect(() => {
    const images = AVATAR_FRAME_URLS.map((src) => {
      const image = new Image();
      image.src = src;
      return image;
    });
    return () => {
      images.length = 0;
    };
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  const self = participants.find((p) => p.id === selfId);
  const seats = useMemo(() => getOfficeSeats(objects, overrides), [objects, overrides]);
  const selfRoomId = self ? (meetingRoomOf(self)?.id ?? null) : null;
  const selfFocusId = self ? (focusRoomOf(self)?.id ?? null) : null;
  const closedFocus = useMemo(
    () =>
      FOCUS_ROOMS.filter((area) => {
        const state = focusRooms[area.id];
        return (
          state?.occupied &&
          !state.open &&
          area.id !== selfFocusId &&
          !(selfId && state.guests.includes(selfId))
        );
      }),
    [focusRooms, selfFocusId, selfId],
  );
  const lockedRooms = useMemo(
    () => [
      ...MEETING_ROOMS.filter((area) => meetings[area.id]?.locked && area.id !== selfRoomId),
      ...closedFocus,
    ],
    [meetings, selfRoomId, closedFocus],
  );
  const blocked = useMemo<Blocked>(() => {
    const base = blockedWith(objects, overrides);
    if (!lockedRooms.length) return base;
    // A locked meeting admits nobody: its tiles are closed to everyone outside it.
    const tiles = new Set(base);
    for (const area of lockedRooms)
      for (let ty = area.y; ty < area.y + area.h; ty++)
        for (let tx = area.x; tx < area.x + area.w; tx++) tiles.add(`${tx}/${ty}`);
    return tiles;
  }, [objects, overrides, lockedRooms]);
  const [hoverRoom, setHoverRoom] = useState<{ area: MeetingArea; x: number; y: number } | null>(
    null,
  );
  const [hoverDesk, setHoverDesk] = useState<{ label: string; x: number; y: number } | null>(null);
  // Each participant's look, recoloured once per distinct look and shared by everyone wearing it.
  const [lookMaps, setLookMaps] = useState<Record<string, Record<string, string>>>({});
  const looksKey = participants
    .map((person) => lookKey(sanitizeLook(person.avatar)))
    .sort()
    .join('|');
  useEffect(() => {
    let live = true;
    for (const person of participants) {
      const look = sanitizeLook(person.avatar),
        key = lookKey(look);
      if (lookMaps[key]) continue;
      void lookFrames(look).then((map) => {
        if (live) setLookMaps((old) => (old[key] ? old : { ...old, [key]: map }));
      });
    }
    return () => {
      live = false;
    };
  }, [looksKey]);
  const baseObjects = useMemo(
    () => effectiveBaseObjects(overrides) as MapObjectData[],
    [overrides],
  );
  const baseById = useMemo(
    () => new Map(baseObjects.map((object) => [object.id, object])),
    [baseObjects],
  );
  const currentBlocked = useRef(blocked);
  currentBlocked.current = blocked;
  const currentSeats = useRef(seats);
  currentSeats.current = seats;
  const currentParticipants = useRef(participants);
  currentParticipants.current = participants;
  const seatActions = useRef({ onSit, onStand });
  seatActions.current = { onSit, onStand };
  const callback = useRef(onMove);
  callback.current = onMove;
  const movementIntent = useRef(onMovementIntent);
  movementIntent.current = onMovementIntent;
  const currentSelf = useRef(self);
  currentSelf.current = self;
  const editing = useRef<string | null>(editKind);
  editing.current = editingMode ? (editKind ?? 'editor') : null;

  // Local avatar: a tile, plus an in-progress step towards the next tile.
  const tile = useRef<Tile>({ tx: 20, ty: 39 });
  const step = useRef<{ from: Point; to: Point; startedAt: number; duration: number } | null>(null);
  const route = useRef<Tile[]>([]);
  const pendingSeat = useRef<string | null>(null);
  const pendingNavigation = useRef<{ tile: Tile; seatId?: string } | null>(null);
  const standingRequested = useRef(false);
  const previousSeat = useRef<string | undefined>(undefined);
  const keys = useRef(new Set<string>());
  const [local, setLocal] = useState<Point>(tileCenter(tile.current));
  const [motion, setMotion] = useState<Motion>({ facing: 'south', moving: false, frame: 0 });
  const [destination, setDestination] = useState<Tile | null>(null);

  // Remote avatars interpolate between received tiles at the same pace.
  const remotes = useRef(new Map<string, Remote>());
  const [remoteRender, setRemoteRender] = useState<Record<string, Point & Motion>>({});

  // Camera: follows the local avatar; dragging pans until the avatar moves again.
  const [viewport, setViewport] = useState({ width: 1172, height: 808 });
  // Development aid: ?cam=x,y&zoom=z pins the camera for reference comparisons.
  const pinned = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const cam = params.get('cam')?.split(',').map(Number);
    return cam && cam.length === 2 && cam.every(Number.isFinite)
      ? { x: cam[0], y: cam[1], zoom: Number(params.get('zoom')) || 1 }
      : null;
  }, []);
  const [camera, setCamera] = useState<Point>(pinned ?? tileCenter(tile.current));
  const following = useRef(!pinned);
  const drag = useRef<{ client: Point; camera: Point; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const scale = clamp(pinned?.zoom ?? zoom, MIN_ZOOM, 4);
  // Zoomed out (or on request) the office shows only floors, walls and people, as the reference's simplified view.
  const simpleView = (simplified || scale < SIMPLE_BELOW) && !editKind && !editorOpen;
  const viewWidth = viewport.width / scale,
    viewHeight = viewport.height / scale;
  const viewX = camera.x - viewWidth / 2,
    viewY = camera.y - viewHeight / 2;

  useEffect(() => {
    const container = svgRef.current?.parentElement;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0)
        setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (pinned) return;
    following.current = true;
    setCamera(tileCenter(tile.current));
  }, [resetViewKey]);
  const view = useRef({ scale, camera, viewport, onZoom });
  view.current = { scale, camera, viewport, onZoom };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || pinned) return;
    const wheel = (event: WheelEvent) => {
      const { scale: current, camera: cam, viewport: port, onZoom: zoomTo } = view.current;
      if (!zoomTo) return;
      event.preventDefault();
      const next = clamp(
        Math.round(current * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)) * 100) / 100,
        MIN_ZOOM,
        4,
      );
      if (next === current) return;
      // Keep the world point under the cursor where it is.
      const box = svg.getBoundingClientRect();
      const cx = event.clientX - box.left - port.width / 2,
        cy = event.clientY - box.top - port.height / 2;
      const worldX = cam.x + cx / current,
        worldY = cam.y + cy / current;
      following.current = false;
      setCamera({
        x: clamp(worldX - cx / next, 0, WORLD.width),
        y: clamp(worldY - cy / next, 0, WORLD.height),
      });
      zoomTo(next);
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [pinned]);

  useEffect(() => {
    const now = performance.now();
    const present = new Set<string>();
    for (const person of participants) {
      if (person.id === selfId) continue;
      present.add(person.id);
      const previous = remotes.current.get(person.id);
      const target = { x: person.x, y: person.y };
      if (!previous) {
        remotes.current.set(person.id, {
          from: target,
          to: target,
          startedAt: now,
          facing: person.facing ?? 'south',
          lastMoved: 0,
        });
        continue;
      }
      const moved = Math.hypot(target.x - previous.to.x, target.y - previous.to.y) > 0.01;
      if (moved) {
        const progress = clamp((now - previous.startedAt) / STEP_MS, 0, 1);
        const from = {
          x: previous.from.x + (previous.to.x - previous.from.x) * progress,
          y: previous.from.y + (previous.to.y - previous.from.y) * progress,
        };
        remotes.current.set(person.id, {
          from,
          to: target,
          startedAt: now,
          facing: person.facing ?? facingFor(target.x - from.x, target.y - from.y),
          lastMoved: person.seatId ? 0 : now,
        });
      } else
        remotes.current.set(person.id, {
          ...previous,
          facing: person.facing ?? previous.facing,
          lastMoved: person.status === 'away' || person.seatId ? 0 : previous.lastMoved,
        });
    }
    for (const id of remotes.current.keys()) if (!present.has(id)) remotes.current.delete(id);
  }, [participants, selfId]);

  const requestStand = () => {
    if (!standingRequested.current && currentSelf.current?.seatId) {
      standingRequested.current = true;
      seatActions.current.onStand();
    }
  };
  const cancelRoute = () => {
    route.current = [];
    pendingSeat.current = null;
    setDestination(null);
  };
  const navigateTo = (goal: Tile, seatId?: string) => {
    if (!currentSelf.current || currentSelf.current.status === 'away' || editing.current) return;
    if (currentSelf.current.seatId) {
      pendingNavigation.current = { tile: goal, seatId };
      requestStand();
      return;
    }
    const target = nearestFreeTile(goal, currentBlocked.current) ?? goal;
    const path = findTilePath(tile.current, target, currentBlocked.current);
    keys.current.clear();
    route.current = path;
    pendingSeat.current = path.length || sameTile(tile.current, target) ? (seatId ?? null) : null;
    setDestination(path.length ? target : null);
    following.current = true;
    if (!path.length && seatId && sameTile(tile.current, target)) {
      pendingSeat.current = null;
      seatActions.current.onSit(seatId);
    }
  };
  const requestSeat = (seat: Seat) => {
    if (currentSelf.current?.seatId === seat.id) {
      pendingNavigation.current = null;
      requestStand();
      return;
    }
    if (currentParticipants.current.some((person) => person.seatId === seat.id)) return;
    navigateTo(tileOf({ x: seat.standX, y: seat.standY }), seat.id);
  };

  useEffect(() => {
    if (!self) return;
    if (self.seatId || previousSeat.current) {
      tile.current = tileOf(self);
      step.current = null;
      setLocal(tileCenter(tile.current));
      setMotion({ facing: self.facing ?? 'south', moving: false, frame: 0 });
      cancelRoute();
    }
    previousSeat.current = self.seatId;
    if (!self.seatId && standingRequested.current) {
      standingRequested.current = false;
      const pending = pendingNavigation.current;
      pendingNavigation.current = null;
      if (pending) navigateTo(pending.tile, pending.seatId);
    }
  }, [selfId, self?.seatId]);
  useEffect(() => {
    if (navigationTarget) navigateTo(tileOf(navigationTarget));
  }, [navigationTarget?.nonce]);
  useEffect(() => {
    const seat =
      seatTarget && currentSeats.current.find((candidate) => candidate.id === seatTarget.seatId);
    if (seat) requestSeat(seat);
  }, [seatTarget?.nonce]);
  useEffect(() => {
    if (editKind || self?.status === 'away') {
      keys.current.clear();
      cancelRoute();
      pendingNavigation.current = null;
    }
  }, [editKind, self?.status]);
  useEffect(() => {
    const p = currentSelf.current;
    if (p) {
      tile.current = tileOf(p);
      setLocal(tileCenter(tile.current));
      if (!pinned) setCamera(tileCenter(tile.current));
    }
    step.current = null;
    keys.current.clear();
    cancelRoute();
    pendingNavigation.current = null;
    standingRequested.current = false;
    previousSeat.current = undefined;
  }, [selfId]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        typing(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        editing.current ||
        !currentSelf.current ||
        currentSelf.current.status === 'away'
      )
        return;
      if (key === 'e' && !event.repeat) {
        event.preventDefault();
        if (currentSelf.current.seatId) {
          pendingNavigation.current = null;
          requestStand();
          return;
        }
        const here = tile.current;
        const nearest = currentSeats.current.filter(
          (seat) =>
            !currentParticipants.current.some((person) => person.seatId === seat.id) &&
            Math.abs(seat.tx - here.tx) + Math.abs(seat.ty - here.ty) <= 1 &&
            (sameTile(seat, here) ||
              canStep(here.tx, here.ty, seat.tx, seat.ty, currentBlocked.current)),
        )[0];
        if (nearest) requestSeat(nearest);
        return;
      }
      if (KEY_DIRECTION[key] || key === 'shift') {
        event.preventDefault();
        keys.current.add(key);
        if (key !== 'shift') {
          cancelRoute();
          pendingNavigation.current = null;
          requestStand();
          following.current = true;
        }
      }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const wasMovementKey = KEY_DIRECTION[key] !== undefined && keys.current.has(key);
      keys.current.delete(key);
      if (wasMovementKey && ![...keys.current].some((held) => KEY_DIRECTION[held]))
        movementIntent.current?.(0, 0);
    };
    const blur = () => {
      keys.current.clear();
      movementIntent.current?.(0, 0);
      cancelRoute();
      pendingNavigation.current = null;
    };
    const focus = (event: FocusEvent) => {
      if (typing(event.target)) blur();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('focusin', focus);
    let frame = 0,
      wasMoving = false,
      lastTick = 0;
    const tick = (time: number) => {
      // Remote avatars.
      const rendered: Record<string, Point & Motion> = {};
      let changed = false;
      for (const [id, remote] of remotes.current) {
        const progress = clamp((time - remote.startedAt) / STEP_MS, 0, 1);
        const moving = remote.lastMoved > 0 && time - remote.lastMoved < STEP_MS + 60;
        rendered[id] = {
          x: remote.from.x + (remote.to.x - remote.from.x) * progress,
          y: remote.from.y + (remote.to.y - remote.from.y) * progress,
          facing: remote.facing,
          moving,
          frame: moving ? walkFrameAt(time) : 0,
        };
      }
      setRemoteRender((previous) => {
        const ids = Object.keys(rendered);
        changed =
          ids.length !== Object.keys(previous).length ||
          ids.some((id) => {
            const a = previous[id],
              b = rendered[id];
            return (
              !a ||
              a.x !== b.x ||
              a.y !== b.y ||
              a.facing !== b.facing ||
              a.moving !== b.moving ||
              a.frame !== b.frame
            );
          });
        return changed ? rendered : previous;
      });
      // Traffic stops for anyone in its lane: where people are now and the tile they are stepping onto.
      if (VEHICLES_ON_STREET.length) {
        const people: Point[] = [tileCenter(tile.current)];
        for (const remote of remotes.current.values()) people.push(remote.to);
        for (const id in rendered) people.push(rendered[id]);
        if (step.current) people.push(step.current.from);
        stepTraffic(lastTick ? (time - lastTick) / 1000 : 0, people);
      }
      lastTick = time;
      // Local avatar: finish the current step, then pick the next one.
      const canMove =
        currentSelf.current &&
        currentSelf.current.status !== 'away' &&
        !currentSelf.current.seatId &&
        !standingRequested.current &&
        !editing.current;
      if (step.current) {
        const progress = clamp((time - step.current.startedAt) / step.current.duration, 0, 1);
        const position = {
          x: step.current.from.x + (step.current.to.x - step.current.from.x) * progress,
          y: step.current.from.y + (step.current.to.y - step.current.from.y) * progress,
        };
        setLocal(position);
        if (following.current) setCamera(position);
        setMotion((previous) => ({ ...previous, moving: true, frame: walkFrameAt(time) }));
        if (progress >= 1) {
          step.current = null;
          callback.current(tile.current.tx * TILE + TILE / 2, tile.current.ty * TILE + TILE / 2);
          if (!route.current.length && ![...keys.current].some((key) => KEY_DIRECTION[key]))
            movementIntent.current?.(0, 0);
        }
      }
      if (!step.current && canMove) {
        let next: Tile | null = null;
        let facing: Facing | null = null;
        const held = [...keys.current].map((key) => KEY_DIRECTION[key]).filter(Boolean);
        if (held.length) {
          const [dx, dy, direction] = held[held.length - 1];
          facing = direction;
          if (
            canStep(
              tile.current.tx,
              tile.current.ty,
              tile.current.tx + dx,
              tile.current.ty + dy,
              currentBlocked.current,
            ) &&
            !vehicleOnTile(tile.current.tx + dx, tile.current.ty + dy)
          )
            next = { tx: tile.current.tx + dx, ty: tile.current.ty + dy };
        } else if (route.current.length) {
          const candidate = route.current[0];
          if (vehicleOnTile(candidate.tx, candidate.ty))
            facing = facingFor(candidate.tx - tile.current.tx, candidate.ty - tile.current.ty); // wait for the vehicle to pass
          else if (
            canStep(
              tile.current.tx,
              tile.current.ty,
              candidate.tx,
              candidate.ty,
              currentBlocked.current,
            )
          ) {
            next = route.current.shift()!;
            facing = facingFor(next.tx - tile.current.tx, next.ty - tile.current.ty);
          } else {
            const path = findTilePath(tile.current, route.current.at(-1)!, currentBlocked.current);
            route.current = path;
            if (!path.length) cancelRoute();
          }
        }
        if (next) {
          const from = tileCenter(tile.current),
            to = tileCenter(next);
          movementIntent.current?.(
            Math.sign(next.tx - tile.current.tx) as -1 | 0 | 1,
            Math.sign(next.ty - tile.current.ty) as -1 | 0 | 1,
          );
          tile.current = next;
          step.current = {
            from,
            to,
            startedAt: time,
            duration: keys.current.has('shift') ? RUN_STEP_MS : STEP_MS,
          };
          playStep(floorMaterial(to), keys.current.has('shift'));
          setMotion({
            facing: facing ?? facingFor(to.x - from.x, to.y - from.y),
            moving: true,
            frame: walkFrameAt(time),
          });
          wasMoving = true;
        } else {
          if (facing)
            setMotion((previous) =>
              previous.facing === facing && !previous.moving
                ? previous
                : { facing: facing!, moving: false, frame: 0 },
            );
          else if (wasMoving)
            setMotion((previous) =>
              previous.moving ? { ...previous, moving: false, frame: 0 } : previous,
            );
          if (wasMoving) {
            wasMoving = false;
            if (!route.current.length) {
              setDestination(null);
              const seatId = pendingSeat.current;
              pendingSeat.current = null;
              if (seatId) seatActions.current.onSit(seatId);
            }
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focusin', focus);
    };
  }, []);

  const worldPoint = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current,
      matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: clamp(point.x, 0, WORLD.width - 1), y: clamp(point.y, 0, WORLD.height - 1) };
  };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    drag.current = { client: { x: event.clientX, y: event.clientY }, camera, moved: false };
    if (!editKind) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (grab.current) {
      const point = worldPoint(event.clientX, event.clientY);
      if (
        Math.hypot(event.clientX - grab.current.client.x, event.clientY - grab.current.client.y) > 4
      )
        grab.current.moved = true;
      if (point && grab.current.moved) {
        const tile = tileOf(point);
        const current = grab.current;
        const free = freePlacement || event.altKey;
        setDragTile((previous) =>
          !free && previous && !previous.tile.at && sameTile(previous.tile, tile)
            ? previous
            : { id: current.id, item: current.item, tile: free ? { ...tile, at: point } : tile },
        );
      }
      return;
    }
    if (editItem) {
      const point = worldPoint(event.clientX, event.clientY);
      const free = freePlacement || event.altKey;
      if (point)
        setHoverTile((previous) => {
          const next = tileOf(point);
          return free
            ? { ...next, at: point }
            : previous && !previous.at && sameTile(previous, next)
              ? previous
              : next;
        });
    }
    if (!editingMode && !drag.current) {
      const point = worldPoint(event.clientX, event.clientY);
      const { tx, ty } = point ? tileOf(point) : { tx: -1, ty: -1 };
      const area = meetingRoomAt(tx, ty);
      const host = event.currentTarget.parentElement?.getBoundingClientRect();
      setHoverRoom(
        area && host && area.id !== selfRoomId
          ? { area, x: event.clientX - host.left, y: event.clientY - host.top }
          : null,
      );
      const desk = !area && host ? deskAt(tx, ty) : null;
      setHoverDesk(
        desk && host && deskLabels[desk.id]
          ? {
              label: FOCUS_ROOMS.some((room) => room.id === desk.id)
                ? `${deskLabels[desk.id]} · ${t('Zona de concentración')}`
                : deskLabels[desk.id],
              x: event.clientX - host.left,
              y: event.clientY - host.top,
            }
          : null,
      );
    } else {
      if (hoverRoom) setHoverRoom(null);
      if (hoverDesk) setHoverDesk(null);
    }
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.client.x,
      dy = event.clientY - start.client.y;
    if (Math.hypot(dx, dy) > 4) {
      start.moved = true;
      setDragging(true);
      following.current = false;
      setCamera({
        x: clamp(start.camera.x - dx / scale, 0, WORLD.width),
        y: clamp(start.camera.y - dy / scale, 0, WORLD.height),
      });
    }
  };
  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (grab.current) {
      const grabbed = grab.current;
      grab.current = null;
      setDragTile(null);
      const point = worldPoint(event.clientX, event.clientY);
      if (grabbed.moved && point) {
        const tile = tileOf(point);
        if (freePlacement || event.altKey)
          onMoveObject(grabbed.id, Math.round(point.x), Math.round(point.y), true);
        else onMoveObject(grabbed.id, tile.tx * TILE + TILE / 2, tile.ty * TILE + TILE / 2);
        onSelectObject(grabbed.id);
      } else onSelectObject(selectedObject === grabbed.id ? null : grabbed.id);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (drag.current && !drag.current.moved) {
      const point = worldPoint(event.clientX, event.clientY);
      if (point && editKind) {
        const tile = tileOf(point);
        if (freePlacement || event.altKey) onPlace(Math.round(point.x), Math.round(point.y), true);
        else onPlace(tile.tx * TILE + TILE / 2, tile.ty * TILE + TILE / 2);
      } else if (editingMode) {
        if (selectedObject) onSelectObject(null);
      } else if (
        point &&
        self &&
        self.status !== 'away' &&
        !(event.target as Element).closest('.scene-avatar, .scene-added-object, .scene-seat')
      ) {
        const target = inFrontOfWall(point) ?? tileOf(point);
        const area = meetingRoomAt(target.tx, target.ty);
        const closed = closedFocus.find(
          (room) =>
            target.tx >= room.x &&
            target.tx < room.x + room.w &&
            target.ty >= room.y &&
            target.ty < room.y + room.h,
        );
        if (closed) {
          onFocusClosed?.(closed.id);
          navigateTo({ tx: closed.x + Math.floor(closed.w / 2), ty: closed.y + closed.h });
        } else if (area && area.id !== selfRoomId) onAreaClick(area.id);
        else navigateTo(target);
      }
    }
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  // Interactive objects: the one next to you glows and opens with X, as in the reference.
  const interactive = useMemo(() => {
    const all = [...baseObjects, ...objects.map((object) => asMapObject(object) as MapObjectData)];
    return all
      .filter(
        (object) => interactions[object.id.replace(/^object:/, '')] || interactions[object.id],
      )
      .map((object) => ({
        id: object.id.replace(/^object:/, ''),
        object,
        tiles: (object.blocks?.length
          ? object.blocks
          : [[Math.floor(object.x / TILE), Math.floor((object.y - 1) / TILE)]]) as number[][],
      }));
  }, [baseObjects, objects, interactions]);
  const selfTile = self ? tileOf(self.seatId ? self : local) : null;
  const nearInteractive =
    !editingMode && selfTile
      ? (interactive.find((item) =>
          item.tiles.some(
            ([tx, ty]) => Math.max(Math.abs(tx - selfTile.tx), Math.abs(ty - selfTile.ty)) <= 1,
          ),
        ) ?? null)
      : null;
  const nearId = nearInteractive?.id ?? null;
  useEffect(() => {
    onNearInteractive?.(nearId);
  }, [nearId]);
  const interactRef = useRef<{ id: string | null; open?: (id: string) => void }>({ id: null });
  interactRef.current = { id: nearId, open: onInteract };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === 'x' &&
        !event.repeat &&
        !typing(event.target) &&
        !event.metaKey &&
        !event.ctrlKey &&
        interactRef.current.id
      ) {
        event.preventDefault();
        interactRef.current.open?.(interactRef.current.id);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const occupiedSeats = new Map(
    participants.filter((person) => person.seatId).map((person) => [person.seatId!, person]),
  );
  const seatObjectY = (person: Participant) => {
    const seat = person.seatId
      ? seats.find((candidate) => candidate.id === person.seatId)
      : undefined;
    const object = seat
      ? (baseById.get(seat.objectId) ??
        objects
          .map((candidate) => asMapObject(candidate))
          .find((candidate) => candidate.id === seat.objectId))
      : undefined;
    if (!seat || !object) return null;
    // The occupant draws over the chair's main sprite; the chair's foreground part draws over the occupant.
    return object.y + 0.5;
  };
  const avatarLayer = (
    person: Participant,
    position: Point,
    facing: Facing,
    moving: boolean,
    frame: number,
  ): Layer =>
    simpleView
      ? {
          key: `person-${person.id}`,
          y: position.y + TILE / 2 - 1,
          order: 3,
          node: (
            <SimpleAvatar
              person={person}
              self={person.id === selfId}
              x={Math.round(position.x)}
              y={Math.round(position.y)}
              scale={scale}
            />
          ),
        }
      : {
          key: `person-${person.id}`,
          y: seatObjectY(person) ?? position.y + TILE / 2 - 1,
          order: 3,
          node: (
            <g
              transform={`translate(${Math.round(position.x)} ${Math.round(footOf(position).y) + (person.seatId ? -2 : 0)})`}
            >
              <Avatar
                person={person}
                self={person.id === selfId}
                facing={facing}
                moving={moving}
                frame={frame}
                frames={lookMaps[lookKey(sanitizeLook(person.avatar))]}
                reaction={
                  reactions.filter((item) => item.participantId === person.id).at(-1)?.emoji
                }
                onSelect={() =>
                  person.id === selfId && person.seatId ? requestStand() : onSelect(person.id)
                }
              />
            </g>
          ),
        };
  const doorwayPeople = participants.map((person) => ({
    id: person.id,
    inside: focusRoomOf(person)?.id ?? null,
    ...tileOf(person.id === selfId ? local : (remoteRender[person.id] ?? person)),
  }));
  // Door artwork follows the reference: wooden doors only on the large meeting room, a light marker on huddle doorways, bare gaps elsewhere.
  const doorLayers: Layer[] = DOORWAYS.flatMap((door) => {
    const area = AREAS.find((candidate) => candidate.id === door.area);
    // Focus offices always show their door; it is shut while someone focuses inside, and swings open for whoever stands in the doorway.
    const isFocus = FOCUS_ROOMS.some((room) => room.id === door.area);
    const atDoor =
      isFocus &&
      doorwayPeople.some(
        ({ id, inside, tx, ty }) =>
          (inside === door.area || focusRooms[door.area]?.guests.includes(id)) &&
          tx >= door.tx &&
          tx <= door.tx + 1 &&
          ty >= door.ty &&
          ty <= door.ty + 1,
      );
    const focusDoor =
      isFocus && !!focusRooms[door.area]?.occupied && !focusRooms[door.area]?.open && !atDoor;
    const style: 'doors' | 'marker' | null = isFocus
      ? 'doors'
      : area?.type === 'MeetingRoom'
        ? (area.capacity ?? 0) >= 6
          ? 'doors'
          : door.orientation === 'Vertical'
            ? 'marker'
            : null
        : null;
    if (!style) return [];
    return [
      {
        key: `door-${door.area}-${door.tx}-${door.ty}`,
        y:
          door.side === 'n'
            ? door.ty * TILE - 1
            : door.side === 's'
              ? (door.ty + 1) * TILE - 1
              : door.ty * TILE + 1,
        order: 1,
        node: (
          <g
            transform={`translate(${door.side === 'e' ? (door.tx + 1) * TILE : door.tx * TILE} ${door.side === 's' ? (door.ty + 1) * TILE : door.ty * TILE})`}
          >
            <DoorwayPiece
              orientation={door.orientation}
              side={door.side}
              style={style}
              closed={focusDoor || !!meetings[door.area]?.active}
              locked={focusDoor || !!meetings[door.area]?.locked}
            />
          </g>
        ),
      },
    ];
  });
  // A placed object standing inside the sprite box of a furniture piece with a footprint (desk, table, counter) draws right after it.
  const placedData = objects.map((object) => asMapObject(object) as MapObjectData);
  const surfaces = [...baseObjects, ...placedData].filter((candidate) => candidate.blocks?.length);
  const supportOf = (object: MapObjectData): MapObjectData | undefined => {
    const anchor = tileCenter(tileOf(object));
    return surfaces
      .filter(
        (candidate) =>
          candidate.id !== object.id &&
          !candidate.seat &&
          anchor.x >= candidate.x - candidate.originX &&
          anchor.x < candidate.x - candidate.originX + candidate.w &&
          anchor.y >= candidate.y - candidate.originY &&
          anchor.y < candidate.y - candidate.originY + candidate.h,
      )
      .sort((a, b) => b.y - a.y)[0];
  };
  const placedDepth = (object: MapObjectData) => {
    const support = supportOf(object);
    return support
      ? (baseById.has(support.id) ? objectDepth(support, baseById) : support.y) + 0.02
      : (wallMountDepth(object) ?? object.y);
  };
  const layers: Layer[] = [
    ...STATIC,
    ...doorLayers,
    ...(simpleView ? [] : baseObjects).map((object) => ({
      key: `object-${object.id}`,
      y: objectDepth(object, baseById),
      order: 2,
      node: (
        <BaseObject
          object={object}
          selected={selectedObject === object.id}
          editing={editingMode && !editItem}
          onSelectObject={onSelectObject}
          onGrab={onGrab}
        />
      ),
    })),
    ...(simpleView ? [] : baseObjects).filter(hasForeground).map((object) => ({
      key: `object-fg-${object.id}`,
      y: objectDepth(object, baseById) + 1,
      order: 4,
      node: (
        <g transform={`translate(${object.x} ${object.y})`}>
          <ObjectForeground object={object} />
        </g>
      ),
    })),
    ...(simpleView ? [] : objects).map((object, index) => ({
      key: object.id,
      y: placedDepth(placedData[index]),
      order: 2,
      node: (
        <AddedObject
          object={object}
          selected={selectedObject === object.id}
          editing={editingMode && !editItem}
          onSelectObject={onSelectObject}
          onGrab={onGrab}
        />
      ),
    })),
    ...(simpleView ? [] : placedData).filter(hasForeground).map((data) => ({
      key: `fg-${data.id}`,
      y: placedDepth(data) + 1,
      order: 4,
      node: (
        <g transform={`translate(${data.x} ${data.y})`}>
          <ObjectForeground object={data} />
        </g>
      ),
    })),
    ...participants.map((person) => {
      if (person.id === selfId)
        return avatarLayer(
          person,
          person.seatId ? tileCenter(tileOf(person)) : local,
          person.seatId ? (person.facing ?? motion.facing) : motion.facing,
          !person.seatId && motion.moving,
          motion.frame,
        );
      const remote = remoteRender[person.id];
      return avatarLayer(
        person,
        remote && !person.seatId ? remote : { x: person.x, y: person.y },
        person.seatId ? (person.facing ?? 'south') : (remote?.facing ?? person.facing ?? 'south'),
        !person.seatId && (remote?.moving ?? false),
        remote?.frame ?? 0,
      );
    }),
  ].sort((a, b) => a.y - b.y || a.order - b.order || a.key.localeCompare(b.key));

  const minimapScale = 108 / WORLD.width;
  return (
    <div
      className={`office-scene${simpleView ? ' simplified' : ''}${dragging ? ' is-dragging' : ''}${editingMode ? ' is-editing' : ''}${dragTile ? ' is-moving' : ''}`}
    >
      <svg
        ref={svgRef}
        className="office-map"
        viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
        role="group"
        tabIndex={0}
        aria-label={t(
          'Oficina Vivo. Muévete con las flechas o WASD; clic para caminar, clic en una silla o E para sentarte; flechas o E para levantarte; arrastra el fondo para desplazar el mapa.',
        )}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => setHoverRoom(null)}
      >
        <FloorPatterns />
        <defs>
          <pattern id="edit-grid" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
            <path
              d={`M${TILE} 0V${TILE}H0`}
              fill="none"
              stroke="#ffffff"
              strokeOpacity=".12"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        {/* Zoomed out, the map is drawn exactly like the minimap: flat blocks, no textures. */}
        {simpleView ? (
          <g pointerEvents="none" shapeRendering="crispEdges">
            <rect
              x={-WORLD.width}
              y={-WORLD.height}
              width={WORLD.width * 3}
              height={WORLD.height * 3}
              fill={MINIMAP_BACKGROUND}
            />
            {AREA_FLOORS.map((area) => (
              <rect
                key={area.id}
                x={area.x * TILE}
                y={area.y * TILE}
                width={area.w * TILE}
                height={area.h * TILE}
                fill={minimapFill(area)}
              />
            ))}
          </g>
        ) : (
          <g pointerEvents="none" shapeRendering="crispEdges">
            <rect
              x={-WORLD.width}
              y={-WORLD.height}
              width={WORLD.width * 3}
              height={WORLD.height * 3}
              fill={`url(#${floorPatternId('NewStyleGrass/Green')})`}
            />
            {OUTER_GROUND.map((area) => (
              <rect
                key={`outer-${area.id}`}
                x={area.x}
                y={area.y}
                width={area.w}
                height={area.h}
                fill={`url(#${floorPatternId(floorKey(area.floor, area.floorColor))})`}
              />
            ))}
            {AREA_FLOORS.map((area) => (
              <rect
                key={area.id}
                x={area.x * TILE}
                y={area.y * TILE}
                width={area.w * TILE + (area.id.startsWith('ground-') ? 1 : 0)}
                height={area.h * TILE + (area.id.startsWith('ground-') ? 1 : 0)}
                fill={`url(#${floorPatternId(floorKey(area.floor, area.floorColor))})`}
              />
            ))}
            {/* The shore pattern starts with sand: a sand edge hides the wrap-around line browsers draw when scaling the pattern. */}
            {[...AREA_FLOORS, ...OUTER_GROUND]
              .filter((area) => area.floor === 'Shore')
              .map((area) => {
                const outer = !('depth' in area);
                return (
                  <rect
                    key={`shore-edge-${area.id}`}
                    x={outer ? area.x : area.x * TILE}
                    y={outer ? area.y : area.y * TILE}
                    width={outer ? area.w : area.w * TILE + 1}
                    height={2}
                    fill="#e9d3a2"
                  />
                );
              })}
          </g>
        )}
        {editingMode && (
          <g pointerEvents="none">
            <rect
              x={-WORLD.width}
              y={-WORLD.height}
              width={WORLD.width * 3}
              height={WORLD.height * 3}
              fill="#0b1020"
              fillOpacity=".28"
            />
            <rect x="0" y="0" width={WORLD.width} height={WORLD.height} fill="url(#edit-grid)" />
          </g>
        )}
        {destination && (
          <g
            pointerEvents="none"
            transform={`translate(${destination.tx * TILE} ${destination.ty * TILE})`}
          >
            <rect
              x="2"
              y="2"
              width="28"
              height="28"
              rx="3"
              fill="none"
              stroke="#ffffff"
              strokeOpacity=".9"
              strokeWidth="2"
            />
          </g>
        )}
        {VEHICLES_ON_STREET.length > 0 && !simpleView && <Traffic />}
        <g shapeRendering="crispEdges">
          {layers.map((layer) => (
            <g key={layer.key}>{layer.node}</g>
          ))}
        </g>
        {simpleView && <SimpleAreaIcons scale={scale} />}
        {nearInteractive && (
          <g pointerEvents="none" className="scene-interactive">
            <rect
              x={nearInteractive.object.x - nearInteractive.object.originX - 2}
              y={nearInteractive.object.y - nearInteractive.object.originY - 2}
              width={nearInteractive.object.w + 4}
              height={nearInteractive.object.h + 4}
              rx="3"
              fill="#f5c84222"
              stroke="#f5c842"
              strokeWidth="2"
            />
          </g>
        )}
        {editItem && hoverTile && <Ghost item={editItem} tile={hoverTile} />}
        {dragTile && <Ghost item={dragTile.item} tile={dragTile.tile} />}
        {!editingMode && !simpleView && (
          <g>
            {seats.map((seat) => {
              const occupant = occupiedSeats.get(seat.id);
              return (
                <SeatTarget
                  key={seat.id}
                  seat={seat}
                  occupiedBy={occupant?.name}
                  own={occupant?.id === selfId}
                  enabled={!!self && self.status !== 'away'}
                  onSit={() => requestSeat(seat)}
                />
              );
            })}
          </g>
        )}
      </svg>
      {hoverDesk && !hoverRoom && (
        <div
          className="scene-tooltip"
          style={
            hoverDesk.x > viewport.width - 200
              ? { right: viewport.width - hoverDesk.x + 14, top: hoverDesk.y + 16 }
              : { left: hoverDesk.x + 14, top: hoverDesk.y + 16 }
          }
        >
          {hoverDesk.label}
        </div>
      )}
      {hoverRoom && (
        <div
          className="scene-tooltip"
          style={
            hoverRoom.x > viewport.width - 200
              ? { right: viewport.width - hoverRoom.x + 14, top: hoverRoom.y + 16 }
              : { left: hoverRoom.x + 14, top: hoverRoom.y + 16 }
          }
        >
          {t('Sala de reunión: {name}', {
            name: areaNames[hoverRoom.area.id] ?? hoverRoom.area.name,
          })}
        </div>
      )}
      <div className="scene-minimap" aria-label={t('Minimapa de la oficina')}>
        <svg
          viewBox={`0 0 ${WORLD.width} ${WORLD.height}`}
          role="button"
          tabIndex={0}
          aria-label={t('Centrar cámara en el minimapa; Intro centra en tu posición')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              following.current = true;
              setCamera(tileCenter(tile.current));
            }
          }}
          onClick={(event) => {
            const matrix = event.currentTarget.getScreenCTM();
            if (!matrix) return;
            const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
              matrix.inverse(),
            );
            following.current = false;
            setCamera({ x: clamp(point.x, 0, WORLD.width), y: clamp(point.y, 0, WORLD.height) });
          }}
        >
          <rect width={WORLD.width} height={WORLD.height} fill={MINIMAP_BACKGROUND} />
          {AREA_FLOORS.map((area) => (
            <rect
              key={area.id}
              x={area.x * TILE}
              y={area.y * TILE}
              width={area.w * TILE}
              height={area.h * TILE}
              fill={minimapFill(area)}
            />
          ))}
          <rect
            x={viewX}
            y={viewY}
            width={viewWidth}
            height={viewHeight}
            fill="#ffffff"
            fillOpacity=".08"
            stroke="#d8d8e0"
            strokeWidth={24 * minimapScale * 10}
          />
          {participants.map((person) => (
            <circle
              key={person.id}
              cx={person.id === selfId ? local.x : person.x}
              cy={person.id === selfId ? local.y : person.y}
              r={person.id === selfId ? 40 : 30}
              fill={person.id === selfId ? '#39d98a' : '#d0c7ef'}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
