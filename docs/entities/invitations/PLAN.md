# Invitations implementation plan

Status: API and account UI integrated; release checks remain open · Updated: 2026-11-10 · Target: M1

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Implement issue/supersession/revoke/accept and existing-member handling.
- [x] Create unique digest, workspace/email lookup and expiry TTL indexes.
- [x] Implement recipient-bound transactional capacity/policy writes.
- [x] Queue encrypted expiring invitation codes through the transactional outbox.
- [x] Integrate member code acceptance into the account UI. Owner invitation management is unmounted by owner request (2026-11-10); API and component are retained.
- [ ] Verify external-provider delivery and outage handling under CP04.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Wrong recipient, expired and revoked invitations fail.
- [ ] Concurrent accept cannot create duplicate membership or exceed capacity.
- [ ] Owner revocation racing invite creation/acceptance cannot authorize stale writes.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Implemented defaults: seven-day lifetime, fifty pending invites/workspace, no slot reservation. Member acceptance is integrated; owner invitation UI is unmounted by request; external-provider delivery remains pending.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
