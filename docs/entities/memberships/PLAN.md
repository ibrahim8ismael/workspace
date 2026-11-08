# Memberships implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M1

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Implement independent company owner/member policy.
- [x] Create unique workspace/user index and shared membership/owner policy checks.
- [x] Implement transactional removal/leave/transfer and exact counters.
- [ ] Add rotating activation-grant identity under CP03 and live revocation hints/bounded leases under CP05.

## Acceptance criteria

- [ ] A user belonging to two companies keeps independent roles; removal from one company does not grant or revoke unrelated company access.

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Revocation racing a protected write cannot leave a stale authorization decision usable.
- [ ] Duplicate removal does not decrement memberCount twice.
- [ ] A removed member loses ongoing access within the declared lease budgets.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Current reactivation and safe directory projection are implemented; a rotating activation grant and live removal remain pending.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
