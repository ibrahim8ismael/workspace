# CP05 — Authoritative Socket.IO office implementation plan

Status: CP05.1 complete locally; CP05.2 authorization-lease foundation implemented locally; CP05.2 revocation integrations and CP05.3–CP05.4 remain · Updated: 2026-11-09

CP05 builds the server-owned realtime office on top of completed CP02 map rules and CP03 bootstrap/tickets. The wire contract is in [OFFICE_V1](../contracts/OFFICE_V1.md) and [REALTIME](../contracts/REALTIME.md). The implementation plan in [PROJECT_COMPLETION_PLAN](PROJECT_COMPLETION_PLAN.md#cp05--build-the-authoritative-socketio-office) remains the acceptance baseline. This file orders the work into reviewable, locally testable batches.

## Invariants for all batches

- The server derives user, session, workspace, office, epoch, map and protocol from the one-use ticket and current policy. The socket never supplies its own identity or role.
- Exact `APP_ORIGIN` is checked at the Engine.IO boundary. The initial transport is WebSocket-only, inbound application messages are bounded before parsing, and Socket.IO connection-state recovery stays disabled.
- One serialized in-memory authority owns each office runtime, its participants, seats, capacity, versions and event order. No HTTP transaction stays open while awaiting runtime work.
- Public snapshots and deltas use the strict shared contracts and exclude email, credentials, session IDs, policy records and private conversation membership.
- Security uncertainty denies admission or expires the current authorization lease. A delayed policy result cannot revive a participation after its monotonic deadline or epoch has ended.
- Process restart invalidates the old in-memory epoch. Reconnect obtains a fresh HTTP ticket and a new snapshot; offline commands are discarded.
- No browser route or production readiness claim is included until CP06 and the relevant security/operations acceptance gates pass.

## Batches

### CP05.1 — Socket transport, ticket admission and ready snapshot

**Complete locally.** The Nest Socket.IO adapter and `/office` gateway enforce exact `APP_ORIGIN`, WebSocket-only transport, a 4 KiB Engine.IO message limit and disabled connection-state recovery. The gateway validates `officeSocketAuthSchema`, consumes the one-use CP03 ticket, reserves a maximum of 20 participants with one active participation per user/workspace, creates unique reachable spawn positions and emits a contract-validated safe `office:ready` snapshot. It publishes join/removal deltas, releases provisional reservations on disconnect/failure and disconnects old-epoch sockets before admitting into a new runtime epoch.

Actual Socket.IO clients and the transaction-capable Mongo fixture cover valid admission, foreign/missing Origin, oversized raw packets, malformed auth, ticket replay, duplicate participation, capacity, epoch replacement, safe two-user snapshots and disconnect cleanup. The API suite passed 57 tests at this batch. CP05.1 is development evidence only; continuing authorization, movement and seat commands were not included in that batch.

### CP05.2 — Continuing authorization and revocation

**Implemented locally (lease foundation, revocation coverage and expiry):** WebSocket handshakes have a 5-second timeout and a fixed-window limit of 60 attempts per minute per direct TCP peer address; the limiter never reads client-supplied forwarded-IP headers and caps tracked addresses at 10,000. Each participation performs a strict primary-policy check immediately before ready, then checks every second. Each successful authorization lease is bounded to five seconds from request start, with an independent expiry timer so a delayed policy response cannot extend an expired lease. Logout, session rotation, password change/reset, account suspension, workspace suspension and membership revocation are detected for idle sockets and remove them from the runtime. When primary policy cannot be confirmed, access ends when the current lease expires. The API suite passes 65 tests, including delayed-policy-response expiry.

**Still required in CP05.2:** Add deterministic Mongo-loss, reconnect and process-restart/epoch-rotation tests. The current poller observes committed policy changes within a bounded interval; it is process-local and does not provide cross-instance immediate notifications. Revisit shared rate limiting and policy notification before multi-instance deployment. Do not claim production authorization readiness yet.

### CP05.3 — Serialized world commands and seats

Implement input validation, sequence/replay rules, server-time movement, shared CP02 collision and world bounds. Add availability updates and serialized sit/stand, seat exits and occupancy. Enforce separate per-event, per-participation and per-workspace budgets. Test last-seat/capacity races, spoofing, floods, stale epochs/sequences and two-client visibility.

### CP05.4 — Snapshot/delta recovery and explicit takeover

Publish size-bounded versioned deltas, validate base versions and repair gaps only from a current snapshot. Implement explicit same-actor takeover with a short-lived one-use server reference; retire the old participation before activating the replacement and release its seat. Exercise disconnects, concurrent takeover, lost acknowledgements, resync limits, company switches and graceful shutdown.

## Completion gate

Two real clients enter the same office, see server-owned state, move and collide under the trusted map rules, and compete safely for seats. Tests prove exact Origin, one-use admission, current authorization, removal while idle, capacity/seat serialization, reconnect/resync, takeover, bounded input/output and two-company isolation. Run focused API integration tests after each batch, then the repository verification gate before a completed CP05 handoff. Record A04/A05/A11 evidence in [ACCEPTANCE](ACCEPTANCE.md).

CP04 SMTP setup and CP04 independent audit delivery remain separate release gates. CP07 media-enforcement proof should begin early and must pass before CP08 proximity audio is enabled.

## Current execution status

CP05.1 and the CP05.2 lease foundation were implemented locally by Codex after the owner selected Codex when OpenCode DeepSeek reported its free quota exhausted. See the code in `apps/api/src/modules/office/{realtime,runtime}/`, the API integration suite and the implementation-progress record. The API is not ready for a production office: CP05.2 still needs further revocation/failure evidence before CP05.3 begins.
