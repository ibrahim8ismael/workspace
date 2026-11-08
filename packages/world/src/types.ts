/**
 * A pixel position in world space. The origin is the top-left, x grows to the right and y grows
 * down. Fractional pixel values are allowed; conversion to tiles floors them.
 */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Pixel dimensions of a world. Bounds are half-open on every edge: `[0, width) x [0, height)`.
 * A tile is inside only when its entire 32 by 32 pixel square lies inside those bounds, not merely
 * when its origin does; a tile whose far edge crosses `width` or `height` is out of bounds.
 */
export interface WorldBounds {
  readonly width: number;
  readonly height: number;
}

/** Integer tile coordinates. Tile (tx, ty) covers that tile's 32 by 32 pixel square. */
export interface TilePoint {
  readonly tx: number;
  readonly ty: number;
}

/**
 * Explicit collision input for one world. The key strings are canonical package representation;
 * construct this with `createTileCollision` rather than synthesizing keys by hand.
 */
export interface TileCollision {
  readonly blockedTiles: ReadonlySet<string>;
  readonly blockedEdges: ReadonlySet<string>;
}

/**
 * Collision data before canonical keys are built. Edges are undirected here;
 * `createTileCollision` records both directions.
 */
export interface TileCollisionInput {
  readonly blockedTiles?: Iterable<TilePoint>;
  readonly blockedEdges?: Iterable<readonly [TilePoint, TilePoint]>;
}
