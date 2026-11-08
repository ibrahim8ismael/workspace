import {
  TILE_SIZE_PX,
  canStep,
  createTileCollision,
  isBlockedTile,
  isTileInBounds,
  pixelToTile,
} from './collision.js';
import type {
  OfficeGeometry,
  TileCollision,
  TilePoint,
  TileRect,
  ValidatedOfficeGeometry,
  WorldBounds,
  WorldPoint,
} from './types.js';

const MAX_DIMENSION_PX = 32768;
const MAX_SEATS = 512;
const MAX_ID_LENGTH = 80;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const ORTHOGONAL_STEPS: readonly TilePoint[] = [
  { tx: 0, ty: -1 },
  { tx: 1, ty: 0 },
  { tx: 0, ty: 1 },
  { tx: -1, ty: 0 },
];

/**
 * Validate typed fixed geometry, throwing a RangeError at the first invalid field. On success,
 * returns the derived bounds, collision data and spawn reachability query.
 *
 * This operation assumes the `OfficeGeometry` type shape is already present. Decoding untrusted
 * transport JSON is a separate boundary; no null/unknown/array structural guards are performed
 * here. The returned values are derived helpers, not frozen static data or runtime authority.
 */
export function validateOfficeGeometry(geometry: OfficeGeometry): ValidatedOfficeGeometry {
  assertBoundedId(geometry.mapId, 'mapId');
  if (geometry.tileSize !== TILE_SIZE_PX) {
    throw new RangeError(`tileSize must be ${TILE_SIZE_PX}`);
  }

  const bounds = createBounds(geometry.widthTiles, geometry.heightTiles);
  const spawnTile = validateSpawn(geometry.spawn, bounds);

  const blockedTiles: TilePoint[] = [];
  const objectIds = new Set<string>();

  for (const [objectIndex, object] of geometry.objects.entries()) {
    const label = `objects[${objectIndex}]`;
    assertBoundedId(object.objectId, `${label}.objectId`);
    if (objectIds.has(object.objectId)) {
      throw new RangeError(`${label}.objectId duplicates an earlier objectId`);
    }
    objectIds.add(object.objectId);

    for (const [tileIndex, tile] of object.blockedTiles.entries()) {
      assertTile(tile, `${label}.blockedTiles[${tileIndex}]`, bounds);
      blockedTiles.push(tile);
    }
  }

  validateBlockedEdges(geometry.blockedEdges, bounds);
  const collision = createTileCollision({
    blockedTiles,
    blockedEdges: geometry.blockedEdges,
  });

  if (isBlockedTile(spawnTile, bounds, collision)) {
    throw new RangeError(`spawn tile (${spawnTile.tx},${spawnTile.ty}) must be walkable`);
  }

  // Exactly one bounded orthogonal flood fill; in-bounds canStep calls cap the worklist by the
  // validated tile count.
  const reachable = collectReachableTiles(bounds, spawnTile, collision);

  const chairTiles = new Set<string>();
  let seatCount = 0;

  for (const [objectIndex, object] of geometry.objects.entries()) {
    for (const [seatIndex, seat] of object.seats.entries()) {
      seatCount += 1;
      if (seatCount > MAX_SEATS) {
        throw new RangeError(`geometry must define at most ${MAX_SEATS} seats`);
      }

      const label = `objects[${objectIndex}].seats[${seatIndex}]`;
      assertSeatId(seat.seatId, object.objectId, seatIndex, `${label}.seatId`);
      assertTile(seat.tile, `${label}.tile`, bounds);

      const chairKey = tileKey(seat.tile);
      if (chairTiles.has(chairKey)) {
        throw new RangeError(
          `${label}.tile duplicates chair tile (${seat.tile.tx},${seat.tile.ty})`,
        );
      }
      if (isBlockedTile(seat.tile, bounds, collision)) {
        throw new RangeError(`${label}.tile must be walkable, not furniture`);
      }
      if (!reachable.has(chairKey)) {
        throw new RangeError(`${label}.tile must be reachable from spawn`);
      }
      chairTiles.add(chairKey);

      if (seat.exits.length === 0) {
        throw new RangeError(`${label}.exits must contain at least one ordered exit`);
      }

      const exitKeys = new Set<string>();
      for (const [exitIndex, exit] of seat.exits.entries()) {
        const exitLabel = `${label}.exits[${exitIndex}]`;
        assertTile(exit, exitLabel, bounds);

        const exitKey = tileKey(exit);
        if (exitKeys.has(exitKey)) {
          throw new RangeError(`${exitLabel} duplicates an earlier exit`);
        }
        exitKeys.add(exitKey);

        const distance = Math.abs(exit.tx - seat.tile.tx) + Math.abs(exit.ty - seat.tile.ty);
        if (distance !== 1) {
          throw new RangeError(`${exitLabel} must be orthogonally adjacent to its chair`);
        }
        if (!reachable.has(exitKey)) {
          throw new RangeError(`${exitLabel} must be reachable from spawn`);
        }
        if (!canStep(seat.tile, exit, bounds, collision)) {
          throw new RangeError(`${exitLabel} must be open per canStep`);
        }
      }
    }
  }

  const zoneIds = new Set<string>();
  for (const [zoneIndex, zone] of geometry.zones.entries()) {
    const label = `zones[${zoneIndex}]`;
    assertBoundedId(zone.zoneId, `${label}.zoneId`);
    if (zoneIds.has(zone.zoneId)) {
      throw new RangeError(`${label}.zoneId duplicates an earlier zoneId`);
    }
    zoneIds.add(zone.zoneId);

    if (zone.kind !== 'meeting' && zone.kind !== 'quiet') {
      throw new RangeError(`${label}.kind must be "meeting" or "quiet"`);
    }

    assertTileRect(zone.bounds, `${label}.bounds`, geometry.widthTiles, geometry.heightTiles);
    if (!tileRectHasReachableTile(zone.bounds, reachable)) {
      throw new RangeError(`${label} (${zone.zoneId}) must contain a tile reachable from spawn`);
    }
  }

  for (const [firstIndex, first] of geometry.zones.entries()) {
    for (let secondIndex = firstIndex + 1; secondIndex < geometry.zones.length; secondIndex += 1) {
      const second = geometry.zones[secondIndex]!;
      if (tileRectsOverlap(first.bounds, second.bounds)) {
        throw new RangeError(
          `zones[${firstIndex}] (${first.zoneId}) overlaps zones[${secondIndex}] (${second.zoneId})`,
        );
      }
    }
  }

  return {
    bounds,
    collision,
    isReachable: (tile) => reachable.has(tileKey(tile)),
  };
}

function createBounds(widthTiles: number, heightTiles: number): WorldBounds {
  if (
    !Number.isSafeInteger(widthTiles) ||
    widthTiles <= 0 ||
    !Number.isSafeInteger(heightTiles) ||
    heightTiles <= 0
  ) {
    throw new RangeError('widthTiles and heightTiles must be positive safe integers');
  }

  const width = widthTiles * TILE_SIZE_PX;
  const height = heightTiles * TILE_SIZE_PX;
  if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
    throw new RangeError(`geometry dimensions must not exceed ${MAX_DIMENSION_PX} pixels per axis`);
  }
  return { width, height };
}

function validateSpawn(spawn: WorldPoint, bounds: WorldBounds): TilePoint {
  if (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.y)) {
    throw new RangeError('spawn must use finite world-pixel coordinates');
  }
  if (spawn.x < 0 || spawn.y < 0 || spawn.x >= bounds.width || spawn.y >= bounds.height) {
    throw new RangeError('spawn must lie inside the half-open world bounds');
  }
  return pixelToTile(spawn);
}

function validateBlockedEdges(
  edges: readonly (readonly [TilePoint, TilePoint])[],
  bounds: WorldBounds,
): void {
  const seen = new Set<string>();

  for (const [index, [from, to]] of edges.entries()) {
    assertTile(from, `blockedEdges[${index}][0]`, bounds);
    assertTile(to, `blockedEdges[${index}][1]`, bounds);

    if (Math.abs(from.tx - to.tx) + Math.abs(from.ty - to.ty) !== 1) {
      throw new RangeError(`blockedEdges[${index}] must connect orthogonally adjacent tiles`);
    }

    const key = undirectedEdgeKey(from, to);
    if (seen.has(key)) {
      throw new RangeError(`blockedEdges[${index}] duplicates an earlier blocked edge`);
    }
    seen.add(key);
  }
}

function collectReachableTiles(
  bounds: WorldBounds,
  spawn: TilePoint,
  collision: TileCollision,
): Set<string> {
  const reachable = new Set<string>([tileKey(spawn)]);
  const worklist: TilePoint[] = [spawn];

  for (let head = 0; head < worklist.length; head += 1) {
    const current = worklist[head]!;

    for (const step of ORTHOGONAL_STEPS) {
      const next = { tx: current.tx + step.tx, ty: current.ty + step.ty };
      const key = tileKey(next);
      if (reachable.has(key)) continue;
      if (!canStep(current, next, bounds, collision)) continue;

      reachable.add(key);
      worklist.push(next);
    }
  }

  return reachable;
}

function assertTile(tile: TilePoint, label: string, bounds: WorldBounds): void {
  if (!Number.isSafeInteger(tile.tx) || !Number.isSafeInteger(tile.ty)) {
    throw new RangeError(`${label} must use safe integer tile coordinates`);
  }
  if (!isTileInBounds(tile, bounds)) {
    throw new RangeError(`${label} must be inside the world bounds`);
  }
}

function assertTileRect(
  rect: TileRect,
  label: string,
  widthTiles: number,
  heightTiles: number,
): void {
  if (
    !Number.isSafeInteger(rect.tx) ||
    !Number.isSafeInteger(rect.ty) ||
    !Number.isSafeInteger(rect.width) ||
    !Number.isSafeInteger(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new RangeError(
      `${label} must use safe integer tile coordinates and positive whole-tile dimensions`,
    );
  }

  if (
    rect.tx < 0 ||
    rect.ty < 0 ||
    rect.tx + rect.width > widthTiles ||
    rect.ty + rect.height > heightTiles
  ) {
    throw new RangeError(`${label} must be inside the world tile bounds`);
  }
}

function assertBoundedId(value: string, label: string): void {
  if (value.length === 0 || value.length > MAX_ID_LENGTH || !ID_PATTERN.test(value)) {
    throw new RangeError(
      `${label} must be 1-${MAX_ID_LENGTH} characters of [A-Za-z0-9_-] starting alphanumeric`,
    );
  }
}

function assertSeatId(seatId: string, objectId: string, index: number, label: string): void {
  const expected = `${objectId}:${index}`;
  if (seatId.length > MAX_ID_LENGTH) {
    throw new RangeError(`${label} must be at most ${MAX_ID_LENGTH} characters`);
  }
  if (seatId !== expected) {
    throw new RangeError(`${label} must equal "${expected}"`);
  }
}

function tileRectHasReachableTile(rect: TileRect, reachable: ReadonlySet<string>): boolean {
  for (let ty = rect.ty; ty < rect.ty + rect.height; ty += 1) {
    for (let tx = rect.tx; tx < rect.tx + rect.width; tx += 1) {
      if (reachable.has(tileKey({ tx, ty }))) return true;
    }
  }
  return false;
}

function tileRectsOverlap(first: TileRect, second: TileRect): boolean {
  return (
    first.tx < second.tx + second.width &&
    second.tx < first.tx + first.width &&
    first.ty < second.ty + second.height &&
    second.ty < first.ty + first.height
  );
}

function tileKey(tile: TilePoint): string {
  return `${tile.tx},${tile.ty}`;
}

function undirectedEdgeKey(from: TilePoint, to: TilePoint): string {
  const fromFirst = from.tx < to.tx || (from.tx === to.tx && from.ty <= to.ty);
  return fromFirst ? `${tileKey(from)}|${tileKey(to)}` : `${tileKey(to)}|${tileKey(from)}`;
}
