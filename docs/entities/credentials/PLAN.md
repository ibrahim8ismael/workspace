# Credentials implementation plan

Status: planned; no implementation or verification evidence · Target: M1

## Implementation tasks

- [ ] Specify password length, breached-password policy and bounded hashing concurrency.
- [ ] Implement hashing adapter with backend-only projections.
- [ ] Implement credential version checks during login and credential replacement.
- [ ] Require recent reauthentication for sensitive account and owner operations.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] A concurrent reset prevents a login checked against an older credential from issuing valid access.
- [ ] Oversized inputs and hash floods are bounded.
- [ ] Password changes invalidate old sessions without lifting account suspension.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Select library, exact hashing parameters and breached-password source during M0/M1.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
