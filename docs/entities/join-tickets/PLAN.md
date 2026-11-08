# Office join tickets implementation plan

Status: HTTP issuance and atomic consume implemented. Socket admission remains CP05 · Updated: 2026-11-09 · Target: M2

## Implementation tasks

- [x] Define first public issue/response/handshake schemas, safe error/version rules and retry budgets under CP01.
- [x] Enforce approved map, current policy, expiry and consumption under CP03.
- [x] Create exact digest uniqueness and TTL cleanup indexes.
- [x] Implement conditional consumption and current-policy recheck.
- [ ] Handle capacity denial/restart through a new ticket; no reusable reservation.

## Acceptance criteria

Checked items refer to the local CP03 test boundary. Socket transport and runtime scenarios follow in CP05.

- [x] Replay, expired, foreign-office and stale-epoch tickets fail in the CP03 integration tests.
- [x] Two concurrent consume requests have one winner in the CP03 integration tests.
- [ ] CP05 maps the winning consume to one runtime participation.
- [ ] Direct socket connect without ticket or with wrong Origin fails.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: CP01 office v1 specifies consume → epoch recheck → reserve → snapshot/activate/ready; spent tickets stay spent after failure. Implement and test ordering in CP03/CP05.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
