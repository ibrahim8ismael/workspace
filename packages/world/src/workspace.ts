import { TILE_SIZE_PX } from './collision.js';
import type { OfficeGeometry, TilePoint } from './types.js';

export const MAX_WORKSPACE_ROOM_COUNT = 100;
const ROOM_COLUMNS = 5;
const ROOM_WIDTH = 8;
const ROOM_HEIGHT = 6;
const ROOM_COLUMN_GAP = 2;
const ROOM_ROW_GAP = 2;

/**
 * Build a bounded, deterministic office from the shared 8x6-tile meeting-room design.
 * Room IDs and positions are index-based and remain stable when rooms are appended or removed.
 */
export function generateWorkspaceOfficeGeometry(roomCount: number): OfficeGeometry {
  if (!Number.isSafeInteger(roomCount) || roomCount < 1 || roomCount > MAX_WORKSPACE_ROOM_COUNT)
    throw new RangeError(`roomCount must be between 1 and ${MAX_WORKSPACE_ROOM_COUNT}`);

  const rowCount = Math.ceil(roomCount / ROOM_COLUMNS);
  const widthTiles = 2 + ROOM_COLUMNS * ROOM_WIDTH + (ROOM_COLUMNS - 1) * ROOM_COLUMN_GAP;
  const heightTiles = 2 + rowCount * ROOM_HEIGHT + (rowCount - 1) * ROOM_ROW_GAP;
  const zones: OfficeGeometry['zones'][number][] = [];
  const blockedEdges: (readonly [TilePoint, TilePoint])[] = [];

  for (let index = 0; index < roomCount; index += 1) {
    const column = index % ROOM_COLUMNS;
    const row = Math.floor(index / ROOM_COLUMNS);
    const tx = 1 + column * (ROOM_WIDTH + ROOM_COLUMN_GAP);
    const ty = 1 + row * (ROOM_HEIGHT + ROOM_ROW_GAP);
    const zoneId = `workspace-room-${String(index + 1).padStart(3, '0')}`;
    zones.push({
      zoneId,
      label: `Meeting room ${index + 1}`,
      kind: 'meeting',
      bounds: { tx, ty, width: ROOM_WIDTH, height: ROOM_HEIGHT },
    });

    // A two-tile doorway makes every room accessible from the continuous halls. The first room
    // opens south; each later room opens west, keeping the rule independent of the room count.
    const entranceSide = column === 0 ? 'south' : 'west';
    const entranceStart =
      entranceSide === 'south'
        ? tx + Math.floor(ROOM_WIDTH / 2) - 1
        : ty + Math.floor(ROOM_HEIGHT / 2) - 1;

    for (let x = tx; x < tx + ROOM_WIDTH; x += 1) {
      blockedEdges.push([
        { tx: x, ty: ty - 1 },
        { tx: x, ty },
      ]);
      if (entranceSide !== 'south' || (x !== entranceStart && x !== entranceStart + 1))
        blockedEdges.push([
          { tx: x, ty: ty + ROOM_HEIGHT - 1 },
          { tx: x, ty: ty + ROOM_HEIGHT },
        ]);
    }
    for (let y = ty; y < ty + ROOM_HEIGHT; y += 1) {
      if (entranceSide !== 'west' || (y !== entranceStart && y !== entranceStart + 1))
        blockedEdges.push([
          { tx: tx - 1, ty: y },
          { tx, ty: y },
        ]);
      blockedEdges.push([
        { tx: tx + ROOM_WIDTH - 1, ty: y },
        { tx: tx + ROOM_WIDTH, ty: y },
      ]);
    }
  }

  return {
    mapId: 'workspace',
    tileSize: TILE_SIZE_PX,
    widthTiles,
    heightTiles,
    spawn: {
      x: (1 + 2 * (ROOM_WIDTH + ROOM_COLUMN_GAP) + ROOM_WIDTH + ROOM_COLUMN_GAP / 2) * TILE_SIZE_PX,
      y: Math.floor(heightTiles / 2) * TILE_SIZE_PX + TILE_SIZE_PX / 2,
    },
    blockedEdges,
    objects: [],
    zones,
  };
}
