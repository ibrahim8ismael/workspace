# Outbox events implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M1

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Implement three mail kinds and expiring pending/queued/delivered/expired/failed state.
- [x] Insert outbox records in domain transactions; use unique Mongo _id and scoped operations for command idempotency.
- [ ] Define any additional tenant projection/operation retention requirements before exposing new status interfaces.
- [x] Implement stable-ID polling dispatcher and bounded BullMQ retries.
- [ ] Verify actual enqueue/ack crash and outage recovery under CP04/CP10.
- [x] Validate injected key, authenticate encryption, purge payloads and persist final failure state.
- [ ] Establish production key storage/rotation and operational delivery alerts under CP04/CP10.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Crash between commit and enqueue leaves recoverable pending event.
- [ ] Repeated dispatch cannot duplicate membership/token effects.
- [ ] Expired mail is discarded and payload secrets are never logged.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Choose encryption-key storage and email provider; define retention for delivery metadata.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
