# CP05 — Authoritative Socket.IO office implementation plan

Status: CP05.1–CP05.3b implemented and locally verified for one API process; CP05.4 and browser integration remain · Updated: 2026-11-09

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

**Implemented locally (lease foundation, revocation coverage and expiry):** WebSocket handshakes have a 5-second timeout and a fixed-window limit of 60 attempts per minute per direct TCP peer address; the limiter never reads client-supplied forwarded-IP headers and caps tracked addresses at 10,000. Each participation performs a strict primary-policy check immediately before ready, then checks every second. Each successful authorization lease is bounded to five seconds from request start, with an independent expiry timer so a delayed policy response cannot extend an expired lease. Logout, session rotation, password change/reset, account suspension, workspace suspension and membership revocation are detected for idle sockets and remove them from the runtime. When primary policy cannot be confirmed, access ends when the current lease expires. Reconnect uses a fresh ticket/snapshot, and epoch replacement retires old sockets. The API suite passes 67 tests.

**Single-process local exit is complete.** Tests also cover repeated primary-policy read failures, fresh-ticket reconnect and epoch replacement. The current poller observes committed policy changes within a bounded interval; it is process-local and does not provide cross-instance immediate notifications. Revisit shared rate limiting and policy notification before multi-instance deployment or any production topology that runs multiple API processes. These results are not deployment or production authorization acceptance.

### CP05.3a — Authoritative movement intent

**Implemented locally.** The gateway accepts only strict `{ eventId, officeEpoch, payload: { sequence, dx, dy } }` input and resolves actor/participation from the admitted socket. Stale epoch/sequence, malformed input and per-participation floods receive bounded acknowledgements. A 30-per-second per-socket attempt budget applies before payload parsing; the runtime independently limits accepted movement intents to 30 per participation per second. A 20 Hz process-local simulation normalizes diagonal input, uses monotonic elapsed time at the current UI pace of 192 px/sec, expires held intent after 250 ms without a refresh, and applies shared Commons tile/edge collision. Versioned world deltas are batched at no more than 10 Hz. Tests cover two-client visibility, sequence/epoch rejection, input floods, cardinal/diagonal speed parity and map bounds.

### CP05.3b — Availability and seats

**Implemented locally for one API process.** `presence:update`, `seat:sit` and `seat:stand` are strict, ticket-scoped commands with a shared 30-command-per-second per-socket budget. The runtime serializes availability changes, seat claims and releases, publishes occupancy in the same versioned delta as the participant projection, rejects competing claims and a claim while another avatar occupies the chair tile, excludes chair tiles from spawn selection, blocks walking onto an occupied chair, and clears occupancy on disconnect/revocation. Sitting requires a stopped avatar on the chair tile or a reachable adjacent tile and snaps to its center. Standing picks the first unoccupied valid exit in the map manifest order.

The API suite now exercises the three Socket.IO command paths and availability delta; runtime coverage moves two avatars, confirms a seat-tile conflict, grants one seat claim, rejects the competing claim, checks the ordered exit and verifies release on stand/disconnect. This remains process-local. Per-workspace command budgets, event replay/deduplication, client UI, multi-process seat authority and measured load are open. The broader A05 gate still needs real two-client seat competition through the Socket.IO surface and recovery integration.

### CP05.4 — Snapshot/delta recovery and explicit takeover

Publish size-bounded versioned deltas, validate base versions and repair gaps only from a current snapshot. Implement explicit same-actor takeover with a short-lived one-use server reference; retire the old participation before activating the replacement and release its seat. Exercise disconnects, concurrent takeover, lost acknowledgements, resync limits, company switches and graceful shutdown.

## Completion gate

Two real clients enter the same office, see server-owned state, move and collide under the trusted map rules, and compete safely for seats. Tests prove exact Origin, one-use admission, current authorization, removal while idle, capacity/seat serialization, reconnect/resync, takeover, bounded input/output and two-company isolation. Run focused API integration tests after each batch, then the repository verification gate before a completed CP05 handoff. Record A04/A05/A11 evidence in [ACCEPTANCE](ACCEPTANCE.md).

CP04 SMTP setup and CP04 independent audit delivery remain separate release gates. CP07 media-enforcement proof should begin early and must pass before CP08 proximity audio is enabled.

## Current execution status

CP05.1–CP05.3b were implemented locally by Codex after OpenCode DeepSeek reported its free quota exhausted. See the code in `apps/api/src/modules/office/{realtime,runtime}/`, the API integration suite and the implementation-progress record. The API is not ready for a production office: real Mongo outage drills, multi-instance coordination, per-workspace budgets, gap recovery/takeover, browser integration and load evidence remain open.
