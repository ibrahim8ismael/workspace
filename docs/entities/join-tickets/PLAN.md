# Office join tickets implementation plan

Status: planned; no implementation or verification evidence · Target: M2

## Implementation tasks

- [ ] Define issue/consume failure codes and map/protocol compatibility.
- [ ] Create digest uniqueness and TTL cleanup indexes.
- [ ] Implement conditional consumption and continuing-policy recheck.
- [ ] Handle capacity denial/restart through a new ticket; no reusable reservation.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Replay, expired, foreign-office and stale-epoch tickets fail.
- [ ] Two concurrent consumes cannot create two participations.
- [ ] Direct socket connect without ticket or with wrong Origin fails.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Freeze admission acknowledgement ordering and ticket-consumed-but-runtime-denied recovery behavior.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
