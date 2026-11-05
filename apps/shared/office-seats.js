import { TILE } from './vivo-map.js';
import { buildBlockedTiles, buildSeats, canStep } from './vivo-geometry.js';
import { asMapObject, effectiveBaseObjects } from './office-objects.js';

/** Sitting requires standing on, or orthogonally beside, the chair's tile. */
export const SEAT_INTERACTION_RADIUS = Math.ceil(Math.hypot(TILE, TILE)) + 1;

const NEIGHBOURS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];
const tileOf = (point) => [Math.floor(point.x / TILE), Math.floor(point.y / TILE)];

/** Stable seat IDs and tile positions shared by the scene and realtime server. */
export function getOfficeSeats(objects = [], overrides = {}) {
  const extra = objects.map((object) => asMapObject(object));
  const base = effectiveBaseObjects(overrides);
  return buildSeats(extra, buildBlockedTiles(extra, base), base);
}

export function getOfficeSeat(id, objects = [], overrides = {}) {
  if (typeof id !== 'string') return undefined;
  return getOfficeSeats(objects, overrides).find((seat) => seat.id === id);
}

export function canExitSeat(seat, objects = [], overrides = {}) {
  const blocked = buildBlockedTiles(
    objects.map((object) => asMapObject(object)),
    effectiveBaseObjects(overrides),
  );
  return NEIGHBOURS.some(([dx, dy]) =>
    canStep(seat.tx, seat.ty, seat.tx + dx, seat.ty + dy, blocked),
  );
}

/** Being near a chair through a wall is not enough: the step onto it must be open. */
export function canApproachSeat(point, seat, objects = [], overrides = {}) {
  const blocked = buildBlockedTiles(
    objects.map((object) => asMapObject(object)),
    effectiveBaseObjects(overrides),
  );
  const [tx, ty] = tileOf(point);
  if (tx === seat.tx && ty === seat.ty) return canExitSeat(seat, objects, overrides);
  return (
    Math.abs(tx - seat.tx) + Math.abs(ty - seat.ty) === 1 &&
    canStep(tx, ty, seat.tx, seat.ty, blocked) &&
    canExitSeat(seat, objects, overrides)
  );
}
