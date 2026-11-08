import { describe, expect, it } from 'vitest';
import {
  TILE_SIZE_PX,
  canStep,
  createTileCollision,
  isBlockedTile,
  isEdgeBlocked,
  isTileInBounds,
  pixelToTile,
} from '../dist/index.js';

// Synthetic four-by-three-tile world; no legacy map or browser state is read.
const BOUNDS = { width: 4 * TILE_SIZE_PX, height: 3 * TILE_SIZE_PX };
const tile = (tx: number, ty: number) => ({ tx, ty });

describe('pixel-to-tile conversion', () => {
  it('uses the 32-pixel contract and floors fractional pixels', () => {
    expect(pixelToTile({ x: 0, y: 0 })).toEqual(tile(0, 0));
    expect(pixelToTile({ x: 31.999, y: 63.999 })).toEqual(tile(0, 1));
    expect(pixelToTile({ x: 32, y: 64 })).toEqual(tile(1, 2));
    expect(pixelToTile({ x: 95.75, y: 32.01 })).toEqual(tile(2, 1));
  });

  it('rejects non-finite pixel coordinates', () => {
    for (const point of [
      { x: Number.NaN, y: 0 },
      { x: 0, y: Number.POSITIVE_INFINITY },
      { x: Number.NEGATIVE_INFINITY, y: 0 },
    ])
      expect(() => pixelToTile(point)).toThrow(RangeError);
  });
});

describe('half-open world bounds', () => {
  it('accepts the last whole tile and rejects the boundary plus negative, fractional and non-finite tiles', () => {
    expect(isTileInBounds(tile(0, 0), BOUNDS)).toBe(true);
    expect(isTileInBounds(tile(3, 2), BOUNDS)).toBe(true);
    expect(isTileInBounds(tile(4, 2), BOUNDS)).toBe(false);
    expect(isTileInBounds(tile(3, 3), BOUNDS)).toBe(false);
    expect(isTileInBounds(tile(-1, 0), BOUNDS)).toBe(false);
    expect(isTileInBounds(tile(0, -1), BOUNDS)).toBe(false);
    expect(isTileInBounds(tile(1.5, 0), BOUNDS)).toBe(false);
    expect(isTileInBounds(tile(Number.NaN, 0), BOUNDS)).toBe(false);

    const justInside = pixelToTile({ x: BOUNDS.width - 1, y: BOUNDS.height - 1 });
    const boundary = pixelToTile({ x: BOUNDS.width, y: BOUNDS.height });
    expect(isTileInBounds(justInside, BOUNDS)).toBe(true);
    expect(isTileInBounds(boundary, BOUNDS)).toBe(false);
  });

  it('rejects steps whose origin or destination is out of bounds', () => {
    const collision = createTileCollision();
    expect(canStep(tile(3, 2), tile(4, 2), BOUNDS, collision)).toBe(false);
    expect(canStep(tile(0, 0), tile(-1, 0), BOUNDS, collision)).toBe(false);
    expect(canStep(tile(-1, 0), tile(0, 0), BOUNDS, collision)).toBe(false);
  });
});

describe('whole-tile blockers', () => {
  const collision = createTileCollision({ blockedTiles: [tile(2, 1)] });

  it('treats furniture as unwalkable in both directions', () => {
    expect(isBlockedTile(tile(2, 1), BOUNDS, collision)).toBe(true);
    expect(isBlockedTile(tile(1, 1), BOUNDS, collision)).toBe(false);
    expect(canStep(tile(1, 1), tile(2, 1), BOUNDS, collision)).toBe(false);
    expect(canStep(tile(2, 1), tile(1, 1), BOUNDS, collision)).toBe(false);
  });

  it('treats out-of-bounds tiles as blocked', () => {
    expect(isBlockedTile(tile(4, 0), BOUNDS, collision)).toBe(true);
    expect(isBlockedTile(tile(-1, 0), BOUNDS, collision)).toBe(true);
  });
});

describe('symmetric blocked edges and doorways', () => {
  it('blocks a wall in both directions', () => {
    const wall = createTileCollision({ blockedEdges: [[tile(0, 0), tile(1, 0)]] });

    expect(isEdgeBlocked(tile(0, 0), tile(1, 0), wall)).toBe(true);
    expect(isEdgeBlocked(tile(1, 0), tile(0, 0), wall)).toBe(true);
    expect(canStep(tile(0, 0), tile(1, 0), BOUNDS, wall)).toBe(false);
    expect(canStep(tile(1, 0), tile(0, 0), BOUNDS, wall)).toBe(false);
  });

  it('allows passage through an open doorway in both directions', () => {
    const doorway = createTileCollision();

    expect(isEdgeBlocked(tile(0, 1), tile(1, 1), doorway)).toBe(false);
    expect(canStep(tile(0, 1), tile(1, 1), BOUNDS, doorway)).toBe(true);
    expect(canStep(tile(1, 1), tile(0, 1), BOUNDS, doorway)).toBe(true);
  });

  it('rejects blocked-edge definitions that are not orthogonally adjacent', () => {
    expect(() => createTileCollision({ blockedEdges: [[tile(0, 0), tile(1, 1)]] })).toThrow(
      RangeError,
    );
  });
});

describe('diagonal steps', () => {
  const from = tile(0, 0);
  const to = tile(1, 1);

  it('allows a diagonal only when both orthogonal routes are open', () => {
    expect(canStep(from, to, BOUNDS, createTileCollision())).toBe(true);
    expect(canStep(to, from, BOUNDS, createTileCollision())).toBe(true);
  });

  it('is blocked when either two-step orthogonal route has a wall', () => {
    const routeEdges = [
      [tile(0, 0), tile(1, 0)],
      [tile(1, 0), tile(1, 1)],
      [tile(0, 0), tile(0, 1)],
      [tile(0, 1), tile(1, 1)],
    ] as const;

    for (const routeEdge of routeEdges) {
      const collision = createTileCollision({ blockedEdges: [routeEdge] });
      expect(canStep(from, to, BOUNDS, collision)).toBe(false);
      expect(canStep(to, from, BOUNDS, collision)).toBe(false);
    }
  });

  it('is blocked when either intermediate tile is furniture', () => {
    for (const intermediate of [tile(1, 0), tile(0, 1)]) {
      const collision = createTileCollision({ blockedTiles: [intermediate] });
      expect(canStep(from, to, BOUNDS, collision)).toBe(false);
    }
  });
});

describe('invalid tile moves', () => {
  const collision = createTileCollision();

  it('rejects zero-length moves and jumps', () => {
    expect(canStep(tile(0, 0), tile(0, 0), BOUNDS, collision)).toBe(false);
    expect(canStep(tile(0, 0), tile(2, 0), BOUNDS, collision)).toBe(false);
    expect(canStep(tile(0, 0), tile(0, 2), BOUNDS, collision)).toBe(false);
    expect(canStep(tile(0, 0), tile(1, 2), BOUNDS, collision)).toBe(false);
    expect(canStep(tile(0, 0), tile(2, 2), BOUNDS, collision)).toBe(false);
  });

  it('rejects fractional and non-finite tile coordinates', () => {
    const invalidTiles = [
      tile(0.5, 0),
      tile(0, 1.5),
      tile(Number.NaN, 0),
      tile(0, Number.POSITIVE_INFINITY),
      tile(Number.NEGATIVE_INFINITY, 0),
    ];

    for (const invalid of invalidTiles) {
      expect(canStep(tile(0, 0), invalid, BOUNDS, collision)).toBe(false);
      expect(canStep(invalid, tile(0, 0), BOUNDS, collision)).toBe(false);
    }
  });
});

describe('explicit pure geometry', () => {
  it('does not depend on legacy map or browser globals', () => {
    const globalKey = '__OFFICE_MAP__';
    const hadGlobal = Object.hasOwn(globalThis, globalKey);
    const previousGlobal = Reflect.get(globalThis, globalKey);
    const wall = createTileCollision({ blockedEdges: [[tile(0, 0), tile(1, 0)]] });
    const open = createTileCollision();

    try {
      for (const mapName of ['vivo', 'studio', 'not-a-map']) {
        Reflect.set(globalThis, globalKey, mapName);
        expect(canStep(tile(0, 1), tile(1, 1), BOUNDS, open)).toBe(true);
        expect(canStep(tile(0, 0), tile(1, 0), BOUNDS, wall)).toBe(false);
      }
    } finally {
      if (hadGlobal) Reflect.set(globalThis, globalKey, previousGlobal);
      else Reflect.deleteProperty(globalThis, globalKey);
    }
  });

  it('keeps separate worlds independent', () => {
    const open = createTileCollision();
    const furnished = createTileCollision({ blockedTiles: [tile(1, 1)] });

    expect(canStep(tile(0, 0), tile(1, 1), BOUNDS, open)).toBe(true);
    expect(canStep(tile(0, 0), tile(1, 1), BOUNDS, furnished)).toBe(false);
  });
});
