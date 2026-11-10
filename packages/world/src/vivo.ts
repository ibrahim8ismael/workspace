import { AREAS, OBJECTS, SPAWN_TILE, TILE, WORLD } from '@gather/legacy-shared/vivo-map.js';
import { BLOCKED, BLOCKED_EDGES, SEATS } from '@gather/legacy-shared/vivo-geometry.js';
import type { OfficeGeometry, TilePoint } from './types.js';

function tileFromKey(key: string): TilePoint {
  const [tx, ty] = key.split('/').map(Number);
  if (!Number.isInteger(tx) || !Number.isInteger(ty))
    throw new Error(`Invalid Vivo tile key: ${key}`);
  return { tx: tx!, ty: ty! };
}

function edgeFromKey(key: string): readonly [TilePoint, TilePoint] {
  const [from, to] = key.split(':');
  if (!from || !to) throw new Error(`Invalid Vivo edge key: ${key}`);
  return [tileFromKey(from), tileFromKey(to)];
}

const seatsByObject = new Map<string, typeof SEATS>();
for (const seat of SEATS) {
  const seats = seatsByObject.get(seat.objectId) ?? [];
  seats.push(seat);
  seatsByObject.set(seat.objectId, seats);
}

const inBounds = (tile: TilePoint) =>
  tile.tx >= 0 && tile.ty >= 0 && tile.tx < WORLD.cols && tile.ty < WORLD.rows;

const canonicalEdge = ([a, b]: readonly [TilePoint, TilePoint]) => {
  const first = `${a.tx},${a.ty}`;
  const second = `${b.tx},${b.ty}`;
  return first < second ? `${first}:${second}` : `${second}:${first}`;
};

const blockedEdges = new Map<string, readonly [TilePoint, TilePoint]>();
for (const key of BLOCKED_EDGES) {
  const edge = edgeFromKey(key);
  if (inBounds(edge[0]) && inBounds(edge[1])) blockedEdges.set(canonicalEdge(edge), edge);
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

/** Server collision, bounds, seats and meeting rooms derived from the imported OpenOffice map. */
export const VIVO_GEOMETRY: OfficeGeometry = freeze({
  mapId: 'vivo',
  tileSize: TILE,
  widthTiles: WORLD.cols,
  heightTiles: WORLD.rows,
  spawn: { x: SPAWN_TILE.tx * TILE + TILE / 2, y: SPAWN_TILE.ty * TILE + TILE / 2 },
  blockedEdges: [...blockedEdges.values()],
  objects: OBJECTS.map((object) => ({
    objectId: object.id,
    label: object.kind.replaceAll('-', ' '),
    blockedTiles: (object.blocks ?? []).map(([tx, ty]) => ({ tx: tx!, ty: ty! })),
    seats: (seatsByObject.get(object.id) ?? []).map((seat, index) => ({
      seatId: `${object.id}:${index}`,
      tile: { tx: seat.tx, ty: seat.ty },
      exits: [{ tx: Math.floor(seat.standX / TILE), ty: Math.floor(seat.standY / TILE) }],
    })),
  })),
  zones: AREAS.filter((area) => area.type === 'MeetingRoom').map((area) => ({
    zoneId: `vivo-${area.id}`,
    label: area.name,
    kind: 'meeting' as const,
    bounds: { tx: area.x, ty: area.y, width: area.w, height: area.h },
  })),
});

export const VIVO_BLOCKED_TILES = [...BLOCKED].map(tileFromKey);
