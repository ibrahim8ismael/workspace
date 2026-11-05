# Offices

Status: draft plan · Updated: 2026-11-05 · Target: M1–M2

## Responsibility

Bind a workspace to one canonical map and an authoritative runtime.

- Owning module: Maps / OfficeRuntime.
- State location: MongoDB: offices; active world in process memory.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `workspaceId`
- `mapVersionId`
- `overrideRevision`
- `spawn`
- `configurationVersion`
- `runtime epoch and stateVersion (transient)`

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
