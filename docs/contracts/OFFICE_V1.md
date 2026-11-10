# Office protocol v1 — current shared contract

Date: 2026-11-08; CP05.1–CP05.4b implementation status added 2026-11-09. CP01 implementer: Codex. CP02 map-identity implementation: OpenCode / DeepSeek V4.1 Flash Free (`max`), reviewed by Codex. Scope: exported schemas and technical interface decisions for CP02/CP03/CP05/CP06. CP03 provides office bootstrap and one-use HTTP tickets. CP05.1 provides Socket.IO admission and safe ready snapshots; CP05.2 adds bounded authorization leases and idle policy revocation; CP05.3a/b implements local movement, presence and seat transitions; CP05.4a adds server-side full-snapshot recovery; CP05.4b adds same-session explicit takeover. Real Mongo outage/multi-process evidence, browser adapter and media guard remain unimplemented. The reviewed Commons map artifact lives in the assets package.

Owner choices: [D12/D13/D02/D04 and pilot scope](../decisions/2026-11-08_CP01.md). MVP is one company/workspace/office, verified-user self-service, an original multi-room `commons` office, all-LiveKit, English-first desktop Chrome/Edge. [CP02 D04](../decisions/2026-11-08_CP02.md) supersedes the original Vivo candidate. No additional owner decision is inferred for full lifecycle, hosting/providers or the supervision mechanism.

## Versions, map identity and static references

Exports: `packages/contracts/src/versions.ts` and `http/office.ts`.

- `OFFICE_PROTOCOL_VERSION = 1`, `MAP_FORMAT_VERSION = 1`, `MVP_MAP_ID = commons`, tile size 32. These are the first new protocol's identifiers; they do not describe the legacy `/ws` protocol.
- Coordinates are pixels with the origin at the top-left, positive x right and y down, matching the imported map convention. Positions may be fractional; dimensions/tile size are positive integers. Bounds exclude x = width and y = height.
- Immutable version format is `commons-v1-<64 lowercase SHA-256 hex characters>`. `pending-m0`, client labels and unversioned map IDs cannot satisfy the admission schema.
- This pre-admission CP02 identity change rejects the former `vivo` ID and `vivo-v1-*` versions, including self-consistent old manifests. No deployed new-protocol office runtime exists to migrate; persisted `pending-m0` offices remain unready. This does not rename the legacy migration UI or approve replacement geometry.
- A manifest contains formatVersion, mapId, mapVersion, contentHash, coordinateUnits, tileSize, bounds, spawn, geometryPath and assetManifestVersion. Its version must embed contentHash and geometryPath must be exactly `/maps/<mapVersion>.json`. External URLs, traversal/query/token paths and unknown fields are rejected.
- CP02 produces and verifies Commons geometry bytes, content hash, spawn and catalog. The full catalog digest is encoded as `commons-art-v1-<sha256>`. See the [trusted Commons manifest](../../packages/assets/manifests/commons-map.json). Hash the exact immutable UTF-8 geometry JSON without a BOM; use sorted object keys and preserve meaningful array order (for example exit priority). Include the selected asset-manifest version in the hashed geometry payload. A content/asset-reference change requires a new hash/version. Tests must prove deterministic export. The CP01 test hash/body IDs are fixtures, not approved versions/catalog entries.
- The server must resolve the manifest/version from its approved registry. A syntactically valid version or self-consistent client manifest never proves approval, collision validity or tenant access. The trusted CP02 data registry must also validate the referenced asset-manifest version and any collision/seat/zone definitions.

## HTTP and socket admission

| Surface | Contract export | Runtime owner / status |
| --- | --- | --- |
| Workspace detail extension | `officeWorkspaceDetailResponseSchema`: `{ workspace: <existing DTO plus officeId> }` | CP03 tenancy detail only; create/list retain their existing shapes |
| Office bootstrap | `officeBootstrapResponseSchema`: `{ officeId, workspaceId, mapVersion, protocolVersion, manifest }` | CP03 scoped office service; top-level and manifest versions must agree |
| POST join-ticket | `joinTicketRequestSchema`: strict `{ mapVersion, protocolVersion }`; `joinTicketResponseSchema`: `{ ticket, expiresAt }` | CP03 authenticated/CSRF/Origin protected; only the response contains the raw capability |
| Socket handshake | `officeSocketAuthSchema`: strict `{ ticket, protocolVersion }` | CP05.1 Engine.IO exact-Origin, WebSocket-only, 4 KiB transport bound and `/office` middleware; no client identity/role/spawn |
| Takeover reference | `POST .../takeover-reference` returns `{ participationId, officeEpoch, reference, expiresAt }`; `POST .../join-ticket/takeover` accepts it with map/protocol versions | CP05.4b; one-use, same user/session/membership grant and exact live target, expires within 30 seconds or sooner with session; never accepted by ordinary CP03 `join-ticket` |

CP03 derives user/session/company/office/map/protocol/current epoch/activation-grant identity from server policy, stores only the ticket digest, checks expiry and caps lifetime by the actual session. A membership activation grant stays stable through ordinary policy writes and changes on reactivation. CP05.1 accepts only the raw ticket and protocol version over Socket.IO auth, then derives all remaining scope from the ticket record.

CP03 consumes once in a transaction with fresh current-policy conditional writes. CP05.1 uses strict auth to derive ticket scope from the stored ticket, rechecks current session/account/workspace/membership/map/epoch in that transaction, then reserves capacity in the in-memory runtime, builds the validated snapshot, subscribes and emits ready. A consumed ticket stays spent if a later reservation fails or the response is lost. A retry requests a fresh ticket and repeats policy checks within issuance budgets. Mongo transactions do not make the in-memory runtime transactional. CP05.2 adds five-second request-start leases checked every second and removes idle sockets after logout, session rotation, password change/reset, account/workspace suspension, membership removal and policy-read errors. An independent timer expires a lease even while its policy request is pending, so late replies cannot revive the socket. Reconnect requires a fresh ticket and snapshot. The in-process poller observes committed policy change within a bounded interval; real Mongo-outage drills and immediate cross-process notifications remain future deployment work. CP05.3a/b adds process-local server movement, per-socket availability and seat commands, validated Commons collision, occupancy serialization and versioned deltas. CP05.4a validates the current actor/epoch and known version, limits snapshot requests to three per second per socket and returns the current safe world snapshot to the requesting socket. CP05.4b issues an opaque digest-backed reference after current policy checks; its separate one-use ticket is bound to the same user/session/membership and exact participation. Runtime replacement is synchronous, releases the old seat and disconnects the old socket with `taken_over`. These runtimes/references remain process-local; browser recovery and multi-instance ownership remain incomplete.

## State and command shapes

Exports: `packages/contracts/src/realtime/office.ts` and `realtime/events.ts`. Parse event names through the explicit allowlist before using the schema maps; legacy join/signal/media:token/chat and object-prototype names are not accepted. Socket connection errors remain safe pre-admission errors, not an alternate join event.

All client commands have `{ eventId, officeEpoch, payload }`. eventId/officeEpoch are UUIDs. Movement sequence is an unsigned 32-bit integer; state versions/timestamps are nonnegative safe integers. Epoch/version equality and ordered replies must be checked against server/local accepted state, not values adopted from an incoming packet. End participation/rebootstrap before any sequence/version overflow; no wraparound within a participation.

| Event | Payload / projection |
| --- | --- |
| `world:input` | `{ sequence, dx, dy }`; each axis is -1, 0 or 1, including zero/zero stop. Normalize diagonal intent server-side so it cannot increase speed. No x/y/speed/userId/role |
| `presence:update` | `{ availability }` with available/busy/away; legacy focus behavior is not an extra wire state |
| `seat:sit` | `{ seatId }` from the approved map |
| `seat:stand` | Strict empty object; server chooses a valid exit |
| `world:resync` | `{ stateVersion }`; new full snapshot, never replay old movement |
| `office:ready` | participationId, workspaceId, officeId, mapVersion, protocolVersion and snapshot containing that participation |
| `world:snapshot` | officeEpoch, stateVersion, serverTime, participants and seats |
| `world:delta` | officeEpoch, baseVersion, stateVersion, serverTime, changed full participant projections, removedParticipationIds and changed seats |
| `office:access-ended` | officeEpoch and safe reason: authorization_ended/taken_over/office_draining/server_unavailable |

A public participant contains participationId, displayName, approved bodyId/paletteId appearance references, position, north/east/south/west facing, availability, nullable seatId and lastProcessedInputSequence. It excludes account userId/email, session IDs, auth/policy/lease state and private conversation membership. Seat IDs preserve the imported `<objectId>:<index>` form as bounded alphanumeric/underscore/hyphen/colon strings; they are map keys, never resource paths. A seat row is `{ seatId, occupantParticipationId }`, where null clears occupancy. Snapshot seats may include occupied and/or explicitly empty seats; static definitions stay in immutable geometry.

Full snapshots reject duplicate IDs, multiple seats for one participant and inconsistent participant/seat references. Deltas reject non-increasing versions, duplicate identities and the same participant being changed/removed simultaneously. The receiver applies changes to its accepted state, then verifies the resulting projection before replacing it.

`worldDeltaForStateSchema(current)` additionally binds a delta to an already accepted officeEpoch and exact base stateVersion. Replaying an old epoch/delta or receiving a gap fails; request a bounded resync and replace from a current snapshot. It does not itself subscribe, mutate world state or enforce authorization. Schema validity is not proof of who sent the packet.

## Acknowledgements, retries, takeover and seat exits

- Commands return strict `{ eventId, ok: true }` or `{ eventId, ok: false, error: { code, retryAfterMs? } }`. Safe data arrives through accepted snapshots/private conversation events; acknowledgements do not expose generic arbitrary result objects. Event retry hints are integer milliseconds capped at sixty seconds; current HTTP Retry-After behavior is unchanged.
- Cache recent command outcomes per participation using eventId plus a fingerprint of the event name and validated payload, within the declared entry/time limits. Reuse with a changed payload fails; replay does not execute another sit/leave/opt-in. Commands requiring a cached outcome must fail with `rate_limited` rather than evict an unexpired outcome and risk executing it again. Coalesce/reject movement by sequence; do not maintain every movement in this replay cache. Idempotency is bounded to the declared window, not an indefinite exactly-once promise; clients must not retry an expired event ID and must fetch current state after an uncertain old outcome.
- On reconnect/uncertain outcome, fetch state and use fresh admission rather than replaying an offline command queue. Keep Socket.IO connection-state recovery disabled. Epoch changes invalidate input, pending references and old deltas.
- An ordinary second tab gets participation_conflict and does not evict the first. CP05.4b issues a one-use opaque confirmation reference only after current policy checks and binds its digest to participation/user/session/membership/workspace/office/epoch/expiry. The HTTP routes are `POST .../takeover-reference` followed by `POST .../join-ticket/takeover`; the reference is not accepted by ordinary CP03 ticket issuance. Runtime takeover rechecks the exact active target, retires its seat and old socket, then activates the replacement. Do not add the reference to URLs/storage or use another person's participation ID as authority. Multi-instance references/fencing remain unimplemented.
- The server checks the active map's distance/reachability/occupancy on sit. Stand examines approved exits in deterministic manifest order, skips blocked/occupied destinations and selects the first valid exit. If none is valid, keep the participant seated and acknowledge seat_exit_blocked; never teleport through geometry. Disconnect/revocation/takeover releases occupancy without requiring a physical exit. Seat occupancy does not bypass availability/explicit opt-in; source eligibility still comes from current conversation policy.

## Ownership and continuing authorization

| Boundary | Owner | Required current checks / teardown |
| --- | --- | --- |
| Durable account/company command | Identity/tenancy API | Current session/account and scoped membership/owner policy inside the transaction |
| Ticket issue/consume | Office admission API | Current policy plus map/protocol/epoch/activation grant, expiry and issuance budgets |
| Reservation, movement, seats, snapshots | One office runtime in the NestJS process | Serialized command ownership and live unexpired participation; no worker/Redis permission truth |
| Continuing office authority | Office lease checker | Independent polling, bounded primary reads, monotonic request-start deadlines, reply sequences and session lifetime cap |
| Conversation membership | Office-owned conversation service | One active conversation/participation, explicit opt-in/meeting admission and current lease |
| Media grants/permits | Media policy plus proven guard/supervisor | Current generation/sources, exact installed permit acknowledgement, recheck before signing; CP07/CP08 implementation |
| Mail delivery | Worker/outbox | Expiry/current payload and safe retries; never a dependency for urgent revocation |

Immediate revocation hints follow committed policy changes and accelerate cleanup. Periodic lease checks independently recover missed hints. A late response cannot revive ended access or renew from response-arrival time. On expiry/revoke/disconnect/takeover/drain, remove subscriptions, participation/seat and affected conversation authority. Deny new protected work while Mongo/policy freshness is unavailable. A crash creates fresh office epochs and default-deny media permits.

## Initial budgets and failure behavior

These values are exported in `packages/contracts/src/limits.ts`; they are engineering starting budgets requiring measurement. Defining constants does not install runtime limiters or promise capacity/cutoff.

| Budget | Starting value | Enforcement / measurement packet |
| --- | --- | --- |
| Active participants/company office | 20 | CP05 serialized reservation; CP11 workload |
| Meeting media members | 6 | CP09 serialized zone/source policy |
| Raw inbound app event / parsed-value JSON | 4 KiB | CP05 transport byte cap before parsing plus strict schema/UTF-8 guard |
| Snapshot/delta JSON | 64 KiB; at most 512 seat rows | CP05 outbound construction; CP02 map seat bound and CP06 receiver checks |
| Geometry dimension | At most 32768 pixels/axis | CP02 importer/manifest validation; not a map size recommendation |
| Movement input | 30/sec/participation; server simulation 20 Hz, broadcast at most 10 Hz; 192 px/sec normalized speed; held intent expires after 250 ms | CP05.3a per-participation budget, monotonic simulation and validated Commons collision; CP11 latency/noisy-neighbor proof |
| Presence/seat commands | 30/sec/socket | CP05.3b shared per-socket command attempt window; per-workspace/shared multi-instance budget remains open |
| Snapshot resync | 3/sec/socket, also subject to the 30/sec office-command limit | CP05.4a per-socket sliding window; shared multi-instance and observed-client retry policy remain open |
| Policy check / maximum lease | 1 second / 5 seconds, capped by remaining session validity | CP05 monotonic bounded checks; measured under failure/load |
| Ticket lifetime | At most 30 seconds, capped by session validity | CP03 transaction-time issuance/consume |
| Ticket issuance | Actor 10/min; authorized company 120/min; service 1000/min | CP03 dedicated scoped budgets; 429 when exceeded, no extra capability; recheck before pilot tuning |
| Replay outcome cache | 128 entries/participation for 30 seconds | CP05 bounded fingerprint/outcome cache; reject new retryable commands if unexpired capacity is exhausted |
| Takeover confirmation reference | At most 30 seconds, bounded by session validity | CP05 same-actor/session one-use confirmation |

Issuance limits protect reconnect churn without replacing HTTP/auth limits. Separate movement, command, handshake, resync and per-company/service queue-depth budgets must be chosen/tested in CP05; do not interpret the movement allowance as permission for arbitrary command floods. `fitsJsonByteLimit` counts UTF-8 JSON bytes and rejects unencodable values; it does not prevent allocation of an oversized raw frame, so transport limits remain mandatory.

## Profile and private conversation shape checkpoint

`http/profile.ts` permits a nonempty displayName and/or `{ bodyId, paletteId }` update only. It rejects role/policy/URL fields. CP02 selects approved catalog IDs; CP06 must resolve IDs and authorize/persist the update. No profile endpoint is implemented in CP01.

`realtime/conversations.ts` defines bounded opt-in/leave/meeting command envelopes and a private update: officeEpoch, conversationId, kind, state, version, opaque UUID generation, mediaReady and safe member projections. Non-ended proximity has exactly two unique members; meetings have one to six. End notices contain no roster or positive media permission. Only active updates may claim mediaReady. CP08.1 implements private office-runtime delivery for proximity `joining`/`ended` state, always with `mediaReady: false`; it does not authorize media grants or retire a LiveKit generation. Do not broadcast this event in the public office room. Joining a meeting targets a zone ID; the server resolves its current conversation/generation and serializes admission rather than trusting a client-selected room/version.

D02 is accepted all-LiveKit. Source-specific JWT/permit/webhook schemas and the actual installed-ack/shutdown protocol are frozen against the pinned successful CP07 proof before production CP08 media. No JWT signing or media permission is established by these public event shapes. Full company lifecycle/export/retention and actual supported browser-version evidence remain at CP09/CP11 gates.

## Validation evidence to record

Focused contract checks cover secret/identity overposting, map hash/path/version mismatch, invalid protocol/pending maps, out-of-bounds spawn, non-intent movement, duplicate/inconsistent occupancy, stale epoch/base/replayed delta, bounded acknowledgement errors, Unicode byte limits, oversized aggregate snapshots and private end notices. Existing auth/company integration checks validate real response compatibility. Runtime replay/expiry/race/flood/lease/media enforcement scenarios must still run with their actual implementations; fixtures cannot close A04–A08.
