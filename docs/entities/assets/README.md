# Assets and provenance

Status: draft plan · Updated: 2026-11-05 · Target: M0–M2

## Responsibility

Track reusable artwork, derived textures and the rights/evidence needed for distribution.

- Owning module: Frontend / packages/assets.
- State location: Versioned static files and provenance manifest.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `assetId`
- `upstreamRepository`
- `upstreamCommit`
- `sourcePath`
- `license`
- `attribution`
- `modifications`
- `contentHash`
- `dimensions`
- `animationFrames`
- `anchors`
- `layer`
- `clearanceStatus`

## Relationships

- [Avatars](../avatars/README.md)
- [Map Versions](../map-versions/README.md)
- [Map Overrides](../map-overrides/README.md)

## Invariants and lifecycle

- Pin actual upstream commit; recorded tree SHA is not a commit pin.
- Root MIT does not independently clear every image or third-party reference pack.
- Preserve notices and record copied paths/modifications before distribution.
- Generated SVG/React art needs export or reimplementation; PNGs can load directly.
- No Gather trademarks/private reference packs; use assets with established provenance.

## Interface outline

- Static asset manifest consumed by Phaser and build pipeline.
- No general asset-upload endpoint in MVP.

## Planning question

Exact reuse set and export tooling remain open until inventory; no upstream files imported by this docs task.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
