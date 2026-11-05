import { SPAWN_TILE as MAP_SPAWN, TILE, WORLD } from './vivo-map.js';
import { areaOf, sharesConversationArea as sharesArea } from './vivo-geometry.js';

export { TILE };
export const OFFICE_SIZE = Object.freeze({ width: WORLD.width, height: WORLD.height });
export const MEDIA_RADIUS = 220;
export const CHAT_RADIUS = 200;
// New participants enter the Lobby, like the office entry of the reference.
export const SPAWN_TILE = MAP_SPAWN;
export const SPAWN = Object.freeze({
  x: SPAWN_TILE.tx * TILE + TILE / 2,
  y: SPAWN_TILE.ty * TILE + TILE / 2,
});

export const tileCenter = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
export const tileOf = (point) => ({
  tx: Math.floor(point.x / TILE),
  ty: Math.floor(point.y / TILE),
});
export const sameTile = (a, b) =>
  Math.floor(a.x / TILE) === Math.floor(b.x / TILE) &&
  Math.floor(a.y / TILE) === Math.floor(b.y / TILE);

/** Meeting rooms are closed; outside them, proximity decides. */
export const isInMeetingArea = (point) => areaOf(point)?.type === 'MeetingRoom';
export const sharesConversationArea = sharesArea;
