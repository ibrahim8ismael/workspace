# Deployment and operations plan

Status: local delivery configuration prepared, with runtime verification pending · Updated: 2026-11-09

The [local delivery runbook](../../infra/README.md) defines the CP04.3 localhost configuration and explicit setup/start commands. Runtime evidence is tracked in the [CP04 delivery plan](../planning/CP04_BROWSER_AND_DELIVERY.md).

## Deployment contract

Compose initially runs Caddy/ingress, NestJS backend, worker, transaction-capable MongoDB replica set, cache Redis, separate persistent noeviction queue Redis, LiveKit, and the chosen media guard/supervision/TURN arrangement. Caddy serves built React files and same-origin `/api` and `/socket.io`. Database, Redis and control/admin services stay private.

Choose maintained pinned package/image versions and production secret storage before deployment. Use least-privilege containers, persistent volumes and controlled migrations. Caddy HTTPS proxying alone does not carry WebRTC UDP. Validate public media IP/ports and TURN/TLS 443 endpoint/routing. A separate coturn is optional if embedded TURN meets the selected deployment requirements. Do not assume `host.docker.internal` works on the chosen Linux host.

Media readiness requires current guard policy and effective independent supervision. There is no unguarded fallback endpoint. Docker restart policies alone do not demonstrate forwarding cessation after guard failure. Resolve [D03](../decisions/README.md) first.

## Observability and failure policy

| Signal / failure | Required handling |
|---|---|
| Auth abuse / hash saturation | Per-account/IP/global limits, bounded workers, safe generic responses; alert sustained abuse |
| Socket/event/tick/memory growth | Bound payload/input rates; monitor tick delay, snapshot size and participant capacity |
| Mongo unavailable / freshness timeout | Deny new protected grants/writes; existing live authorization expires within bounded leases |
| Media guard/controller/SFU control failure | Deny admission, retire generations, independently stop forwarding if required; show media unavailable |
| Queue Redis/worker outage | Preserve durable outbox; bounded retry and visible age/failure alerts; urgent revocation stays synchronous |
| Cache pressure/outage | Only disposable data may vanish; define fail behavior per limiter/cache, never restore permissions from stale cache |
| TURN/weak-network failures | Measure relay success, egress and media join errors; show retry state and explicit device state |
| Audit mirror gaps / backup failure | Alert with responsible owner; retain safe suspended-access recovery policy |

Log request/event IDs and safe error codes without raw credentials or message content. Track lease expiry, stale/orphan media rooms, media join latency/success, queue age, memory, egress and backup age. Thresholds and recipients are open deployment tasks; no notifications were configured by these docs.

## B2B customer operations

Measure usage and failures per company without leaking private data to other customers. Apply tenant budgets and measure noisy-neighbor effects under shared infrastructure. A guarded shared SFU shutdown may interrupt multiple customer calls: identify affected tenants and measure the blast radius in M0/M5. Define company suspension, offboarding/export and retention procedures before offering those controls. Contractual SLA, residency and dedicated deployment commitments remain open; existing recovery/availability targets are unverified engineering objectives.

## Planned restart and rollback procedure

1. Mark unready and drain office admissions; tell participants that reconnect is required.
2. Retire active media generations and enforce cutoff before replacing the authority.
3. Apply reviewed compatible schema/contract migrations and pinned build deployment.
4. Start with fresh office/guard epochs and default-deny permits; old tickets/snapshots cannot restore access.
5. Verify private networking, guard readiness and API health before reopening admission.
6. On failure, deploy compatible known build/config and repeat fresh admission. Never route around failed media enforcement.

Exact commands belong in environment-specific runbooks once the deployment exists.

## Safe backup restore procedure

Proposed objectives: RPO one hour, RTO four hours. Provider capability and a timed staging drill must demonstrate them.

1. Restrict traffic and suspend restored account/workspace access before opening the database snapshot.
2. Restore durable data/config; invalidate restored sessions and outstanding auth/invite/join tokens. Retire all previous media generations and control epochs.
3. Reconcile password resets, account suspensions, role/member removals and related mutations after backup against independent restricted audit/recovery evidence.
4. Where credential history is uncertain, require fresh mailbox recovery; logging in with an old restored password is insufficient. Keep uncertain tenants/identities suspended.
5. Reconcile outbox/queue work, expired encrypted delivery payloads and secrets. Do not blindly resend restored mail or replay stale permissions.
6. Verify old credentials/revoked access remain blocked, then reopen only reconciled identities and resources. Record unresolved intervals and the manual decision.

Assign deployment, incident response, restore and patching owners before M5. Implementation acceptance lives in [A07/A09/A10](../planning/ACCEPTANCE.md).
