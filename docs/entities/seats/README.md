# Seats

Status: draft plan · Updated: 2026-11-05 · Target: M2

## Responsibility

Define sit/stand anchors and mutually exclusive live occupancy.

- Owning module: Maps / OfficeRuntime.
- State location: Static map seat definitions; transient occupancy in memory.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `seatId`
- `mapVersionId`
- `position`
- `direction`
- `entryAnchor`
- `exitAnchors`
- `occupantParticipationId (transient)`
- `stateVersion`

## Relationships

- [Map Versions](../map-versions/README.md)
- [Offices](../offices/README.md)
- [Participants](../participants/README.md)

## Invariants and lifecycle

- Seat IDs belong to the active office map.
- Sit/stand and disconnect release serialize in the office owner.
- Validate distance, reachable exit and current occupancy; never trust client target coordinates.
- Persistent desk assignment is deferred and distinct from live seat occupancy.

## Interface outline

- seat:sit and seat:stand with server acknowledgement.
- Snapshots/deltas expose safe occupancy references.

## Planning question

CP01 office v1 selects the first valid exit in manifest order; blocked exits keep the participant seated with seat_exit_blocked. Availability/opt-in still govern proximity. CP02 validates geometry; CP05 implements behavior.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
