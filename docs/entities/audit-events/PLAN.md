# Audit events implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M1–M5

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Record current identity/company action names in a safe audit schema.
- [ ] Extend taxonomy/metadata only as required by the approved recovery design.
- [x] Commit implemented security mutations and their audit rows in one Mongo transaction.
- [ ] Design independent mirror and acknowledgement monitoring.
- [ ] Write restore reconciliation procedure and restricted audit access rules.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Secret scanner/projection review finds no token or password content.
- [ ] Restore predating reset/removal cannot reopen access with old credentials.
- [ ] Missing mirror intervals are visible and prevent unsafe automatic reopening.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- The target-independent [CP04.5b audit mirror design](../../planning/CP04_AUDIT_MIRROR_DESIGN.md) proposes an outbox and records the storage, retention, and outage decisions still required. It does not select a provider or mark implementation complete.
- Resolve: Choose independent audit storage, retention and mutation failure policy during M0/M1.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
