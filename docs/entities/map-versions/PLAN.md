# Map versions implementation plan

Status: planned; no implementation or verification evidence · Target: M0–M2

## Implementation tasks

- [ ] Inventory upstream geometry and coordinate conventions.
- [ ] Define runtime schema, version and content-hash rules.
- [ ] Import one fixed map and compare server/client movement rules.
- [ ] Specify incompatible-version and office-drain upgrade behavior.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Spawn/seat exits are walkable and IDs are unique.
- [ ] Client and server agree on walls, furniture and zone boundaries.
- [ ] Incompatible map versions force reload/resnapshot safely.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Choose direct upstream JSON adaptation versus Tiled import; atlas packing remains optional.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
