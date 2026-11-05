# Offices implementation plan

Status: planned; no implementation or verification evidence · Target: M1–M2

## Implementation tasks

- [ ] Create office model and validate map/spawn references.
- [ ] Implement office lifecycle, epoch creation and serialized command dispatch.
- [ ] Implement capacity, draining and fresh-restart behavior.
- [ ] Expose authorized bootstrap and safe runtime metrics.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Two joins competing for the last slot admit only one.
- [ ] Foreign workspace/office combinations fail.
- [ ] Restart invalidates tickets and deltas from the previous epoch.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Freeze office runtime ownership API and explicit takeover reservation behavior at M0/M2.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
