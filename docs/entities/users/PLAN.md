# Users implementation plan

Status: planned; no implementation or verification evidence · Target: M1

## Implementation tasks

- [ ] Define status transitions and email canonicalization.
- [ ] Create unique email index and safe/private DTO projections.
- [ ] Implement account eligibility checks shared by HTTP, realtime leases and media.
- [ ] Implement version and owned-workspace counter updates with transaction conflict rules.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Duplicate normalized registrations cannot create two accounts.
- [ ] Pending or suspended users cannot enter a workspace office.
- [ ] Profile mass assignment cannot change status, verifiedAt or authVersion.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Choose display-name limits and account deletion/retention behavior before exposing deletion.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
