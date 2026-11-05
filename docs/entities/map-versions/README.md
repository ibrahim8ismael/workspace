# Map versions

Status: draft plan · Updated: 2026-11-05 · Target: M0–M2

## Responsibility

Provide the same immutable geometry and identifiers to Phaser and server simulation.

- Owning module: Maps / packages/world.
- State location: Immutable static manifests; MongoDB metadata if needed.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `mapId`
- `version`
- `contentHash`
- `coordinateUnits`
- `tileSize`
- `worldBounds`
- `spawnPoints`
- `collisionShapes`
- `blockedEdges`
- `objectIds`
- `seatDefinitions`
- `zoneDefinitions`
- `assetManifestVersion`

## Relationships

- [Offices](../offices/README.md)
- [Map Overrides](../map-overrides/README.md)
- [Seats](../seats/README.md)
- [Meeting Zones](../meeting-zones/README.md)
- [Assets](../assets/README.md)

## Invariants and lifecycle

- Published map content is immutable; changes create a new version.
- Server validates movement against trusted geometry; clients cannot upload authoritative geometry.
- Static JSON is allowed; no general map editor/upload in MVP.
- Validate stable IDs and compatible map/protocol versions before admission.

## Interface outline

- Authorized map manifest bootstrap plus versioned static geometry assets.
- Pure collision/pathfinding contracts belong in packages/world.

## Planning question

Choose direct upstream JSON adaptation versus Tiled import; atlas packing remains optional.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
