# Authentication tokens implementation plan

Status: planned; no implementation or verification evidence · Target: M1

## Implementation tasks

- [ ] Define token issuance, supersession and redemption state transitions.
- [ ] Write token and encrypted email outbox entry in one transaction.
- [ ] Implement verification password proof and pending-account recovery.
- [ ] Implement concurrent reset conflict handling and secret-redacted recovery pages.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Two concurrent redemptions commit at most once.
- [ ] Wrong-purpose, superseded and expired tokens fail.
- [ ] Preregistering another mailbox cannot activate an attacker-known password.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Finalize recovery link routing and delivery provider while preserving no-store/no-referrer behavior.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
