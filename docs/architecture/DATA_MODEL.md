# Data model and consistency plan

Status: proposed fields and indexes; no migrations exist · Updated: 2026-11-05

## Customer tenancy

B2B SaaS customer isolation is required. The planning default maps a company to `workspaces`; a global user holds independent tenant memberships. Resolve D12 before schema freeze if a customer must own multiple workspaces under an organization. No organization or subscription collection is selected yet. Tenant-specific queries, indexes, idempotency/cache keys, jobs and audits must retain explicit scope.

## Durable records

| Collection | Required uniqueness / useful lookup | Expiry and lifecycle |
|---|---|---|
| users | normalizedEmail unique | Account lifecycle; deletion/retention open |
| credentials | userId unique | Replace version atomically with authVersion |
| sessions | tokenDigest unique; userId + revokedAt | Explicit idle/absolute expiry; TTL on cleanup deadline |
| auth_tokens | tokenDigest unique; userId + purpose | Explicit expiresAt, consumed/superseded state; TTL cleanup |
| workspaces | slug unique | Status and policyVersion; exact memberCount |
| memberships | workspaceId + userId unique | Revocation state and policyVersion |
| invitations | tokenDigest unique; workspaceId + intendedNormalizedEmail lookup | Explicit expiry and redemption; TTL cleanup policy TBD |
| offices | workspaceId unique for MVP | mapVersionId and configuration revision |
| office_join_tickets | ticketDigest unique | Explicit expiry/consumption; TTL cleanup |
| outbox | eventId unique; operationId/type dedupe per command; state + availableAt | Encrypted secret payload purged on delivery/expiry |
| audit_events | eventId unique; workspaceId + occurredAt | Proposed 30-day application retention; independent recovery copy |

Provisional/conditional collections: `map_versions` for metadata if static manifests need DB references, and `map_overrides` only if scoped decoration edits enter implementation. Static geometry, seat/zone definitions, appearance subdocuments and media JWTs do not require dedicated collections by default. All field details are in the [entity catalog](../entities/README.md).

Use a consistent opaque external ID format and UTC timestamp representation; freeze the precise encoding in M0. Define schema validation, allowlisted projections, index migrations and rollback/rebuild behavior before deployment. Do not depend on production Mongoose auto-index creation.

## Atomic business operations

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

- Office-owner memory: participants, positions, input sequences, seats, zone membership, conversations, generation/version and authorization lease deadlines.
- Guard-local expiring state: current media permits, nonce/sequence, boot epochs and irreversible generation retirement.
- Redis cache: rate counters and disposable hints with bounded TTL/failure policies; never durable permission truth.
- Queue Redis: persistent BullMQ state, noeviction and bounded retention; separate production instance from cache Redis.
- Static files: cleared textures, manifests and immutable map geometry; no per-tick writes or base64 artwork in user records.

## Deletion and recovery

Account/workspace hard deletion is not yet specified; do not invent cascading deletion behavior during feature implementation. Retention must cover operational needs without retaining token secrets. On restore, invalidate restored sessions/tokens/media generations and suspend access until later security mutations have been reconciled against independent evidence. See [operations](../operations/README.md).
