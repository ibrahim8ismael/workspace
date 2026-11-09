# CP05 — Authoritative Socket.IO office implementation plan

Status: implementation slices defined; first code batch not started · Updated: 2026-11-09

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

Implement the Nest Socket.IO adapter and `/office` gateway. Enforce exact origin, WebSocket-only transport and inbound size limits. Validate `officeSocketAuthSchema`, consume the one-use CP03 ticket, reserve a bounded office participation, construct the initial safe world snapshot, subscribe the admitted socket and emit `office:ready`. Roll provisional reservations back on failed activation and release them on disconnect. Keep connection-state recovery disabled.

Tests use actual Socket.IO clients and the transaction-capable Mongo test fixture: valid admission, foreign/missing Origin, malformed auth, ticket replay, capacity/duplicate participation, snapshot contract and disconnect cleanup. A completed CP05.1 alone is development evidence; continuing authorization and movement are still absent.

### CP05.2 — Continuing authorization and revocation

Add per-participation bounded policy leases with request-start monotonic deadlines and ordered replies. Recheck session, account, workspace and membership using the current primary policy. Connect committed logout/session rotation, password reset, suspension and membership removal to runtime revocation. Verify delayed replies, Mongo loss, idle unauthorized sockets, reconnect and restart epoch rotation. Expired or uncertain authority releases capacity and removes the participant from later broadcasts.

### CP05.3 — Serialized world commands and seats

Implement input validation, sequence/replay rules, server-time movement, shared CP02 collision and world bounds. Add availability updates and serialized sit/stand, seat exits and occupancy. Enforce separate per-event, per-participation and per-workspace budgets. Test last-seat/capacity races, spoofing, floods, stale epochs/sequences and two-client visibility.

### CP05.4 — Snapshot/delta recovery and explicit takeover

Publish size-bounded versioned deltas, validate base versions and repair gaps only from a current snapshot. Implement explicit same-actor takeover with a short-lived one-use server reference; retire the old participation before activating the replacement and release its seat. Exercise disconnects, concurrent takeover, lost acknowledgements, resync limits, company switches and graceful shutdown.

## Completion gate

Two real clients enter the same office, see server-owned state, move and collide under the trusted map rules, and compete safely for seats. Tests prove exact Origin, one-use admission, current authorization, removal while idle, capacity/seat serialization, reconnect/resync, takeover, bounded input/output and two-company isolation. Run focused API integration tests after each batch, then the repository verification gate before a completed CP05 handoff. Record A04/A05/A11 evidence in [ACCEPTANCE](ACCEPTANCE.md).

CP04 SMTP setup and CP04 independent audit delivery remain separate release gates. CP07 media-enforcement proof should begin early and must pass before CP08 proximity audio is enabled.

## Current execution status

The plans/contracts are ready for CP05.1. No runtime code has been added for CP05 yet. After the owner explicitly approved sending the relevant CP05.1 files to OpenCode DeepSeek, the model reported that its free usage limit was exhausted before reading or changing project files. The batch is waiting for an author/model decision.
