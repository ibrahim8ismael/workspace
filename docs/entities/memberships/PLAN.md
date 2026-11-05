# Memberships implementation plan

Status: planned; no implementation or verification evidence · Target: M1

## Implementation tasks

- [ ] Define permission matrix for owner and member.
- [ ] Create unique index and shared membership policy service.
- [ ] Implement transactional removal/leave/transfer and exact counters.
- [ ] Connect policy versions and immediate revocation hints to bounded lease checks.

## Acceptance criteria

- [ ] A user belonging to two companies keeps independent roles; removal from one company does not grant or revoke unrelated company access.

The following are future checks, not passing results.

- [ ] Revocation racing a protected write cannot leave a stale authorization decision usable.
- [ ] Duplicate removal does not decrement memberCount twice.
- [ ] A removed member loses ongoing access within the declared lease budgets.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Specify reinvitation/reactivation semantics and restricted member-directory fields.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
