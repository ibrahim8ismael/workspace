import type {
  TileCollision,
  TileCollisionInput,
  TilePoint,
  WorldBounds,
  WorldPoint,
} from './types.js';

/** The office protocol's fixed tile size in pixels. */
export const TILE_SIZE_PX = 32;

/**
 * Convert a pixel position to the tile containing it. Fractional pixel values are floored, so a
 * point at the top-left of a tile belongs to that tile. Non-finite pixel coordinates are rejected.
 */
export function pixelToTile(point: WorldPoint): TilePoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError('World point must have finite pixel coordinates');
  return { tx: Math.floor(point.x / TILE_SIZE_PX), ty: Math.floor(point.y / TILE_SIZE_PX) };
}

/**
 * Build explicit immutable-input collision data. Each blocked edge is stored in both directions so
 * adjacent tiles see the same wall. Edges must connect orthogonally adjacent integer tiles.
 */
export function createTileCollision(input: TileCollisionInput = {}): TileCollision {
  const blockedTiles = new Set<string>();
  for (const tile of input.blockedTiles ?? []) {
    assertTile(tile, 'Blocked tile');
    blockedTiles.add(tileKey(tile));
  }

  const blockedEdges = new Set<string>();
  for (const [a, b] of input.blockedEdges ?? []) {
    assertTile(a, 'Blocked edge endpoint');
    assertTile(b, 'Blocked edge endpoint');
    if (!areOrthogonallyAdjacent(a, b))
      throw new RangeError('Blocked edges must connect orthogonally adjacent tiles');
    blockedEdges.add(edgeKey(a, b));
    blockedEdges.add(edgeKey(b, a));
  }

  return Object.freeze({ blockedTiles, blockedEdges });
}

/** True when every part of the tile lies inside the half-open pixel bounds. */
export function isTileInBounds(tile: TilePoint, bounds: WorldBounds): boolean {
  if (!isInteger(tile.tx) || !isInteger(tile.ty)) return false;
  if (!isInteger(bounds.width) || !isInteger(bounds.height)) return false;
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  return (
    tile.tx >= 0 &&
    tile.ty >= 0 &&
    (tile.tx + 1) * TILE_SIZE_PX <= bounds.width &&
    (tile.ty + 1) * TILE_SIZE_PX <= bounds.height
  );
}

/** True when a tile is outside the bounds or explicitly blocked as a whole tile. */
export function isBlockedTile(
  tile: TilePoint,
  bounds: WorldBounds,
  collision: TileCollision,
): boolean {
  return !isTileInBounds(tile, bounds) || collision.blockedTiles.has(tileKey(tile));
}

/**
 * True when the edge between two orthogonally adjacent tiles is blocked. The lookup is symmetric,
 * so a wall blocks travel in both directions.
 */
export function isEdgeBlocked(from: TilePoint, to: TilePoint, collision: TileCollision): boolean {
  if (!isInteger(from.tx) || !isInteger(from.ty)) return true;
  if (!isInteger(to.tx) || !isInteger(to.ty)) return true;
  if (!areOrthogonallyAdjacent(from, to)) return true;
  return (
    collision.blockedEdges.has(edgeKey(from, to)) || collision.blockedEdges.has(edgeKey(to, from))
  );
}

/**
 * Discrete tile reachability for exactly one adjacent move. This is not continuous movement,
 * speed, timing or runtime authority.
 *
 * Returns false for zero-length moves, jumps, fractional or non-finite tile coordinates,
 * out-of-bounds or blocked origins and destinations, and blocked edges. A diagonal move is allowed
 * only when both orthogonal two-step routes between the tiles are open, which prevents corner
 * cutting. World dimensions and collision data are always supplied by the caller.
 */
export function canStep(
  from: TilePoint,
  to: TilePoint,
  bounds: WorldBounds,
  collision: TileCollision,
): boolean {
  if (!isTileInBounds(from, bounds) || !isTileInBounds(to, bounds)) return false;
  if (isBlockedTile(from, bounds, collision) || isBlockedTile(to, bounds, collision)) return false;

  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  if (dx === 0 && dy === 0) return false;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;

  if (dx === 0 || dy === 0) return !isEdgeBlocked(from, to, collision);

  const horizontal = { tx: to.tx, ty: from.ty };
  const vertical = { tx: from.tx, ty: to.ty };
  return (
    canStep(from, horizontal, bounds, collision) &&
    canStep(horizontal, to, bounds, collision) &&
    canStep(from, vertical, bounds, collision) &&
    canStep(vertical, to, bounds, collision)
  );
}

function tileKey(tile: TilePoint): string {
  return `${tile.tx},${tile.ty}`;
}

function edgeKey(from: TilePoint, to: TilePoint): string {
  return `${tileKey(from)}:${tileKey(to)}`;
}

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

function assertTile(tile: TilePoint, label: string): void {
  if (!isInteger(tile.tx) || !isInteger(tile.ty))
    throw new RangeError(`${label} must use finite integer tile coordinates`);
}

function areOrthogonallyAdjacent(a: TilePoint, b: TilePoint): boolean {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) === 1;
}
