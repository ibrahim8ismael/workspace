# Credentials implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M1

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Implement 15–128 character/byte bounds, initial common/repeated-value checks and bounded hashing concurrency.
- [ ] Select broader compromised-password screening and benchmark target-host hashing under CP04.
- [x] Implement Argon2id adapter with backend-only projections.
- [x] Fence login/reauthentication against credential replacement using version/accessFence.
- [x] Require recent password proof for password change and owner transfer.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] A concurrent reset prevents a login checked against an older credential from issuing valid access.
- [ ] Oversized inputs and hash floods are bounded.
- [ ] Password changes invalidate old sessions without lifting account suspension.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Argon2id/parameters are implemented; broader screening and measured deployment budgets remain CP04 work.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
