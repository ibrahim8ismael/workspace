import { describe, expect, it } from 'vitest';
import {
  COMMONS_GEOMETRY,
  TILE_SIZE_PX,
  canStep,
  isEdgeBlocked,
  validateOfficeGeometry,
} from '../dist/index.js';
import type {
  OfficeGeometry,
  OfficeObjectDefinition,
  OfficeSeatDefinition,
  TilePoint,
  TileRect,
} from '../dist/index.js';

const tile = (tx: number, ty: number): TilePoint => ({ tx, ty });

const withGeometry = (overrides: Partial<OfficeGeometry>): OfficeGeometry => ({
  ...COMMONS_GEOMETRY,
  ...overrides,
});

const cloneObjects = (): OfficeObjectDefinition[] =>
  COMMONS_GEOMETRY.objects.map((object) => ({
    ...object,
    blockedTiles: object.blockedTiles.map((blocked) => ({ ...blocked })),
    seats: object.seats.map((seat) => ({
      ...seat,
      tile: { ...seat.tile },
      exits: seat.exits.map((exit) => ({ ...exit })),
    })),
  }));

const firstSeat = (): OfficeSeatDefinition => {
  const seat = COMMONS_GEOMETRY.objects[0]?.seats[0];
  if (!seat) throw new Error('Commons fixture is missing its first seat');
  return seat;
};

const withFirstSeat = (
  replace: (seat: OfficeSeatDefinition) => OfficeSeatDefinition,
): OfficeGeometry => {
  const objects = cloneObjects();
  const firstObject = objects[0];
  if (!firstObject) throw new Error('Commons fixture is missing its first object');

  const seat = firstObject.seats[0];
  if (!seat) throw new Error('Commons fixture is missing its first seat');

  return withGeometry({
    objects: [
      { ...firstObject, seats: [replace(seat), ...firstObject.seats.slice(1)] },
      ...objects.slice(1),
    ],
  });
};

const failureMessage = (geometry: OfficeGeometry): string => {
  try {
    validateOfficeGeometry(geometry);
  } catch (error) {
    if (error instanceof RangeError) return error.message;
    throw error;
  }
  throw new Error('Expected validateOfficeGeometry to throw');
};

const tileInRect = (point: TilePoint, rect: TileRect): boolean =>
  point.tx >= rect.tx &&
  point.tx < rect.tx + rect.width &&
  point.ty >= rect.ty &&
  point.ty < rect.ty + rect.height;

const rectHasReachableTile = (
  rect: TileRect,
  isReachable: (point: TilePoint) => boolean,
): boolean => {
  for (let ty = rect.ty; ty < rect.ty + rect.height; ty += 1) {
    for (let tx = rect.tx; tx < rect.tx + rect.width; tx += 1) {
      if (isReachable(tile(tx, ty))) return true;
    }
  }
  return false;
};

const expectDeepFrozen = (value: unknown): void => {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Object.getOwnPropertyNames(value)) {
    expectDeepFrozen((value as Record<string, unknown>)[key]);
  }
};

describe('Commons fixed geometry', () => {
  it('validates the original 24 x 16 layout and returns derived world helpers', () => {
    const validated = validateOfficeGeometry(COMMONS_GEOMETRY);

    expect(validated.bounds).toEqual({
      width: 24 * TILE_SIZE_PX,
      height: 16 * TILE_SIZE_PX,
    });
    expect(validated.isReachable(tile(11, 8))).toBe(true);
    expect(COMMONS_GEOMETRY.mapId).toBe('commons');
    expect(COMMONS_GEOMETRY.tileSize).toBe(TILE_SIZE_PX);
    expect(COMMONS_GEOMETRY.spawn).toEqual({
      x: 11 * TILE_SIZE_PX + TILE_SIZE_PX / 2,
      y: 8 * TILE_SIZE_PX + TILE_SIZE_PX / 2,
    });

    const seats = COMMONS_GEOMETRY.objects.flatMap((object) => object.seats);
    expect(seats).toHaveLength(4);
    expect(COMMONS_GEOMETRY.zones.map((zone) => zone.bounds)).toEqual([
      { tx: 1, ty: 1, width: 8, height: 5 },
      { tx: 15, ty: 10, width: 8, height: 5 },
      { tx: 1, ty: 10, width: 7, height: 5 },
    ]);

    const meetingZones = COMMONS_GEOMETRY.zones.filter((zone) => zone.kind === 'meeting');
    expect(meetingZones).toHaveLength(2);
    for (const zone of meetingZones) {
      expect(seats.some((seat) => tileInRect(seat.tile, zone.bounds))).toBe(true);
    }

    const quietZone = COMMONS_GEOMETRY.zones.find((zone) => zone.kind === 'quiet');
    expect(quietZone?.zoneId).toBe('commons-southwest-quiet');
  });

  it('keeps only the static source deeply frozen and JSON serializable', () => {
    expectDeepFrozen(COMMONS_GEOMETRY);
    expect(JSON.parse(JSON.stringify(COMMONS_GEOMETRY))).toEqual(COMMONS_GEOMETRY);
  });

  it('spawns in the lobby and reaches every room, chair and exit through the doors', () => {
    const { bounds, collision, isReachable } = validateOfficeGeometry(COMMONS_GEOMETRY);

    expect(isReachable(tile(11, 8))).toBe(true);

    const doors = [
      { inside: tile(4, 5), outside: tile(4, 6) }, // Northwest south entrance.
      { inside: tile(7, 12), outside: tile(8, 12) }, // Southwest east entrance.
      { inside: tile(18, 10), outside: tile(18, 9) }, // Southeast north entrance.
    ];

    for (const door of doors) {
      expect(canStep(door.inside, door.outside, bounds, collision)).toBe(true);
      expect(canStep(door.outside, door.inside, bounds, collision)).toBe(true);
      expect(isReachable(door.inside)).toBe(true);
      expect(isReachable(door.outside)).toBe(true);
    }

    for (const zone of COMMONS_GEOMETRY.zones) {
      expect(rectHasReachableTile(zone.bounds, isReachable)).toBe(true);
    }

    for (const object of COMMONS_GEOMETRY.objects) {
      for (const seat of object.seats) {
        expect(isReachable(seat.tile)).toBe(true);
        for (const exit of seat.exits) {
          expect(isReachable(exit)).toBe(true);
        }
      }
    }
  });

  it('blocks traversal across closed room wall edges in both directions', () => {
    const { bounds, collision } = validateOfficeGeometry(COMMONS_GEOMETRY);
    const walls: ReadonlyArray<readonly [TilePoint, TilePoint]> = [
      [tile(5, 5), tile(5, 6)], // Northwest south wall beside the entrance.
      [tile(0, 3), tile(1, 3)], // Northwest west wall.
      [tile(22, 12), tile(23, 12)], // Southeast east wall.
      [tile(17, 9), tile(17, 10)], // Southeast north wall beside the entrance.
      [tile(7, 11), tile(8, 11)], // Southwest east wall beside the entrance.
      [tile(1, 9), tile(1, 10)], // Southwest north wall.
    ];

    for (const [from, to] of walls) {
      expect(isEdgeBlocked(from, to, collision)).toBe(true);
      expect(canStep(from, to, bounds, collision)).toBe(false);
      expect(canStep(to, from, bounds, collision)).toBe(false);
    }
  });
});

describe('Commons geometry validation failures', () => {
  it('rejects overlapping zone rectangles', () => {
    const geometry = withGeometry({
      zones: [
        ...COMMONS_GEOMETRY.zones,
        {
          zoneId: 'commons-overlap-test',
          label: 'Overlap test room',
          kind: 'meeting',
          bounds: { tx: 5, ty: 4, width: 4, height: 4 },
        },
      ],
    });

    expect(failureMessage(geometry)).toMatch(/overlaps/);
  });

  it('rejects a spawn on a blocked furniture tile', () => {
    const geometry = withGeometry({
      spawn: { x: 3 * TILE_SIZE_PX + TILE_SIZE_PX / 2, y: 2 * TILE_SIZE_PX + TILE_SIZE_PX / 2 },
    });

    expect(failureMessage(geometry)).toMatch(/spawn tile \(3,2\) must be walkable/);
  });

  it('rejects non-positive and oversized whole-tile dimensions', () => {
    expect(failureMessage(withGeometry({ widthTiles: 0 }))).toMatch(
      /widthTiles and heightTiles must be positive safe integers/,
    );
    expect(failureMessage(withGeometry({ heightTiles: 1025 }))).toMatch(
      /must not exceed 32768 pixels/,
    );
  });

  it('rejects duplicate blocked edges even when their endpoints are reversed', () => {
    const edge = COMMONS_GEOMETRY.blockedEdges[0];
    if (!edge) throw new Error('Commons fixture is missing a blocked edge');
    const [from, to] = edge;

    const geometry = withGeometry({
      blockedEdges: [...COMMONS_GEOMETRY.blockedEdges, [to, from] as const],
    });

    expect(failureMessage(geometry)).toMatch(/duplicates an earlier blocked edge/);
  });

  it('rejects duplicate object and zone identifiers', () => {
    const objects = cloneObjects();
    const firstObject = objects[0];
    const secondObject = objects[1];
    if (!firstObject || !secondObject) throw new Error('Commons fixture is missing a table');

    const duplicateObject = withGeometry({
      objects: [
        firstObject,
        { ...secondObject, objectId: firstObject.objectId },
        ...objects.slice(2),
      ],
    });
    expect(failureMessage(duplicateObject)).toMatch(/objectId duplicates an earlier objectId/);

    const firstZone = COMMONS_GEOMETRY.zones[0];
    const secondZone = COMMONS_GEOMETRY.zones[1];
    if (!firstZone || !secondZone) throw new Error('Commons fixture is missing a zone');

    const duplicateZone = withGeometry({
      zones: [
        firstZone,
        { ...secondZone, zoneId: firstZone.zoneId },
        ...COMMONS_GEOMETRY.zones.slice(2),
      ],
    });
    expect(failureMessage(duplicateZone)).toMatch(/zoneId duplicates an earlier zoneId/);
  });

  it('rejects duplicate chair tiles', () => {
    const objects = cloneObjects();
    const firstObject = objects[0];
    const secondObject = objects[1];
    if (!firstObject || !secondObject) throw new Error('Commons fixture is missing a table');

    const firstObjectSeat = firstObject.seats[0];
    const secondObjectSeat = secondObject.seats[0];
    if (!firstObjectSeat || !secondObjectSeat) throw new Error('Commons fixture is missing a seat');

    const geometry = withGeometry({
      objects: [
        firstObject,
        {
          ...secondObject,
          seats: [
            { ...secondObjectSeat, tile: { ...firstObjectSeat.tile } },
            ...secondObject.seats.slice(1),
          ],
        },
        ...objects.slice(2),
      ],
    });

    expect(failureMessage(geometry)).toMatch(/duplicates chair tile/);
  });

  it('rejects a seat ID that is not exactly its object ID and array index', () => {
    const geometry = withFirstSeat((seat) => ({
      ...seat,
      seatId: 'commons-southeast-table:0',
    }));

    expect(failureMessage(geometry)).toMatch(/seatId must equal "commons-northwest-table:0"/);
  });

  it('rejects exits that are not orthogonally adjacent to their chair', () => {
    const geometry = withFirstSeat((seat) => ({
      ...seat,
      exits: [tile(seat.tile.tx + 1, seat.tile.ty + 1)],
    }));

    expect(failureMessage(geometry)).toMatch(/must be orthogonally adjacent/);
  });

  it('rejects exits that are unreachable from spawn', () => {
    const seat = firstSeat();
    const exit = seat.exits[0];
    if (!exit) throw new Error('Commons fixture is missing its first exit');

    const geometry = withGeometry({
      blockedEdges: [
        ...COMMONS_GEOMETRY.blockedEdges,
        [seat.tile, exit] as const,
        [tile(exit.tx, exit.ty - 1), exit] as const,
        [exit, tile(exit.tx, exit.ty + 1)] as const,
      ],
    });

    expect(failureMessage(geometry)).toMatch(/must be reachable from spawn/);
  });

  it('rejects exits that are closed per canStep', () => {
    const seat = firstSeat();
    const exit = seat.exits[0];
    if (!exit) throw new Error('Commons fixture is missing its first exit');

    const geometry = withGeometry({
      blockedEdges: [...COMMONS_GEOMETRY.blockedEdges, [seat.tile, exit] as const],
    });

    expect(failureMessage(geometry)).toMatch(/must be open per canStep/);
  });
});
