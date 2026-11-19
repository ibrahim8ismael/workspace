# Map versions

Status: implemented for static maps and generated workspace offices · Updated: 2026-11-19

## Responsibility

Provide the same immutable geometry and identifiers to browser rendering and server simulation.

- Owning module: Maps / packages/world.
- State location: Immutable static manifests and deterministic workspace geometry; MongoDB stores the selected map version.
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

CP01 freezes the public manifest reference/hash/version/pixel conventions in [OFFICE_V1.md](../../contracts/OFFICE_V1.md). Static Commons and Vivo maps are validated against their packaged geometry and asset hashes. Workspace maps are generated from a bounded room count (1–100), validated by `packages/world`, and identified by a content hash over canonical geometry and the Commons art manifest. Their geometry is included in the authenticated office bootstrap. Existing workspaces retain their selected map until an owner changes the room count; changing it creates a new map version and stable index-based room IDs.

## Interface outline

- Authorized map manifest/bootstrap with versioned static geometry; generated workspace maps use the same shared `OfficeGeometry` validation and collision rules.
- Pure collision/pathfinding contracts belong in packages/world.

## Planning question

General map editing/import remains out of scope. Generated workspace room geometry currently uses the shared deterministic layout.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md). Browser rendering support is verified for the active Commons and Vivo renderers; Phaser is not the active office renderer.
