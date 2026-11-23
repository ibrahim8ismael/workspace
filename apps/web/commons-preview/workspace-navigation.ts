import { canStep, isBlockedTile } from '@gather/world';
import type { TileCollision, TilePoint, WorldBounds } from '@gather/world';

const orthogonal: readonly TilePoint[] = [
  { tx: 0, ty: -1 },
  { tx: -1, ty: 0 },
  { tx: 1, ty: 0 },
  { tx: 0, ty: 1 },
];

const tileKey = ({ tx, ty }: TilePoint) => `${tx},${ty}`;
const neighbors = ({ tx, ty }: TilePoint) =>
  orthogonal.map((step) => ({ tx: tx + step.tx, ty: ty + step.ty }));

export function workspaceRoute(
  start: TilePoint,
  target: TilePoint,
  bounds: WorldBounds,
  collision: TileCollision,
  options: { occupied: ReadonlySet<string>; adjacent: boolean },
): TilePoint[] | null {
  const goals = (
    options.adjacent
      ? neighbors(target).filter((tile) => canStep(target, tile, bounds, collision))
      : [target]
  ).filter(
    (tile) => !isBlockedTile(tile, bounds, collision) && !options.occupied.has(tileKey(tile)),
  );
  if (!goals.length || isBlockedTile(start, bounds, collision)) return null;
  const goalKeys = new Set(goals.map(tileKey));
  const startKey = tileKey(start);
  const previous = new Map<string, TilePoint | null>([[startKey, null]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (goalKeys.has(tileKey(current))) {
      const route: TilePoint[] = [];
      for (let step: TilePoint | null = current; step; step = previous.get(tileKey(step)) ?? null)
        route.push(step);
      return route.reverse().slice(1);
    }
    for (const next of neighbors(current)) {
      const key = tileKey(next);
      if (
        previous.has(key) ||
        options.occupied.has(key) ||
        !canStep(current, next, bounds, collision)
      )
        continue;
      previous.set(key, current);
      queue.push(next);
    }
  }
  return null;
}

export function adjacentSeat(
  position: TilePoint,
  seat: TilePoint,
  bounds: WorldBounds,
  collision: TileCollision,
) {
  return tileKey(position) === tileKey(seat) || canStep(position, seat, bounds, collision);
}
