# Users implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M1

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Implement pending/active/suspended eligibility and trim/lowercase email canonicalization.
- [x] Create unique email index and safe account/member projections.
- [x] Implement authoritative HTTP account eligibility checks.
- [ ] Extend current eligibility to realtime leases and media under CP05/CP08.
- [x] Implement transactional account versions and owned-workspace counters.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Duplicate normalized registrations cannot create two accounts.
- [ ] Pending or suspended users cannot enter a workspace office.
- [ ] Profile mass assignment cannot change status, verifiedAt or authVersion.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Display names are bounded to 2–80 characters. Profile editing and deletion/retention remain CP06/CP09 work.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
