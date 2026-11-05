# Seats implementation plan

Status: planned; no implementation or verification evidence · Target: M2

## Implementation tasks

- [ ] Import and validate seat anchors/exits.
- [ ] Implement serialized sit/stand and movement transitions.
- [ ] Release occupancy on disconnect, takeover and lease expiry.
- [ ] Provide canvas interaction and accessible sit/stand control.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Two users targeting the same seat produce one occupant.
- [ ] Foreign/out-of-range seats fail.
- [ ] Standing never places an avatar inside collision geometry.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Define blocked-exit behavior and whether a seat affects proximity eligibility.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
