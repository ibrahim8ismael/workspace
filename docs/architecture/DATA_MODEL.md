# Data model and consistency plan

Status: initial identity/tenant/delivery models implemented; office/runtime additions planned · Updated: 2026-11-08

## Customer tenancy

B2B SaaS customer isolation is required. The owner accepted one company/workspace/office for MVP under D12 on 2026-11-08; a global user holds independent tenant memberships. A future multiple-workspace organization hierarchy needs a separate decision and migration. No organization or subscription collection is selected yet. Tenant-specific queries, indexes, idempotency/cache keys, jobs and audits must retain explicit scope.

## Durable records

The following collections exist. Mongo `_id` is the stored identity; safe API DTOs expose `id` where defined. UUIDs identify domain records; `operations` and `rate_limits` use scoped digest IDs.

| Collection | Current indexes / lookups | Explicit expiry and lifecycle |
| --- | --- | --- |
| users | `_id`; unique `normalizedEmail` | pending/active/suspended; deletion/retention open |
| credentials | `_id`; unique `userId` | `version`/`accessFence`; replace hash with user authVersion changes |
| sessions | `_id`; unique `tokenDigest`; userId + revokedAt | kind, authVersion, csrfSecret; absolute/idle checks; TTL on absoluteExpiresAt |
| auth_tokens | `_id`; unique `tokenDigest`; userId + purpose | authVersion, expiresAt, consumedAt; supersession also sets consumedAt; TTL expiresAt |
| rate_limits | digest `_id` per scope/key/window | count and expiresAt; TTL expiresAt; Mongo-backed budgets |
| workspaces | `_id`; unique `slug` | active/suspended, policyVersion, exact memberCount; no closed/deleted API |
| memberships | `_id`; unique workspaceId + userId; workspaceId + role + status; userId + status | active/revoked, policyVersion; no revokedAt or rotating activation grant yet |
| invitations | `_id`; unique `tokenDigest`; workspaceId + email | expiresAt, consumedAt, acceptedBy, revokedAt; TTL expiresAt |
| operations | digest `_id` scoped to actor/operation/key | fingerprint, stable result, createdAt; no TTL/cleanup policy implemented |
| offices | `_id`; unique `workspaceId` | mapVersion currently pending-m0; no live runtime |
| outbox | `_id`; state + createdAt; subjectId + kind | payload, attempts, expiresAt, cleanupAt, deliveredAt; purge secrets on delivery/expiry; TTL cleanupAt |
| audit_events | `_id`; TTL expiresAt | createdAt and thirty-day expiry; independent recovery mirror absent |

Source of truth: [identity models](../../apps/api/src/modules/identity/identity.models.ts), [tenancy models](../../apps/api/src/modules/tenancy/tenancy.models.ts), [outbox schema](../../packages/delivery/src/outbox.ts), [audit schema](../../apps/api/src/modules/audit/audit.service.ts) and [index provisioning/startup checks](../../apps/api/src/platform/database/indexes.service.ts).

The proposed `office_join_tickets` collection does not exist yet. CP03 adds its digest uniqueness and TTL alongside map/protocol/epoch/session/activation-grant binding. Audit workspace/time lookup indexing, operation-result retention, independent mirror acknowledgement and any additional outbox tenant projection require an explicit owning contract; none is claimed by the table above.

Provisional/conditional collections: `map_versions` for metadata if static manifests need DB references, and `map_overrides` only if scoped decoration edits enter implementation. Static geometry, seat/zone definitions, appearance subdocuments and media JWTs do not require dedicated collections by default. All field details are in the [entity catalog](../entities/README.md).

Current HTTP contracts use UUID domain IDs and UTC ISO timestamp DTOs. Mongoose strict schemas and allowlisted projections are implemented; `pnpm db:indexes` creates missing declared indexes without destructive synchronization. Startup validates exact required uniqueness constraints and transaction-capable MongoDB. Versioned data migration/rollback/backfill tooling remains planned. Production does not use automatic index creation.

## Atomic business operations

Account/company mutations below are implemented and have local evidence in [AUTH_IMPLEMENTATION_EVIDENCE.md](../planning/AUTH_IMPLEMENTATION_EVIDENCE.md). Office join and live revocation hints remain planned under CP03/CP05; they must not be inferred from an existing HTTP transaction.

| Operation | Records committed together | Conflict / retry requirement |
|---|---|---|
| Register and mail issuance | pending user, credential, auth token, outbox | Unique email; generic response policy |
| Verify account | token consumption and account activation | Pending password proof or safe credential replacement |
| Reset/change password | credential version, user authVersion, token state where applicable, audit/outbox as needed | Concurrent login cannot issue usable old-version session |
| Create workspace | workspace, owner membership, office reference, user ownedWorkspaceCount, audit | Conditional account quota and policy write |
| Accept invitation | invite consumption, membership, workspace memberCount, audit | Matching verified recipient; quota and policy conflicts |
| Remove member | membership status/version, count, audit | Conditional current owner/member policy; live revocation hint follows commit |
| Transfer ownership | workspace owner/policy, both roles, both users’ owned counts, audit | Exactly one owner; new-owner quota; recent reauthentication |
| Join office | durable one-use ticket consumption; then serialized runtime reservation | Memory and Mongo are not one transaction; failure requires fresh ticket and cleanup |

Unknown transaction outcomes are reconciled using stable operation IDs and result lookup. Do not blindly replay external effects or increment counts twice. Outbox dispatch is at-least-once; individual effects need idempotency. Not every audit/outbox row is mandatory for every mutation: define the required event set with each domain command.

## Transient and static state

- Planned office-owner memory: participants, positions, input sequences, seats, zone membership, conversations, generation/version and authorization lease deadlines.
- Planned guard-local expiring state: current media permits, nonce/sequence, boot epochs and irreversible generation retirement.
- Current request budgets: MongoDB `rate_limits` through AbuseService. Redis cache remains planned for disposable hints/cache with explicit failure policy; it is not authoritative permission storage.
- Queue Redis: BullMQ code validates noeviction and bounds job retention; persistent production infrastructure/outage evidence is still pending. Production queue/cache instances are to be separate.
- Static files: cleared textures, manifests and immutable map geometry; no per-tick writes or base64 artwork in user records.

## Deletion and recovery

Account/workspace hard deletion is not yet specified; do not invent cascading deletion behavior during feature implementation. Retention must cover operational needs without retaining token secrets. On restore, invalidate restored sessions/tokens/media generations and suspend access until later security mutations have been reconciled against independent evidence. See [operations](../operations/README.md).
