# Conversations implementation plan

Status: CP08.1 state implementation verified; guarded media not integrated · Updated: 2026-11-10 · Target: M3–M4

## Implementation tasks

- [x] Specify and implement deterministic pairing/tie-breaks, opt-in/availability rules, one pair per participant, distance hysteresis and exit debounce.
- [x] Implement in-memory `joining`/`ended` state with version/generation and private delivery to the two admitted sockets.
- [ ] Integrate media-permit acknowledgement and irreversible LiveKit generation retirement. The current updates always have `mediaReady: false`.
- [ ] Integrate media-ready/retry/retirement UX and lease removal.
- [ ] Add fixed-zone group behavior after two-user voice isolation.

## Acceptance criteria

The following are future checks, not passing results.

- [x] Nearest-first pairing keeps each participation in at most one active proximity pair.
- [x] A non-opted-in admitted office member does not receive another pair's private update.
- [ ] Reordered events cannot restore a retired generation.
- [ ] Rapid boundary churn cannot exhaust other users’ grant recovery budget.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: All-LiveKit is accepted; CP08.1 implements state and focused API/Socket.IO coverage. Real audio, current-generation grants, generation retirement, and measured thresholds remain gated on application integration of CP07.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
