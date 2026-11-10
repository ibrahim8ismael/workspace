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

/**
 * A half-open tile rectangle. The rectangle covers `tx <= x < tx + width` and
 * `ty <= y < ty + height`; its own `width` and `height` are measured in whole tiles.
 */
export interface TileRect {
  readonly tx: number;
  readonly ty: number;
  readonly width: number;
  readonly height: number;
}

/** Static zone purpose. Only meeting zones participate in meeting policy. */
export type OfficeZoneKind = 'meeting' | 'quiet';

/**
 * One fixed chair. The tile is walkable and the ordered exits are orthogonal
 * destination tiles used by a future sit/stand authority.
 */
export interface OfficeSeatDefinition {
  /** Stable `<objectId>:<index>` identity within the parent object. */
  readonly seatId: string;
  /** The chair's walkable tile. */
  readonly tile: TilePoint;
  /** Deterministic stand priority: first valid exit wins. */
  readonly exits: readonly TilePoint[];
}

/** One fixed furniture object and its occupied tiles. */
export interface OfficeObjectDefinition {
  readonly objectId: string;
  readonly label: string;
  /** Occupied furniture footprint. These tiles are not walkable. */
  readonly blockedTiles: readonly TilePoint[];
  readonly seats: readonly OfficeSeatDefinition[];
}

/** One fixed room/area rectangle. */
export interface OfficeZoneDefinition {
  readonly zoneId: string;
  readonly label: string;
  readonly kind: OfficeZoneKind;
  readonly bounds: TileRect;
}

/**
 * The typed, fixed office geometry that a future deterministic export will serialize.
 * It is plain JSON data: no Sets, Maps, functions or runtime state. This type is a
 * validation input, not decoded untrusted JSON and not runtime seat/occupancy authority.
 */
export interface OfficeGeometry {
  readonly mapId: string;
  readonly tileSize: number;
  readonly widthTiles: number;
  readonly heightTiles: number;
  /** Spawn center in world pixels, not tile coordinates. */
  readonly spawn: WorldPoint;
  /** Terrain-blocked tiles, including non-furniture obstacles such as water. */
  readonly blockedTiles?: readonly TilePoint[];
  /** Undirected room/wall edges; each tuple is in arbitrary endpoint order. */
  readonly blockedEdges: readonly (readonly [TilePoint, TilePoint])[];
  readonly objects: readonly OfficeObjectDefinition[];
  readonly zones: readonly OfficeZoneDefinition[];
}

/**
 * Successful typed-geometry validation result. Bounds and collision are derived from the static
 * source and are not frozen; `isReachable` is a read-only query over the validated world.
 */
export interface ValidatedOfficeGeometry {
  readonly bounds: WorldBounds;
  readonly collision: TileCollision;
  readonly isReachable: (tile: TilePoint) => boolean;
}
