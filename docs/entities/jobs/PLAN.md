# Background jobs implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M1

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Define gather-mail queue and separate worker ownership.
- [x] Implement outbox-ID processor, five-attempt exponential backoff and bounded job retention.
- [x] Validate noeviction at worker startup.
- [ ] Configure persistent Redis, readiness and resource alerts under CP04/CP10.
- [ ] Implement safe replay/reconciliation procedure after worker/Redis failure.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Worker crash after external acknowledgement produces safe retry semantics.
- [ ] Cache pressure does not evict queue state.
- [ ] Expired/superseded delivery cannot send a still-actionable stale link.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Retry/retention are implemented; provider duplicate semantics and persistent queue recovery still need real-service evidence.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
