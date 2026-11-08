# Authentication tokens implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M1

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Implement token issuance, supersession and conditional one-time redemption.
- [x] Write token and encrypted email outbox entry in one transaction.
- [x] Implement pending-password verification proof and mailbox recovery with credential replacement.
- [x] Implement concurrent reset/credential conflict handling.
- [ ] Build browser token forms and safe recovery routing under CP04; current mail uses codes/API instructions.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Two concurrent redemptions commit at most once.
- [ ] Wrong-purpose, superseded and expired tokens fail.
- [ ] Preregistering another mailbox cannot activate an attacker-known password.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Finalize recovery link routing and delivery provider while preserving no-store/no-referrer behavior.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
