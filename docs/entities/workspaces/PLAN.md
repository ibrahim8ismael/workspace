# Workspaces implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M1

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [ ] Resolve company-to-workspace cardinality (D12) and onboarding mode (D13) before freezing tenant schemas.
- [ ] Specify company suspension/offboarding and current-company navigation; keep platform privileges separate from customer roles.

- [x] Implement create/list/detail DTOs and slug validation/uniqueness.
- [x] Implement transactional creation with counters and scoped idempotent result lookup.
- [x] Implement owner-only invitations/removal and transactional ownership transfer.
- [ ] Implement only the settings/lifecycle controls agreed under D13 (CP09).
- [x] Commit safe security audit records with company mutations.
- [ ] Add owner/member onboarding/administration UI under CP04/CP09.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Concurrent creation cannot exceed owned-workspace quota.
- [ ] Cross-tenant resource substitution is rejected.
- [ ] Owner transfer never leaves two owners or no owner.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Define archive/deletion lifecycle and slug reuse policy before adding destructive controls.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
