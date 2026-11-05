# Workspaces implementation plan

Status: planned; no implementation or verification evidence · Target: M1

## Implementation tasks

- [ ] Resolve company-to-workspace cardinality (D12) and onboarding mode (D13) before freezing tenant schemas.
- [ ] Specify company suspension/offboarding and current-company navigation; keep platform privileges separate from customer roles.

- [ ] Define create/list/detail DTOs and slug policy.
- [ ] Implement transactional creation with counters and retry result lookup.
- [ ] Implement scoped administration and atomic owner transfer.
- [ ] Add owner/member UI and security audit records.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Concurrent creation cannot exceed owned-workspace quota.
- [ ] Cross-tenant resource substitution is rejected.
- [ ] Owner transfer never leaves two owners or no owner.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Define archive/deletion lifecycle and slug reuse policy before adding destructive controls.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
