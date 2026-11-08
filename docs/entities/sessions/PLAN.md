# Sessions implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M1

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Implement cookie, CSRF and safe anonymous bootstrap lifecycle.
- [x] Create digest/expiry indexes and authoritative validation service.
- [x] Implement session revocation/rotation/listing and explicit idle extension APIs.
- [ ] Implement browser session management and warning/extension UX under CP04.
- [ ] Connect session invalidation to office/media revocation and bounded leases under CP05/CP08.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Expired rows are unusable before TTL cleanup.
- [ ] Fixation, wrong CSRF, cross-origin mutation and revoked-session reuse fail.
- [ ] Meeting heartbeat cannot silently prolong idle access; logout-all affects open sockets.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Finalize session extension UX and measurable authorization read policy before M1 completes.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
