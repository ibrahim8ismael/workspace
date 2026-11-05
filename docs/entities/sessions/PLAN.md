# Sessions implementation plan

Status: planned; no implementation or verification evidence · Target: M1

## Implementation tasks

- [ ] Define cookie, CSRF and anonymous bootstrap lifecycle.
- [ ] Create digest/expiry indexes and authoritative validation service.
- [ ] Implement revocation, rotation and active-session UI.
- [ ] Connect session invalidation to office and media lease expiry.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Expired rows are unusable before TTL cleanup.
- [ ] Fixation, wrong CSRF, cross-origin mutation and revoked-session reuse fail.
- [ ] Meeting heartbeat cannot silently prolong idle access; logout-all affects open sockets.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Finalize session extension UX and measurable authorization read policy before M1 completes.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
