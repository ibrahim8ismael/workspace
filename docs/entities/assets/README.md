# Assets and provenance

Status: pinned import inventory implemented; unified rendering catalog pending · Updated: 2026-11-08 · Target: M0–M2

## Responsibility

Track reusable artwork, derived textures and the rights/evidence needed for distribution.

- Owning module: Frontend / packages/assets.
- State location: Versioned static files and provenance manifest.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Current inventory and proposed catalog

Current [provenance](../../../packages/assets/manifests/provenance.json) records repository/commit, source manifest/location/review, and per-entry destination path/upstreamPath/upstreamBlobSha for 261 public files. It does not yet provide the unified runtime catalog below.

Proposed runtime metadata:

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

- Source/public imports are pinned to commit 23d6b8999396f9e9d51291bf85bd7b72161f833f; preserve the source manifest and notices.
- Root MIT does not independently clear every image or third-party reference pack.
- Preserve notices and record copied paths/modifications before distribution.
- Generated SVG/React art needs export or reimplementation; PNGs can load directly.
- No Gather trademarks/private reference packs; use assets with established provenance.

## Interface outline

- Static asset manifest consumed by Phaser and build pipeline.
- No general asset-upload endpoint in MVP.

## Planning question

Imported paths and hashes are inventoried. CP02 selects the approved MVP appearance/map subset and supplies missing dimensions, anchors, frame/layer metadata and any derived-art export pipeline.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
