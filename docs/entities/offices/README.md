# Offices

Status: initial persistence implemented; remaining integration/lifecycle work planned · Updated: 2026-11-09 · Target: M1–M2

## Responsibility

Bind a workspace to one canonical map and an authoritative runtime.

- Owning module: Maps / OfficeRuntime.
- State location: MongoDB: offices; active world in process memory.
- Fields below describe the current stored model; interface additions and remaining work retain their stated planned status. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

Source: [owning model](../../../apps/api/src/modules/tenancy/tenancy.models.ts).

- `_id`
- `workspaceId`
- `mapVersion`
- `createdAt`

Creation writes a deterministic generated workspace map version using the requested room count. Workspace detail exposes officeId and the current generated room count to active members. The bootstrap route resolves both office and workspace IDs after access checks; it accepts the trusted static Vivo/Commons manifests and generated workspace manifests whose canonical geometry hash matches the shared generator. Existing workspaces keep their current map until the owner changes the room count. Room-count changes create a new map version and are rejected while office participants are connected. The pending-version backfill assigns Vivo, and `db:migrate-legacy-office-maps-to-vivo` migrates only the exact trusted Commons version while preserving office/workspace IDs. CP03 implements ticket issuance and atomic consumption. Runtime epochs/capacity/draining are CP05; overrideRevision remains conditional, not a required schema addition.

## Relationships

- [Workspaces](../workspaces/README.md)
- [Map Versions](../map-versions/README.md)
- [Map Overrides](../map-overrides/README.md)
- [Participants](../participants/README.md)
- [Seats](../seats/README.md)
- [Meeting Zones](../meeting-zones/README.md)

## Invariants and lifecycle

- MVP has one office per workspace; unique workspaceId index.
- One in-process authoritative owner serializes conflicting commands.
- Restart creates fresh epoch and requires new admission/snapshot; positions are not restored from stale sockets.
- Provisional capacity is 20 active participants; capacity reservation and join completion are serialized.

## Interface outline

- GET office manifest/bootstrap under /api/workspaces/:workspaceId/offices/:officeId.
- POST .../join-ticket; Socket.IO office:ready and world snapshot/delta contracts.

## Planning question

Freeze office runtime ownership API and explicit takeover reservation behavior at M0/M2.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
