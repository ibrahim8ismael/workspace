# Socket.IO contract outline

Status: proposed event families and envelope; not an implemented protocol · Updated: 2026-11-05

## Admission and envelopes

Use Socket.IO auth payload for the memory-only ticket and protocol version. Namespace middleware rejects invalid admission and wrong Origin before any world subscription. An `office:ready` result follows policy recheck, single-use consume and serialized runtime reservation. It includes participation ID, office epoch, map/protocol version and initial safe snapshot. An optional `office:join` request must never bypass that gate; settle whether it is needed before coding.

Proposed client command envelope: `{ eventId, officeEpoch, sequence?, expectedVersion?, payload }`.
Proposed authoritative world envelope: `{ officeEpoch, stateVersion, serverTime, payload }`.
Proposed acknowledgement: `{ eventId, ok, result? }` or `{ eventId, ok: false, error: { code, retryAfterMs? } }`.

Exact schemas, time encoding, ack timeouts and state-gap base version are M0 contract work. Keep server monotonic deadlines internal; browser timestamps are not authorization evidence. Runtime schemas are mandatory; shared types alone are insufficient.

## Event families

| Event | Direction | Proposed payload / behavior |
|---|---|---|
| `office:ready` | server → client | Fresh authorized identity, map/protocol version, epoch and snapshot; no credentials/email |
| `world:input` | client → server | Direction/intent and ordered input sequence; client coordinates never set authoritative position |
| `world:snapshot` | server → client | Full current safe state at declared version; replaces stale local state |
| `world:delta` | server → client | Ordered changes with explicit base/current versions; detect gaps |
| `world:resync` | client → server | Request current snapshot after version gap; does not reauthorize stale session |
| `presence:update` | client request / server authoritative update | Allowlisted availability request; server resolves actor and broadcasts safe state |
| `seat:sit`, `seat:stand` | client request | Seat ID within active map; serialized range/occupancy/exit checks |
| `conversation:update` | server → client | Authorized member set, kind, state, version/generation and safe connection status |
| `conversation:leave` | client request | Current conversation/version; reconcile participant and media generation |
| `meeting:join`, `meeting:leave` | client request | Fixed zone ID; current tenant/policy/capacity check |
| `reaction:send` | client request / safe server broadcast | Optional MVP polish; bounded allowlist/rate/TTL, never persistent chat |
| structured error/ack | both via defined protocol | Typed failures tied to event/request ID; no raw exceptions |

Under the recommended all-LiveKit topology there is no Socket.IO SDP/ICE relay event. Media control signals are application state; LiveKit client handles its own signaling.

## Company isolation

Every office subscription and safe snapshot belongs to the authorized customer tenant. A user in multiple companies cannot reuse a ticket, role, conversation or media grant across them. Include tenant scope in resource admission and service budgets; never join a Socket.IO room solely from a client-supplied company ID.

## Ordering, recovery and limits

- Movement coalesces obsolete input and uses per-participant sequences. Do not buffer offline movement for replay.
- Conflicting seats, capacity and conversation transitions serialize in one canonical office owner, including across asynchronous service work.
- New process means new epoch. Reconnect/takeover uses fresh HTTP ticket and a full snapshot; automatic Socket.IO recovery cannot restore old permissions.
- Periodic authorization is independent of traffic; delayed/out-of-order checks cannot renew expired leases.
- Provisional caps: 30 movement inputs/sec, bounded burst, 4 KiB maximum application-event payload and smaller per-event limits.
- Client optimistic actions reconcile from acknowledgement/current state. Critical durable writes require DB-confirmed results and idempotency; Socket.IO delivery alone does not provide exactly-once semantics.
- Proposed error codes: `unauthorized`, `membership_required`, `room_full`, `protocol_mismatch`, `stale_epoch`, `rate_limited`, `media_unavailable`; add explicit validation/version errors when freezing schemas.

Acceptance cases are in [A04–A05](../planning/ACCEPTANCE.md) and the [participant](../entities/participants/PLAN.md) / [ticket](../entities/join-tickets/PLAN.md) plans.
