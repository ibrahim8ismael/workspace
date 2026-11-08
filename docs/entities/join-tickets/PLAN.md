# Office join tickets implementation plan

Status: planned; no implementation or verification evidence · Target: M2

## Implementation tasks

- [x] Define first public issue/response/handshake schemas, safe error/version rules and retry budgets under CP01.
- [ ] Enforce actual approved map/current policy/expiry and consume behavior under CP03.
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
- Resolve: CP01 office v1 specifies consume → epoch recheck → reserve → snapshot/activate/ready; spent tickets stay spent after failure. Implement and test ordering in CP03/CP05.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
