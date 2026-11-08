import { TILE_SIZE_PX } from './collision.js';
import type { OfficeGeometry, TilePoint, TileRect } from './types.js';

const COMMONS_WIDTH_TILES = 24;
const COMMONS_HEIGHT_TILES = 16;

const NORTHWEST_MEETING: TileRect = { tx: 1, ty: 1, width: 8, height: 5 };
const SOUTHEAST_MEETING: TileRect = { tx: 15, ty: 10, width: 8, height: 5 };
const SOUTHWEST_QUIET: TileRect = { tx: 1, ty: 10, width: 7, height: 5 };

type RoomSide = 'north' | 'south' | 'east' | 'west';

interface RoomEntrance {
  readonly side: RoomSide;
  readonly at: number;
}

/**
 * Create the four walls of a room as undirected tile edges. An entrance removes exactly one
 * boundary edge, so every other wall segment blocks travel in both directions. The schematic
 * uses tile coordinates throughout; this helper is only construction, not runtime authority.
 */
function roomBoundaryEdges(
  rect: TileRect,
  entrances: readonly RoomEntrance[],
): readonly (readonly [TilePoint, TilePoint])[] {
  const openEntrances = new Set(entrances.map((entrance) => `${entrance.side}:${entrance.at}`));
  const edges: Array<readonly [TilePoint, TilePoint]> = [];

  const add = (side: RoomSide, at: number, from: TilePoint, to: TilePoint): void => {
    if (!openEntrances.has(`${side}:${at}`)) edges.push([from, to]);
  };

  for (let tx = rect.tx; tx < rect.tx + rect.width; tx += 1) {
    add('north', tx, { tx, ty: rect.ty - 1 }, { tx, ty: rect.ty });
    add('south', tx, { tx, ty: rect.ty + rect.height - 1 }, { tx, ty: rect.ty + rect.height });
  }

  for (let ty = rect.ty; ty < rect.ty + rect.height; ty += 1) {
    add('west', ty, { tx: rect.tx - 1, ty }, { tx: rect.tx, ty });
    add('east', ty, { tx: rect.tx + rect.width - 1, ty }, { tx: rect.tx + rect.width, ty });
  }

  return edges;
}

const COMMONS_BLOCKED_EDGES: readonly (readonly [TilePoint, TilePoint])[] = [
  // Northwest meeting room: south entrance at column 4.
  ...roomBoundaryEdges(NORTHWEST_MEETING, [{ side: 'south', at: 4 }]),
  // Southeast meeting room: north entrance at column 18.
  ...roomBoundaryEdges(SOUTHEAST_MEETING, [{ side: 'north', at: 18 }]),
  // Southwest quiet room, which is deliberately not a meeting zone: east entrance at row 12.
  ...roomBoundaryEdges(SOUTHWEST_QUIET, [{ side: 'east', at: 12 }]),
];

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;

  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/**
 * Original, fixed CP02 Commons office geometry.
 *
 * The map is 24 x 16 whole 32-pixel tiles. The central lobby spawn is tile (11, 8), stored as
 * its world-pixel center. Room boundaries, furniture footprints, chairs and ordered exits use
 * tile coordinates. This static source is deeply frozen and JSON serializable. Validation and
 * collision results returned by `validateOfficeGeometry` are derived and are not frozen.
 */
export const COMMONS_GEOMETRY: OfficeGeometry = deepFreeze<OfficeGeometry>({
  mapId: 'commons',
  tileSize: TILE_SIZE_PX,
  widthTiles: COMMONS_WIDTH_TILES,
  heightTiles: COMMONS_HEIGHT_TILES,
  spawn: {
    x: 11 * TILE_SIZE_PX + TILE_SIZE_PX / 2,
    y: 8 * TILE_SIZE_PX + TILE_SIZE_PX / 2,
  },
  blockedEdges: [...COMMONS_BLOCKED_EDGES],
  objects: [
    {
      objectId: 'commons-northwest-table',
      label: 'Northwest meeting table',
      blockedTiles: [
        { tx: 3, ty: 2 },
        { tx: 4, ty: 2 },
        { tx: 3, ty: 3 },
        { tx: 4, ty: 3 },
      ],
      seats: [
        {
          seatId: 'commons-northwest-table:0',
          tile: { tx: 2, ty: 2 },
          exits: [
            { tx: 1, ty: 2 },
            { tx: 2, ty: 3 },
            { tx: 2, ty: 1 },
          ],
        },
        {
          seatId: 'commons-northwest-table:1',
          tile: { tx: 5, ty: 2 },
          exits: [
            { tx: 6, ty: 2 },
            { tx: 5, ty: 3 },
            { tx: 5, ty: 1 },
          ],
        },
      ],
    },
    {
      objectId: 'commons-southeast-table',
      label: 'Southeast meeting table',
      blockedTiles: [
        { tx: 18, ty: 11 },
        { tx: 19, ty: 11 },
        { tx: 18, ty: 12 },
        { tx: 19, ty: 12 },
      ],
      seats: [
        {
          seatId: 'commons-southeast-table:0',
          tile: { tx: 17, ty: 11 },
          exits: [
            { tx: 16, ty: 11 },
            { tx: 17, ty: 10 },
            { tx: 17, ty: 12 },
          ],
        },
        {
          seatId: 'commons-southeast-table:1',
          tile: { tx: 20, ty: 11 },
          exits: [
            { tx: 21, ty: 11 },
            { tx: 20, ty: 10 },
            { tx: 20, ty: 12 },
          ],
        },
      ],
    },
  ],
  zones: [
    {
      zoneId: 'commons-northwest-meeting',
      label: 'Northwest meeting room',
      kind: 'meeting',
      bounds: { ...NORTHWEST_MEETING },
    },
    {
      zoneId: 'commons-southeast-meeting',
      label: 'Southeast meeting room',
      kind: 'meeting',
      bounds: { ...SOUTHEAST_MEETING },
    },
    {
      zoneId: 'commons-southwest-quiet',
      label: 'Southwest quiet room',
      kind: 'quiet',
      bounds: { ...SOUTHWEST_QUIET },
    },
  ],
});
