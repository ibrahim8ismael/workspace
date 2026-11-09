# CP04.5b — Independent audit mirror design

Status: proposal for owner review; no external storage, retention, or outage policy selected · Updated: 2026-11-09

This design continues CP04.5 without configuring a provider or changing runtime code. It follows the existing [audit entity boundary](../entities/audit-events/README.md), [recovery runbook](../operations/README.md#safe-backup-restore-procedure), and owner decision that external SMTP is deferred. Audit mirroring is a separate recovery control; it does not use or depend on the mail provider.

## Current boundary

`AuditService.record` stores successful security mutations in MongoDB `audit_events` in the same transaction as the account/company mutation. The record currently contains `_id`, `actorId`, nullable `workspaceId`, `action`, `targetId`, `createdAt`, and a thirty-day `expiresAt`. The API assigns a safe request ID, but it is not passed into the audit record. The taxonomy is limited to committed mutations; denied requests and general access events are not a complete audit trail. The current collection belongs to the same database and backup domain as the business records, so it is not an independent recovery source.

## Recommended delivery shape

Keep the Mongo audit write in the business transaction. In that same transaction, add a durable mirror-outbox row whose immutable event ID is the existing audit `_id`. A dispatcher delivers rows at least once to an append-only store controlled outside the application database's backup and administrator boundary. Do not call the remote store while a Mongo transaction is open.

The receiving boundary should validate an explicit schema version and digest, accept create-only writes keyed by event ID, and acknowledge only after durable storage. A repeated event ID with the same digest is an idempotent success; the same ID with different content is an integrity alert and must not overwrite the first record. Keep the outbox item until verified acknowledgement, then remove only its delivery payload/state according to the approved cleanup policy. Retry transient failures with bounded backoff; persist safe error codes only, never payloads, credentials or provider response bodies in logs.

This is an at-least-once design. It avoids a remote call inside a database transaction and makes ambiguous acknowledgements recoverable, but does not claim atomic cross-provider writes or exactly-once storage. The append-only target plus stable IDs and digest checks provide duplicate handling and tamper evidence for each event; they do not provide a hash chain across events.

## Proposed event projection

The first mirror version should preserve the current meaning and avoid turning this into general activity tracking:

| Field | Source / rule |
| --- | --- |
| `schemaVersion` | Required, explicit integer; incompatible changes use a new version |
| `eventId` | Current audit `_id`; stable across retries |
| `occurredAt` | Current `createdAt`, UTC |
| `actorId` | Current opaque user UUID |
| `workspaceId` | Current nullable opaque workspace UUID |
| `action` | Current allowlisted mutation action |
| `targetId` | Current opaque target ID |
| `targetType` | Proposed typed target discriminator; add only with a reviewed action-to-target mapping |
| `requestId` | Optional proposed link to the existing response request ID; no URL, headers or request body |
| `digest` | SHA-256 of canonical versioned event bytes, excluding the digest field |

Never mirror passwords, password hashes, session or CSRF secrets, invitation/reset/verification tokens, message content, raw request bodies, or email addresses. The mirror records successful transactional changes, not denied login attempts. If abuse investigations later need denied-event evidence, scope it as a separate event taxonomy with explicit data-minimization and retention review.

## Delivery and recovery behavior

1. The existing mutation transaction inserts the local audit record and one mirror-outbox record. Transaction rollback removes both.
2. The dispatcher selects pending rows, computes/carries the canonical digest and sends the versioned event using its stable event ID.
3. The mirror validates schema and digest, performs an immutable create, and returns a durable acknowledgement.
4. The dispatcher records acknowledgement and applies the approved local outbox cleanup. A lost acknowledgement causes a retry with the same event ID and bytes.
5. Monitor oldest pending age, pending count, last successful acknowledgement, digest conflict, and delivery failures. Alert thresholds and recipients are owner/deployment choices; do not invent them in code.
6. During restore, keep restored identities and tenant access suspended. Compare the backup timestamp with the independent mirror, reconcile post-backup password/session/membership/suspension mutations, invalidate restored credentials/tokens and reopen only reconciled access. Missing intervals require manual review, not automatic reactivation.

Recommended outage posture: retain local transactional evidence in the outbox and retry; do not silently discard or mark an event delivered. A mirror outage does not itself prove Mongo's committed record was lost. However, a restore or recovery must not proceed as complete while required mirror intervals are missing. The owner must set the maximum tolerable mirror lag, alert path, and whether selected high-risk mutations should be blocked after that limit. This design does not silently choose a fail-open duration.

## Decisions required before implementation

| Choice | Recommendation to evaluate | Trade-off / required owner input |
| --- | --- | --- |
| Independent destination and trust boundary | Append-only storage in a separately administered account/security boundary | Select an existing platform/account and grant narrowly scoped create/read access; this may add cost and egress |
| Retention and immutability | Retain longer than the oldest restorable backup plus reconciliation window; prevent ordinary application-role deletion | Owner supplies retention period, legal/privacy constraints, and lock mode; do not assume the current thirty-day TTL is sufficient |
| Mirror outage policy | Durable retry/outbox; restore remains suspended until caught up; alert on lag | Owner sets lag budget, recipients and whether to block selected security mutations after it |
| Event schema | Versioned allowlist, stable ID, target type, optional request ID and digest | Confirm whether request IDs are needed and which action/target mappings must be included |
| Access and key ownership | Application can create but cannot list/delete immutable history; recovery operators have separately audited read access | Name the operational owner and define encryption-key rotation and break-glass procedure |

Do not create provider resources or change security-mutation behavior until the destination, retention, and failure policy are accepted. The code follow-up should implement a unit-tested projection/digest and same-transaction outbox first, then a provider adapter and failure/recovery integration tests after an actual destination is selected.

## Acceptance tests for the future implementation

- Business mutation, audit row, and mirror outbox commit or roll back together.
- Retry after timeout, duplicate acknowledgement, dispatcher restart and duplicate delivery produce one immutable event ID with matching bytes.
- Conflicting bytes for an existing event ID fail closed and alert without overwriting.
- Storage outage retains the event and increments bounded retry state; no secret or event payload enters logs.
- Independent access controls prevent the application role from changing/deleting acknowledged archive entries.
- Backup restore with post-snapshot password reset, session revocation, membership removal, and a missing mirror interval keeps affected identities suspended until reconciled.
- Retention and key rotation are exercised in the selected provider's staging environment.

None of these provider/recovery acceptance tests are claimed complete by this design note.
