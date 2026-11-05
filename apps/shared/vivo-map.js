// The office map in use. A server process loads one copy of the shared modules per map (`?map=<id>` on the module
// URL); a browser page shows one office and picks its map before the app starts (globalThis.__OFFICE_MAP__).
import { MAPS } from './maps/index.js';

const fromUrl = (() => {
  try {
    return new URL(import.meta.url).searchParams.get('map');
  } catch {
    return null;
  }
})();
export const MAP_ID = MAPS[fromUrl]
  ? fromUrl
  : MAPS[globalThis.__OFFICE_MAP__]
    ? globalThis.__OFFICE_MAP__
    : 'vivo';
const map = MAPS[MAP_ID];
export const TILE = 32;
export const WORLD = map.WORLD;
export const AREAS = map.AREAS;
export const OBJECTS = map.OBJECTS;
export const EXTRA_OBJECTS = map.EXTRA_OBJECTS;
export const SPAWN_TILE = map.SPAWN_TILE;
/** Vehicles driving along a street: lanes with a row (the lower of its two tiles), a direction, a speed (pixels a second) and the vehicles in order. */
export const TRAFFIC = map.TRAFFIC ?? [];
