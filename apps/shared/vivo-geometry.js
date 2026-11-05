import { AREAS, OBJECTS, TILE, WORLD } from './vivo-map.js';

const key = (x, y) => `${x}/${y}`;
const areaById = new Map(AREAS.map((area) => [area.id, area]));

/** Wall tiles derived from walled areas: a thin wall around each area. Doorway tiles keep their wall face but do not block. */
export function buildWalls() {
  const walls = [];
  for (const area of AREAS) {
    if (!area.walls) continue;
    const gaps = new Set();
    for (const door of area.doorways) {
      if (door.orientation === 'Horizontal') {
        gaps.add(key(area.x + door.x, area.y + door.y));
        gaps.add(key(area.x + door.x + 1, area.y + door.y));
      } else {
        gaps.add(key(area.x + door.x, area.y + door.y));
        gaps.add(key(area.x + door.x, area.y + door.y + 1));
      }
    }
    const right = area.x + area.w - 1,
      bottom = area.y + area.h - 1;
    const push = (side, tx, ty) =>
      walls.push({ area: area.id, texture: area.walls, side, tx, ty, open: gaps.has(key(tx, ty)) });
    for (let x = area.x; x <= right; x++) {
      push(x === area.x ? 'nw' : x === right ? 'ne' : 'n', x, area.y);
      push(x === area.x ? 'sw' : x === right ? 'se' : 's', x, bottom);
    }
    for (let y = area.y + 1; y < bottom; y++) {
      push('w', area.x, y);
      push('e', right, y);
    }
  }
  return walls;
}

export function buildDoorways() {
  const doors = [];
  for (const area of AREAS) {
    if (!area.walls) continue;
    for (const door of area.doorways) {
      const tx = area.x + door.x,
        ty = area.y + door.y;
      doors.push({
        area: area.id,
        orientation: door.orientation,
        tx,
        ty,
        side:
          door.orientation === 'Horizontal' ? (door.y === 0 ? 'n' : 's') : door.x === 0 ? 'w' : 'e',
      });
    }
  }
  return doors;
}

export const WALLS = buildWalls();
export const DOORWAYS = buildDoorways();

/** Walls block the edge between two tiles; furniture blocks whole tiles. Both match the reference collision model. */
export function buildBlockedEdges(walls = WALLS) {
  const edges = new Set();
  const add = (ax, ay, bx, by) => {
    edges.add(`${ax}/${ay}:${bx}/${by}`);
    edges.add(`${bx}/${by}:${ax}/${ay}`);
  };
  for (const { tx, ty, side, open } of walls) {
    if (open) continue;
    if (side === 'n' || side === 'nw' || side === 'ne') add(tx, ty - 1, tx, ty);
    if (side === 's' || side === 'sw' || side === 'se') add(tx, ty, tx, ty + 1);
    if (side === 'w' || side === 'nw' || side === 'sw') add(tx - 1, ty, tx, ty);
    if (side === 'e' || side === 'ne' || side === 'se') add(tx, ty, tx + 1, ty);
  }
  return edges;
}
export const BLOCKED_EDGES = buildBlockedEdges();

/** Tiles nobody can walk on because of the ground itself (the sea); a deeper open area on top (a pier) wins. */
function buildBlockedGround() {
  const tiles = new Set();
  for (const area of AREAS) {
    if (!area.blocked) continue;
    for (let y = area.y; y < area.y + area.h; y++)
      for (let x = area.x; x < area.x + area.w; x++)
        if (areaAt(x, y)?.blocked) tiles.add(key(x, y));
  }
  return tiles;
}
let blockedGround = null;
export function buildBlockedTiles(extraObjects = [], baseObjects = OBJECTS) {
  blockedGround ??= buildBlockedGround();
  const blocked = new Set(blockedGround);
  for (const object of [...baseObjects, ...extraObjects])
    for (const [x, y] of object.blocks ?? []) blocked.add(key(x, y));
  return blocked;
}
export const BLOCKED = buildBlockedTiles();
export const isBlockedTile = (x, y, blocked = BLOCKED) =>
  x < 0 || y < 0 || x >= WORLD.cols || y >= WORLD.rows || blocked.has(key(x, y));
/** One orthogonal step between adjacent tiles. Diagonals require both orthogonal routes to be open. */
export function canStep(fromX, fromY, toX, toY, blocked = BLOCKED, edges = BLOCKED_EDGES) {
  if (isBlockedTile(toX, toY, blocked)) return false;
  const dx = toX - fromX,
    dy = toY - fromY;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) return false;
  if (dx && dy)
    return (
      canStep(fromX, fromY, toX, fromY, blocked, edges) &&
      canStep(toX, fromY, toX, toY, blocked, edges) &&
      canStep(fromX, fromY, fromX, toY, blocked, edges) &&
      canStep(fromX, toY, toX, toY, blocked, edges)
    );
  return !edges.has(`${fromX}/${fromY}:${toX}/${toY}`);
}

const FACING = { Up: 'north', Down: 'south', Left: 'west', Right: 'east' };
const OPPOSITE = { north: [0, 1], south: [0, -1], west: [1, 0], east: [-1, 0] };
const NEIGHBOURS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

/** Seats: one per sittable tile; standing exits prefer the tile behind the backrest. */
export function buildSeats(
  extraObjects = [],
  blocked = buildBlockedTiles(extraObjects),
  baseObjects = OBJECTS,
) {
  const seats = [];
  for (const object of [...baseObjects, ...extraObjects]) {
    if (!object.seat) continue;
    const facing = FACING[object.facing] ?? 'south';
    object.seat.forEach(([tx, ty], index) => {
      const area = areaAt(tx, ty);
      const label = `${area?.name ?? 'Oficina'} · ${object.kind.replace(/-/g, ' ')}`;
      const candidates = [OPPOSITE[facing], ...NEIGHBOURS].filter(([dx, dy]) =>
        canStep(tx, ty, tx + dx, ty + dy, blocked),
      );
      const [dx, dy] = candidates[0] ?? OPPOSITE[facing];
      seats.push({
        id: `${object.id}:${index}`,
        objectId: object.id,
        label,
        facing,
        tx,
        ty,
        x: tx * TILE + TILE / 2,
        y: ty * TILE + TILE / 2,
        standX: (tx + dx) * TILE + TILE / 2,
        standY: (ty + dy) * TILE + TILE / 2,
        desk: !!object.desk,
      });
    });
  }
  return seats;
}
export const SEATS = buildSeats();

/** Deepest area containing a tile; conversation rules follow the area type. */
export function areaAt(tx, ty) {
  let best = null;
  for (const area of AREAS) {
    if (
      tx >= area.x &&
      tx < area.x + area.w &&
      ty >= area.y &&
      ty < area.y + area.h &&
      (!best || area.depth > best.depth)
    )
      best = area;
  }
  return best;
}
export const tileOf = (point) => ({
  tx: Math.floor(point.x / TILE),
  ty: Math.floor(point.y / TILE),
});
export const areaOf = (point) => {
  const { tx, ty } = tileOf(point);
  return areaAt(tx, ty);
};
export const parentChain = (area) => {
  const chain = [];
  for (let current = area; current; current = current.parent ? areaById.get(current.parent) : null)
    chain.push(current);
  return chain;
};

/** Meeting rooms and huddles are acoustically closed; elsewhere proximity applies. */
export function privateRoomOf(point) {
  const chain = parentChain(areaOf(point));
  return chain.find((area) => area.type === 'MeetingRoom') ?? null;
}
export function sharesConversationArea(a, b, radius) {
  const roomA = privateRoomOf(a),
    roomB = privateRoomOf(b);
  if (roomA || roomB) return roomA === roomB;
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius;
}
