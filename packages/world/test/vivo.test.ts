import { describe, expect, it } from 'vitest';
import { VIVO_BLOCKED_TILES, VIVO_GEOMETRY, validateOfficeGeometry } from '../src/index.js';

describe('imported OpenOffice Vivo geometry', () => {
  it('derives the server world contract from the same fixed map source', () => {
    const validated = validateOfficeGeometry(VIVO_GEOMETRY);
    const seats = VIVO_GEOMETRY.objects.flatMap((object) => object.seats);

    expect(VIVO_GEOMETRY.mapId).toBe('vivo');
    expect(validated.bounds).toEqual({ width: 1664, height: 1600 });
    expect(VIVO_GEOMETRY.objects).toHaveLength(203);
    expect(VIVO_GEOMETRY.blockedTiles).toEqual(VIVO_BLOCKED_TILES);
    expect(VIVO_BLOCKED_TILES.length).toBeGreaterThan(0);
    expect(seats).toHaveLength(58);
    expect(VIVO_GEOMETRY.zones).toHaveLength(5);
    expect(
      validated.isReachable({
        tx: Math.floor(VIVO_GEOMETRY.spawn.x / VIVO_GEOMETRY.tileSize),
        ty: Math.floor(VIVO_GEOMETRY.spawn.y / VIVO_GEOMETRY.tileSize),
      }),
    ).toBe(true);
  });
});
