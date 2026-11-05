# Map overrides

Status: draft plan · Updated: 2026-11-05 · Target: M0 design; implementation conditional after M2

## Responsibility

Reserve a scoped model for durable office decoration/configuration changes if enabled.

- Owning module: Maps.
- State location: MongoDB: map_overrides.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `workspaceId`
- `officeId`
- `baseMapVersionId`
- `revision`
- `objectId`
- `allowedTransformOrDecoration`
- `updatedBy`
- `updatedAt`

## Relationships

- [Offices](../offices/README.md)
- [Map Versions](../map-versions/README.md)
- [Assets](../assets/README.md)
- [Audit Events](../audit-events/README.md)

## Invariants and lifecycle

- Custom maps/editor are deferred; overrides do not introduce that feature implicitly.
- Only allowlisted object properties and cleared asset IDs are writable.
- Validate bounds, seat exits and collisions; reject incompatible base map revisions.
- Apply revision conflicts and workspace policy checks atomically; no mutable base manifests.

## Interface outline

- No public mutation endpoint in the initial fixed-map slice.
- If enabled later, propose versioned owner-only override commands with idempotency.

## Planning question

MVP necessity is open; keep fixed geometry as the starting implementation.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
