# Outbox events implementation plan

Status: planned; no implementation or verification evidence · Target: M1

## Implementation tasks

- [ ] Define event types, expiry and delivery state transitions.
- [ ] Implement transaction helper and unique event/operation indexes.
- [ ] Build retryable dispatcher with enqueue/ack recovery.
- [ ] Implement encryption key access, secret purge and failed-delivery visibility.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Crash between commit and enqueue leaves recoverable pending event.
- [ ] Repeated dispatch cannot duplicate membership/token effects.
- [ ] Expired mail is discarded and payload secrets are never logged.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Choose encryption-key storage and email provider; define retention for delivery metadata.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
