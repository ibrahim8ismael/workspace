# Invitations implementation plan

Status: planned; no implementation or verification evidence · Target: M1

## Implementation tasks

- [ ] Specify issue/resend/revoke/accept and existing-member behavior.
- [ ] Create digest and scoped lookup indexes.
- [ ] Implement transactional capacity and conditional policy writes.
- [ ] Deliver expiring links through outbox and build recipient acceptance UI.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Wrong recipient, expired and revoked invitations fail.
- [ ] Concurrent accept cannot create duplicate membership or exceed capacity.
- [ ] Owner revocation racing invite creation/acceptance cannot authorize stale writes.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Finalize invite lifetime and pending-invite quotas; define whether capacity is reserved before acceptance.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
