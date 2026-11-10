# Conversations implementation plan

Status: CP08.1–CP08.3c application and guard path verified with a mock signaling upstream; real SFU/media acceptance pending · Updated: 2026-11-10 · Target: M3–M4

## Implementation tasks

- [x] Specify and implement deterministic pairing/tie-breaks, opt-in/availability rules, one pair per participant, distance hysteresis and exit debounce.
- [x] Implement in-memory `joining`/`active`/`ended` state with version/generation and private delivery to the two admitted sockets. `active` requires a current policy installation ACK.
- [x] Issue a session/company/current-pair-bound microphone token after permit installation; reject stale and foreign participation grants.
- [x] Run a separate application-policy guard process against the live Nest test server, verify an app-issued token reaches a mock signaling upstream, then verify denial after pair end and a fresh-epoch guard restart.
- [ ] Add application-owned irreversible generation-retirement signals/tombstones and signed raw-body webhook reconciliation; specify ordering and deduplication before implementing either path.
- [ ] Run two real browser clients through the SFU, then verify device denial, opt-out/away/leave, reconnect, token refresh, forwarding cutoff and tenant isolation with recorded evidence.
- [ ] Add fixed-zone group behavior after two-user voice isolation.

## Acceptance criteria

The following are future checks, not passing results.

- [x] Nearest-first pairing keeps each participation in at most one active proximity pair.
- [x] A non-opted-in admitted office member does not receive another pair's private update.
- [x] A replayed install ACK cannot reactivate the ended pair; a guard with a fresh epoch installs the empty application snapshot and denies the old application token.
- [ ] Reordered/replayed webhook or retirement events cannot restore a retired generation.
- [ ] Rapid boundary churn cannot exhaust other users’ grant recovery budget.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: All-LiveKit is accepted. Current application/guard process proof is in `apps/api/test/auth.integration.test.ts`; it uses a mock signaling upstream. It does not prove a live SFU or independent supervisor path.
- Before the real-media fixture, freeze the exact local SFU ports, guard origin, browser fake-device settings, required decoded-audio evidence, cutoff clock and cleanup contract in [MEDIA.md](../../contracts/MEDIA.md) and the [media evidence plan](../../planning/MEDIA_ENFORCEMENT_EVIDENCE.md).
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
