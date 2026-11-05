import { TILE, WORLD } from '../shared/vivo-map.js';
import {
  BLOCKED,
  BLOCKED_EDGES,
  buildBlockedTiles,
  canStep,
  isBlockedTile,
} from '../shared/vivo-geometry.js';
import { asMapObject, effectiveBaseObjects, type Overrides } from '../shared/office-objects.js';

export type Point = { x: number; y: number };
export type Tile = { tx: number; ty: number };
export type Blocked = Set<string>;
export { TILE, WORLD, BLOCKED, BLOCKED_EDGES, canStep, isBlockedTile };

/** Reference walking pace: one tile every 142.86 ms (7 tiles per second). */
export const STEP_MS = 1000 / 6; // six tiles a second: a calm walking pace
export const RUN_STEP_MS = STEP_MS / 1.6;

export const tileOf = (point: Point): Tile => ({
  tx: Math.floor(point.x / TILE),
  ty: Math.floor(point.y / TILE),
});
export const tileCenter = (tile: Tile): Point => ({
  x: tile.tx * TILE + TILE / 2,
  y: tile.ty * TILE + TILE / 2,
});
export const sameTile = (a: Tile, b: Tile) => a.tx === b.tx && a.ty === b.ty;
export const blockedWith = (
  objects: { id: string; kind: string; x: number; y: number }[],
  overrides: Overrides = {},
): Blocked =>
  buildBlockedTiles(
    objects.map((object) => asMapObject(object)),
    effectiveBaseObjects(overrides),
  );
export const canStand = (tile: Tile, blocked: Blocked = BLOCKED) =>
  !isBlockedTile(tile.tx, tile.ty, blocked);

const NEIGHBOURS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
] as const;

/** A* over tiles; walls block edges, furniture blocks tiles. Returns the tiles after `start`. */
export function findTilePath(
  start: Tile,
  goal: Tile,
  blocked: Blocked = BLOCKED,
  limit = 6000,
): Tile[] {
  if (!canStand(start, blocked) || !canStand(goal, blocked)) return [];
  if (sameTile(start, goal)) return [];
  const index = (t: Tile) => t.ty * WORLD.cols + t.tx;
  const startIndex = index(start),
    goalIndex = index(goal);
  const scores = new Map<number, number>([[startIndex, 0]]);
  const previous = new Map<number, number>();
  const open = new Set<number>([startIndex]);
  const closed = new Set<number>();
  const heuristic = (i: number) => {
    const dx = Math.abs((i % WORLD.cols) - goal.tx),
      dy = Math.abs(Math.floor(i / WORLD.cols) - goal.ty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  let visited = 0;
  while (open.size && visited++ < limit) {
    let current = -1,
      lowest = Infinity;
    for (const i of open) {
      const f = scores.get(i)! + heuristic(i);
      if (f < lowest) {
        lowest = f;
        current = i;
      }
    }
    if (current === goalIndex) {
      const path: Tile[] = [];
      for (let i = current; i !== startIndex; i = previous.get(i)!)
        path.unshift({ tx: i % WORLD.cols, ty: Math.floor(i / WORLD.cols) });
      return path;
    }
    open.delete(current);
    closed.add(current);
    const cx = current % WORLD.cols,
      cy = Math.floor(current / WORLD.cols);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx,
        ny = cy + dy;
      if (!canStep(cx, cy, nx, ny, blocked)) continue;
      const next = ny * WORLD.cols + nx;
      if (closed.has(next)) continue;
      const cost = scores.get(current)! + (dx && dy ? Math.SQRT2 : 1);
      if (cost < (scores.get(next) ?? Infinity)) {
        scores.set(next, cost);
        previous.set(next, current);
        open.add(next);
      }
    }
  }
  return [];
}

/** Nearest free tile to a requested one, searched in growing rings, for clicks on furniture. */
export function nearestFreeTile(
  goal: Tile,
  blocked: Blocked = BLOCKED,
  maxRadius = 3,
): Tile | null {
  for (let radius = 0; radius <= maxRadius; radius++) {
    let best: Tile | null = null,
      bestDistance = Infinity;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const tile = { tx: goal.tx + dx, ty: goal.ty + dy };
        const distance = dx * dx + dy * dy;
        if (canStand(tile, blocked) && distance < bestDistance) {
          best = tile;
          bestDistance = distance;
        }
      }
    if (best) return best;
  }
  return null;
}
