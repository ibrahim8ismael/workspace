# Pure world rules

Deterministic, engine-independent tile rules shared by the authoritative server and browser
renderer. The package has no framework, database, network, browser or legacy-map dependencies.

## Scope

This first CP02 batch implements discrete tile collision only. It answers whether one adjacent tile
step is open; it does not implement continuous movement, pathfinding, speed, timing, map/asset
export, seats, zones, runtime authority or admission. Physical movement and server timing remain
CP05 work and must not treat this helper as runtime authorization by itself.

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
retain [the upstream MIT notice](LICENSE.upstream). No upstream map coordinates or artwork are
included in this package.

`COMMONS_GEOMETRY` is the original static floor plan for the `commons` map. It contains
the spawn, walls, object blockers, chairs and zones as deeply frozen JSON data. The room
layout is recorded in the [CP02 plan](../../docs/planning/CP02_WORLD_AND_MAP.md#original-commons-floor-plan).

`validateOfficeGeometry` checks typed geometry and returns pixel bounds, collision data and
a tile reachability query. It throws a `RangeError` on the first invalid field. A future reader
of untrusted JSON needs a separate structural decoder before calling it. The catalog, immutable
export and Phaser sample are the remaining CP02 batches.

The imported Vivo files remain historical migration material only. Their measured Gather 2.0
reference geometry and art provenance are unresolved and must not be promoted into an approved map
or asset registry. The repository's upstream MIT notice alone does not approve that material, and
no legacy map data is imported here.

## Verification

`pnpm test:world` builds the package, typechecks the tests and exercises collision rules and the
original floor plan. The root `pnpm check` includes this command.
