# Pure world rules

Deterministic, engine-independent tile rules shared by the authoritative server and browser
renderer. The package has no framework, database, network or browser dependencies.

## Scope

The initial CP02 helper batch implemented discrete tile collision. It answers whether one adjacent
tile step is open; it does not implement continuous movement, pathfinding, speed or timing. Later
CP02 work adds map-specific geometry, seats and zones; CP05 provides runtime authority and admission.
Do not treat these pure helpers as runtime authorization by themselves.

### Coordinates and bounds

- Pixels use a top-left origin, positive x to the right and y down. One tile is `TILE_SIZE_PX` (32)
  pixels.
- `pixelToTile` floors fractional pixels and rejects non-finite coordinates.
- `WorldBounds` is passed explicitly as pixel width and height. Tiles must lie wholly inside the
  half-open bounds: `(0, 0)` is valid and `x = width` or `y = height` is not.
- Collision data is explicit too. `createTileCollision` builds whole-tile blockers and records each
  undirected blocked-edge input in both directions. There are no ambient map defaults or mutable
  caches.

### Movement rule

`canStep(from, to, bounds, collision)` accepts exactly one adjacent orthogonal or diagonal tile
move. It rejects zero-length moves, jumps, fractional or non-finite tile coordinates, out-of-bounds
or blocked origins and destinations, and blocked edges. A diagonal is accepted only when both
orthogonal two-step routes are open, preserving legacy corner-cut prevention.

```ts
import { TILE_SIZE_PX, canStep, createTileCollision, pixelToTile } from '@gather/world';

const bounds = { width: 4 * TILE_SIZE_PX, height: 3 * TILE_SIZE_PX };
const collision = createTileCollision({
  blockedTiles: [{ tx: 2, ty: 1 }],
  blockedEdges: [
    [
      { tx: 0, ty: 0 },
      { tx: 1, ty: 0 },
    ],
  ],
});

const from = pixelToTile({ x: 16, y: 16 }); // { tx: 0, ty: 0 }
canStep(from, { tx: 0, ty: 1 }, bounds, collision); // true
canStep(from, { tx: 1, ty: 0 }, bounds, collision); // false: wall
```

## Status and provenance

The discrete wall/diagonal rule was adapted from the pinned upstream shared geometry helpers;
retain [the upstream MIT notice](LICENSE.upstream).

`COMMONS_GEOMETRY` is the original static floor plan for the `commons` map. It contains
the spawn, walls, object blockers, chairs and zones as deeply frozen JSON data. The room
layout is recorded in the [CP02 plan](../../docs/planning/CP02_WORLD_AND_MAP.md#original-commons-floor-plan).

`validateOfficeGeometry` checks typed geometry and returns pixel bounds, collision data and
a tile reachability query. It throws a `RangeError` on the first invalid field. A future reader
of untrusted JSON needs a separate structural decoder before calling it. The catalog, immutable
export and Phaser sample were added in later CP02 batches; server movement and admission remain in
CP05.

By owner direction, `VIVO_GEOMETRY` now derives authoritative bounds, wall edges, blockers, seats
and meeting zones from the imported OpenOfficeForAll Vivo files. The upstream map header identifies
its measured reference as Gather 2.0; preserve that provenance and the upstream notice. Geometry
includes both wall/furniture blockers and the map's 93 unique terrain-blocked tiles. The API now
registers immutable versions for both Commons and Vivo; new offices use Vivo while stored Commons
offices remain supported. `pnpm check:vivo` verifies the checked-in Vivo map artifact against this
geometry. The client renderer and authenticated office adapter are connected in the companion UI
integration batch.

## Verification

`pnpm test:world` builds the package, typechecks the tests and exercises collision rules, the
original floor plan and the derived Vivo geometry. The root `pnpm check` includes this command.
