# Offices implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-09 · Target: M1–M2

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Persist one office reference per workspace with a unique workspaceId index.
- [x] Validate the immutable Commons map and spawn and backfill pending offices under CP02/CP03.
- [ ] Implement office lifecycle, epoch creation and serialized command dispatch.
- [ ] Implement capacity, draining and fresh-restart behavior.
- [x] Expose authorized office discovery and bootstrap.
- [ ] Expose safe runtime metrics in CP05.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Two joins competing for the last slot admit only one.
- [x] Foreign workspace/office combinations fail in local CP03 HTTP tests.
- [ ] Restart invalidates tickets and deltas from the previous epoch.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Freeze office runtime ownership API and explicit takeover reservation behavior at M0/M2.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
