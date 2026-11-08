# Conversations implementation plan

Status: planned; no implementation or verification evidence · Target: M3–M4

## Implementation tasks

- [ ] Specify deterministic pairing/tie-breaks and participant state transitions.
- [ ] Implement serialized membership and generation changes.
- [ ] Integrate media-ready/retry/retirement UX and lease removal.
- [ ] Add fixed-zone group behavior after two-user voice isolation.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Simultaneous proximity matches cannot place a user in two calls.
- [ ] Reordered events cannot restore a retired generation.
- [ ] Rapid boundary churn cannot exhaust other users’ grant recovery budget.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: All-LiveKit is accepted; CP01 private conversation/command shapes exist. Matching/runtime/generation proof and measured thresholds remain CP08/CP09 work.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
