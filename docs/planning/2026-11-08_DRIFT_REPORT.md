# Gather Lite documentation/code drift report

Date: 2026-11-08 (Africa/Cairo). Source baseline: `5040ca83dc3a3ffdbab48711e9e7b7161cce1329`, plus the existing uncommitted EGM installation. Produced with the installed [egm-drift-report skill](../../plugins/egm/skills/egm-drift-report/SKILL.md). Documents were processed sequentially against their corresponding source. This is a source comparison, not an independent Goldfish design review or deployed security audit.

Scope: all 76 pre-existing Markdown files under `docs/`, the root README and two source briefs, and application/package/infrastructure/test/spike READMEs. Plugin vendor documentation and asset notices are reference material, not Gather Lite specifications. Generated documents from this task are excluded from the input inventory.

Verification baseline: `pnpm check` was rerun successfully on 2026-11-08: formatting, lint, typechecking, five shared tests, 32 backend tests and all builds. Temporary local MongoDB/HTTP processes ran with the required port permission; queue/SMTP boundaries in tests were faked. The web build retains its LiveKit chunk-size warning. No Docker, real provider, SFU, deployed browser or restore check was run. Findings describe the input snapshot; the docs entrypoint now links this report and the [completion plan](PROJECT_COMPLETION_PLAN.md).

Labels: **STALE** = documentation understates or misdescribes current code; **PENDING** = a planned requirement has no implementation yet; **DIVERGENCE** = implementation differs from the target; **MODEL** = proposed fields/names differ from actual models; **EVIDENCE** = required execution evidence is missing. PENDING does not mean a regression or broken promise. MODEL does not mean every proposed field must be added: reconcile equivalent representations before changing code. “No drift detected” means no discrepancy in that document's stated scope, not product completion.

Findings below contain differences only. Source links resolve relative to this report. Existing historical evidence is retained; no acceptance gate is closed by this report.

## README.md

- **STALE:** The command table calls `dev:worker` an exiting scaffold. [Worker main](../../apps/worker/src/main.ts) now starts configured MongoDB/Redis/SMTP processing and remains running.

## GATHER_LITE_PROJECT_KNOWLEDGE.md

- **STALE:** Section 2's setup paragraph still says liveness is the only endpoint and describes a non-consuming worker. The subsequent backend update supersedes it; [auth](../../apps/api/src/modules/identity/auth.controller.ts), [tenancy](../../apps/api/src/modules/tenancy/tenancy.controller.ts) and [worker](../../apps/worker/src/main.ts) are implemented.
- **STALE:** Section 4 describes the imported SHA as not a commit pin. [Import provenance](../migration/UPSTREAM_IMPORT.json) now records that same value as the pinned commit and inventories copied code/assets.
- **DIVERGENCE:** The current frontend still stores session/admin/invite secrets in [config.ts](../../apps/web/config.ts), derives a browser identity and uses raw `/ws` in [useOffice.ts](../../apps/web/useOffice.ts), renders SVG in [VivoScene.tsx](../../apps/web/VivoScene.tsx), and retains P2P in [useMedia.ts](../../apps/web/useMedia.ts). The target is cookie authentication, server identity, Socket.IO, Phaser and a separately resolved media topology.
- **PENDING:** Office simulation/admission, continuing leases, conversations, media authorization/enforcement, Phaser bridge, deployment and restore mechanisms have no production implementation. [Office](../../apps/api/src/modules/office/office.module.ts), [conversations](../../apps/api/src/modules/conversations/conversations.module.ts) and [media](../../apps/api/src/modules/media/media.module.ts) are empty modules; [world](../../packages/world/src/index.ts) contains only a point interface.
- **DIVERGENCE:** Rate budgets use MongoDB in [AbuseService](../../apps/api/src/modules/identity/security/abuse.service.ts), whereas the durable/transient table proposes Redis counters. The implemented auth contract documents this intentional choice; reconcile the table rather than moving authorization to Redis.
- **DIVERGENCE:** Recorder, chat/calendar, map editing and durable desk-assignment controls remain in [App.tsx](../../apps/web/App.tsx) despite their deferred scope.

## GATHER_LITE_TECH_STACK.md

- **STALE / historical:** Next.js, Colyseus admission and systemd-oriented media supervision conflict with the newer brief and repository's React/Vite/NestJS/Socket.IO/Docker direction. Preserve this document as historical, not an implementation source.
- **MODEL / historical:** Its five-minute recent-password window differs from the implemented ten-minute window in [SessionService.recent](../../apps/api/src/modules/identity/sessions/session.service.ts) and the newer auth contract. Reconcile references without silently changing runtime policy.
- **PENDING / historical:** Its end-to-end simulation, media enforcement and operational controls are not delivered by the installed libraries or empty modules. Use the current contracts for remaining implementation rather than reviving superseded interfaces.

## docs/README.md

- **STALE:** Opening text says product authorization is unimplemented. Initial auth/company authorization exists in the [identity](../../apps/api/src/modules/identity/auth.service.ts) and [tenancy](../../apps/api/src/modules/tenancy/tenancy.service.ts) services. The final paragraph partially corrects the opening.
- **PENDING:** Phaser, authoritative office state and media described in the product architecture remain target components, not the running frontend/backend integration.

## docs/architecture/README.md

- **STALE:** The repository-layout paragraph describes feature-owned frontend folders. Active source remains flat under `apps/web`, with [main.tsx](../../apps/web/main.tsx) loading the imported App.
- **DIVERGENCE:** The target React/Phaser bridge and current-policy media path have no equivalent in the SVG/raw-WebSocket/P2P imported client. Mongo-backed request budgets differ from the diagram's future cache responsibilities.
- **PENDING:** Canonical office runtime, leases, conversations, independent media shutdown and same-origin production ingress are absent; transaction policy rules alone do not implement those paths.

## docs/architecture/DATA_MODEL.md

- **STALE:** Models and explicit index provisioning now exist in [IdentityModels](../../apps/api/src/modules/identity/identity.models.ts), [TenancyModels](../../apps/api/src/modules/tenancy/tenancy.models.ts) and [IndexesService](../../apps/api/src/platform/database/indexes.service.ts); the document still labels everything proposed.
- **MODEL:** `rate_limits` and `operations` are implemented collections omitted from the durable inventory. Rate counters are Mongo-backed, not Redis-backed.
- **MODEL:** Actual fields use invitation `email`/`consumedAt`, office `mapVersion`, outbox `_id`/`subjectId`/`kind`/`payload`/`createdAt` and audit `createdAt`; the older table uses different names. Outbox has no `availableAt` or separate operation/type dedupe index; scoped durable-command idempotency lives in `operations`.
- **MODEL:** Sessions TTL-index `absoluteExpiresAt`; audit records TTL-index `expiresAt`; invitation expiry cleanup is implemented. The proposed audit workspace/time lookup index is absent.
- **PENDING:** `office_join_tickets`, transient office/conversation/permit state, independent recovery evidence and controlled data migration/restore are absent.

## docs/architecture/REPOSITORY.md

- **STALE:** Audit is grouped with empty conversation/media modules, but [AuditService](../../apps/api/src/modules/audit/audit.service.ts) writes transactional security records with 30-day cleanup.
- **STALE:** Delivery persistence/encryption is described as future work despite [outbox.ts](../../packages/delivery/src/outbox.ts) and the running worker implementation.
- **STALE:** The overall status predates backend implementation and the project-local [EGM installation](../operations/EGM.md).

## docs/contracts/AUTH_AND_ROLES_API.md

No drift detected.

## docs/contracts/HTTP.md

- **PENDING:** Office discovery/bootstrap/tickets, takeover extension, profile appearance updates, workspace rename/settings, readiness and private media webhook routes have no handlers. [Tenancy detail](../../apps/api/src/modules/tenancy/tenancy.service.ts) does not yet return `officeId`.
- **PENDING:** Shared runtime schemas validate auth inputs but safe response DTOs are TypeScript interfaces; the planned general runtime response/error schemas are absent from [contracts](../../packages/contracts/src/index.ts).

## docs/contracts/REALTIME.md

- **PENDING:** No `/office` gateway, exact-Origin Engine.IO admission, ticket middleware, event envelopes/acks, replay cache, snapshots/deltas, resync, takeover or continuing leases exists in the API.
- **DIVERGENCE:** [useOffice](../../apps/web/useOffice.ts) sends client identity/profile through raw `/ws`, consumes legacy event shapes, and asks for media tokens over that socket instead of the planned protected HTTP route.
- **PENDING:** Real Socket.IO client isolation/concurrency tests and typed realtime contracts are absent from [tests](../../tests/README.md) and [contracts](../../packages/contracts/src/index.ts).

## docs/contracts/MEDIA.md

- **PENDING:** Conversation generations, HTTP grant issuance, installed permits, guard, private webhook verification/reconciliation, independent supervisor and pinned SFU/TURN deployment are absent. [The spike](../../spikes/media-enforcement/README.md) is documentation only.
- **DIVERGENCE:** [useSfu](../../apps/web/useSfu.ts) requests legacy socket tokens and publishes by audio/video kind; screen video is treated as camera. [useMedia](../../apps/web/useMedia.ts) retains a separate P2P lifecycle. Neither implements generation-bound grants and source policy.
- **EVIDENCE:** No original/refreshed-token replay, forwarding-cutoff, guard-freeze, failed-deletion, TURN-only, weak-network or source-cap result is recorded.

## docs/decisions/README.md

- **STALE:** D06/D07 leave all auth/key mechanics open, although an injected 32-byte outbox key, Argon2 parameters, ten-minute recent proof, session lifetimes and several quotas are implemented. Provider, key storage/rotation, hardware measurements and live lease budgets remain open.
- **PENDING:** D12/D13 have not been formally closed although tenant schemas and self-service creation APIs already use a company/workspace/office model. Record whether that remains the MVP contract before further tenant/lifecycle work.

## docs/entities/README.md

- **MODEL:** The 26-entity list omits implemented internal `operations` and `rate_limits` records. They need documentation as internal implementation records, not necessarily new product entities.
- **PENDING:** Proposed static/runtime entities still lack the target implementation; the existing imported helpers do not establish canonical server state.

## docs/migration/README.md

- **STALE:** The opening says the SHA is not a commit pin; [UPSTREAM_IMPORT.json](../migration/UPSTREAM_IMPORT.json) records the actual pin and imported paths/assets.
- **PENDING:** Shared-rule extraction, immutable map contract, Phaser, cookie/Socket.IO adapters and deferred-feature removal have not happened.
- **EVIDENCE:** No decision about existing upstream business data or an offline import rehearsal is recorded; a source import does not answer D10.

## docs/migration/WEB_IMPORT.md

- **STALE:** The verification-boundary paragraph says NestJS has liveness only and `/api/workspaces` returns 404. That route now exists with authentication; the legacy client still cannot use its UUID/request/response contract. Update the current boundary while retaining the dated smoke-test history.

## docs/operations/EGM.md

No drift detected.

## docs/operations/README.md

- **PENDING:** Compose, Caddy, image pins, secrets deployment, Redis persistence, public media routing, readiness/drain, operational metrics/alerts and environment-specific runbooks do not exist under [infra](../../infra/README.md).
- **PENDING:** Independent audit mirror, reconciliation tooling and backup/restore procedures have no executable implementation or timed drill.
- **EVIDENCE:** Load, cross-tenant impact, cutoff, RPO/RTO, weak-network and operational-owner signoff are unmeasured/unassigned.

## docs/planning/ACCEPTANCE.md

No drift detected.

## docs/planning/AUTH_AND_ROLES_IMPLEMENTATION.md

No drift detected.

## docs/planning/AUTH_IMPLEMENTATION_EVIDENCE.md

No drift detected.

## docs/planning/BACKEND_SYSTEM_IMPLEMENTATION.md

- **PENDING:** Stages 0/1 have remaining map, media-proof, provider, ingress and recovery work; stages 2a–5 lack office, realtime, conversation/media and pilot implementations. Empty modules and `pending-m0` office rows are the corresponding source boundary.
- **PENDING:** Browser onboarding, renderer migration and client integration are referred to as separate stages but have no equally detailed delivery breakdown; the completion plan accompanying this report supplies that cross-stack sequence.

## docs/planning/BACKLOG.md

- **STALE:** “Product milestones unstarted” and the suggested initial auth implementation order understate the implemented slice. B001 import/pin work exists; B003/B006/B011–B014 are implemented in part or at the local backend level. Provider/deployment/full acceptance remains open.
- **PENDING:** B004/B005, B007–B010, B015–B023 retain map/renderer, infrastructure/media-proof, realtime, recovery and B2B gaps. Preserve their IDs while distinguishing completed code from remaining evidence.

## docs/planning/OFFICE_ADMISSION_IMPLEMENTATION.md

- **PENDING:** `packages/contracts/src/http/office.ts`, map registry/spawn validation, office controller/services, epoch registry, join-ticket persistence/indexes, quota budgets, membership-grant rotation, backfill and admission tests are absent.
- **MODEL:** Existing memberships retain the same `_id` on reactivation and expose only changing `policyVersion`; no stable activation-grant identifier is available yet. Implement it before tickets can safely survive ordinary reads but fail after removal/reinvitation.

## docs/planning/ROADMAP.md

- **STALE:** Milestone tables do not identify the now-implemented backend portions of M1 or completed import/toolchain work in M0. M0/M1 release gates are still incomplete, so neither milestone should be marked passed wholesale.
- **PENDING:** The two-user office, proximity audio, meeting media and operational pilot deliverables have no implementation/evidence.

## docs/planning/SETUP_PROGRESS.md

- **STALE / historical:** The setup snapshot says nine projects, no imported assets and no auth/tenancy/delivery implementation. The current workspace has ten projects including root and `apps/shared`, imported source/assets and backend/worker implementations. Label those statements as the setup-time state rather than rewriting the historical checks.

## docs/product/B2B_SAAS.md

- **PENDING:** Formal hierarchy/onboarding/lifecycle decisions, company switching UI, suspension/resumption/closure/export/retention controls and cross-company live revocation are not delivered. Workspace status supports active/suspended but has no public lifecycle command or closed state.
- **EVIDENCE:** Per-company noisy-neighbor budgets and shared-media shutdown impact have no measured results.

## docs/security/README.md

- **STALE:** The blanket statement that all checks remain future work conflicts with the local auth/tenant/crypto suite and [recorded evidence](AUTH_IMPLEMENTATION_EVIDENCE.md). Production and live-path gates remain future work.
- **DIVERGENCE:** Legacy frontend storage, client identity and unsupported recorder controls do not meet the target browser boundary.
- **PENDING:** Socket leases/revocation, permit enforcement, deployed CSP/redaction, broader compromised-password screening, independent recovery evidence and measured load limits remain absent or unverified.

## apps/api/README.md

No drift detected.

## apps/web/README.md

- **STALE:** NestJS is described as exposing only liveness. New auth/company endpoints exist; the remaining gap is contract/protocol integration, not complete endpoint absence.

## apps/shared/README.md

No drift detected.

## apps/worker/README.md

No drift detected.

## packages/contracts/README.md

- **STALE:** “Initial export: API liveness response” omits [auth/company request schemas and DTOs](../../packages/contracts/src/http/auth.ts).

## packages/delivery/README.md

- **STALE:** The package exports more than a job reference: [outbox.ts](../../packages/delivery/src/outbox.ts) supplies the Mongo model, mail schema, key validation and authenticated encryption. API transactions and worker SMTP processing also exist in their owning apps.

## packages/world/README.md

No drift detected.

## packages/assets/README.md

- **STALE:** “No upstream assets have been imported” conflicts with its [provenance manifest](../../packages/assets/manifests/provenance.json) and `apps/web/public`. Asset metadata is recorded, although the target world/texture pipeline remains absent.

## packages/tooling/README.md

- **STALE:** The “future focused checks” description predates the shared and backend test scripts now included in [pnpm check](../../package.json).

## infra/README.md

No drift detected.

## tests/README.md

No drift detected.

## spikes/media-enforcement/README.md

No drift detected.

## docs/entities/assets/PLAN.md

- **STALE:** Pinning, source inventory and public-file integrity checks exist in [UPSTREAM_IMPORT.json](../migration/UPSTREAM_IMPORT.json) and [shared tests](../../apps/shared/tests/imports.test.js); the all-unimplemented status needs splitting.
- **PENDING:** A Phaser avatar/object proof, formal anchor/layer metadata and lifecycle/occlusion evidence are still absent.

## docs/entities/assets/README.md

- **MODEL:** The proposed asset catalog fields (`assetId`, dimensions, animation frames, anchors, layer and clearance status) have no unified runtime catalog. [Provenance](../../packages/assets/manifests/provenance.json) records paths/blob hashes, while rendering metadata remains scattered through `apps/web/sprites` and avatar files.
- **STALE:** Commit pin and imported public files now exist; the original tree-only/no-import narrative predates [WEB_IMPORT](../migration/WEB_IMPORT.md).

## docs/entities/audit-events/PLAN.md

- **STALE:** Safe audit persistence and transaction participation exist in [AuditService](../../apps/api/src/modules/audit/audit.service.ts); the plan still marks them unimplemented.
- **PENDING:** Independent delivery/failure policy, mirror monitoring and restore reconciliation remain undone.

## docs/entities/audit-events/README.md

- **MODEL:** [AuditRecord](../../apps/api/src/modules/audit/audit.service.ts) uses `_id`, `createdAt` and `expiresAt`; it lacks proposed `targetType`, `result`, `policyVersion`, `requestId` and independent-mirror acknowledgement. The thirty-day retention is implemented as TTL rather than remaining only a proposal.
- **PENDING:** No independent mirror/acknowledgement or restricted query/recovery tooling exists.

## docs/entities/auth-tokens/PLAN.md

- **STALE:** Issuance, supersession, transactional outbox, pending-password proof and reset concurrency exist in [AuthService](../../apps/api/src/modules/identity/auth.service.ts) and its integration tests.
- **PENDING:** Browser recovery pages and real delivery checks remain open.

## docs/entities/auth-tokens/README.md

- **MODEL:** [AuthTokenRecord](../../apps/api/src/modules/identity/identity.models.ts) uses `_id` and `authVersion`; supersession marks `consumedAt`, not a separate `supersededAt`. Do not add duplicate lifecycle fields solely to match the draft.
- **PENDING:** Recovery/verification browser forms and secret-safe routing are absent. Worker email currently provides codes and API instructions rather than frontend links.

## docs/entities/avatars/PLAN.md

- **PENDING:** A compact approved catalog/schema, server-side appearance validation/persistence, Phaser animation anchors and a typed React bridge are absent. Existing imported picker/frame files are migration input only.

## docs/entities/avatars/README.md

- **PENDING:** [UserRecord](../../apps/api/src/modules/identity/identity.models.ts) has no persisted appearance subdocument/version; no validated profile-update endpoint or safe appearance snapshot exists.
- **DIVERGENCE:** Appearance is browser-local in [App.tsx](../../apps/web/App.tsx); [AvatarEditor](../../apps/web/AvatarEditor.tsx) and sprite rendering do not implement the target Phaser catalog/animation lifecycle.

## docs/entities/calendar-events/PLAN.md

- **DIVERGENCE / deferred:** The acceptance criterion that the MVP not expose unsupported functionality is not yet enforced for CalendarView and calendar panel. No future feature model should be added merely to preserve these imported controls.

## docs/entities/calendar-events/README.md

- **DIVERGENCE / deferred:** CalendarView and calendar panel remain reachable in the imported [App](../../apps/web/App.tsx) / [useOffice](../../apps/web/useOffice.ts), although this document requires unsupported UI to remain hidden. No matching NestJS feature exists.

## docs/entities/channels/PLAN.md

- **DIVERGENCE / deferred:** The acceptance criterion that the MVP not expose unsupported functionality is not yet enforced for channel creation/listing controls. No future feature model should be added merely to preserve these imported controls.

## docs/entities/channels/README.md

- **DIVERGENCE / deferred:** channel creation/listing controls remain reachable in the imported [App](../../apps/web/App.tsx) / [useOffice](../../apps/web/useOffice.ts), although this document requires unsupported UI to remain hidden. No matching NestJS feature exists.

## docs/entities/chat-messages/PLAN.md

- **DIVERGENCE / deferred:** The acceptance criterion that the MVP not expose unsupported functionality is not yet enforced for ChatView and message sending. No future feature model should be added merely to preserve these imported controls.

## docs/entities/chat-messages/README.md

- **DIVERGENCE / deferred:** ChatView and message sending remain reachable in the imported [App](../../apps/web/App.tsx) / [useOffice](../../apps/web/useOffice.ts), although this document requires unsupported UI to remain hidden. No matching NestJS feature exists.

## docs/entities/conversations/PLAN.md

- **PENDING:** Deterministic matching, serialized membership/generation retirement, bounded recovery budgets and fixed-zone group transitions have no implementation or tests.

## docs/entities/conversations/README.md

- **PENDING:** The server has no conversation record/state machine, current member sets, versions, generations or one-conversation constraint; [ConversationsModule](../../apps/api/src/modules/conversations/conversations.module.ts) is empty.
- **DIVERGENCE:** [useMedia](../../apps/web/useMedia.ts) determines hearing from imported participant/area rules instead of server-owned opt-in pairing and generations.

## docs/entities/credentials/PLAN.md

- **STALE:** Argon2id adapter/parameters, bounded hash concurrency, credential-version fencing and recent proof exist, with local stale-login/reset tests. Split these from remaining screening/provider/hardware work.

## docs/entities/credentials/README.md

- **MODEL:** [CredentialRecord](../../apps/api/src/modules/identity/identity.models.ts) uses `_id`, `version` and `accessFence`; Argon2 algorithm/parameters are encoded in the hash, without separate `hashAlgorithm`, `hashParameters` or `credentialVersion` properties.
- **EVIDENCE:** The small weak-password set in [PasswordService](../../apps/api/src/modules/identity/security/password.service.ts) is not the planned comprehensive compromised-password policy; target-host hash capacity is unmeasured.

## docs/entities/desk-assignments/PLAN.md

- **DIVERGENCE / deferred:** The acceptance criterion that the MVP not expose unsupported functionality is not yet enforced for desk:assign commands and desk menus. No future feature model should be added merely to preserve these imported controls.

## docs/entities/desk-assignments/README.md

- **DIVERGENCE / deferred:** desk:assign commands and desk menus remain reachable in the imported [App](../../apps/web/App.tsx) / [useOffice](../../apps/web/useOffice.ts), although this document requires unsupported UI to remain hidden. No matching NestJS feature exists.

## docs/entities/invitations/PLAN.md

- **STALE:** Issue/supersede/revoke/accept, digest/scoped indexes, recipient binding, transactional capacity and concurrency tests exist.
- **PENDING:** Recipient UI and real provider delivery evidence remain absent.

## docs/entities/invitations/README.md

- **MODEL:** [InvitationRecord](../../apps/api/src/modules/tenancy/tenancy.models.ts) uses `_id`, `email` and `consumedAt` rather than `id`, `intendedNormalizedEmail` and `acceptedAt`; command idempotency lives in separate `operations` records, not `operationId` on invitations.
- **STALE:** Seven-day expiry, fifty pending invites and no capacity reservation are implemented in [TenancyService](../../apps/api/src/modules/tenancy/tenancy.service.ts), not unresolved defaults. Revocation uses DELETE, not the older proposed POST outline.
- **PENDING:** Recipient acceptance UI and frontend invitation links are absent; email currently contains a code.

## docs/entities/jobs/PLAN.md

- **STALE:** Queue ownership, ID-only processor, retry/backoff and Redis noeviction startup validation exist in [worker main](../../apps/worker/src/main.ts).
- **PENDING:** Redis persistence configuration, readiness/alerts, outage/replay procedures and real worker-crash/duplicate-delivery tests are absent.

## docs/entities/jobs/README.md

- **MODEL:** [Delivery job payload](../../packages/delivery/src/index.ts) contains only `outboxEventId`; job ID, attempts/backoff and retention are BullMQ metadata. The proposed fields are not one stored application DTO.
- **STALE:** [Dispatcher](../../apps/worker/src/outbox/dispatcher.ts) already sets five attempts, exponential retry and bounded completed/failed retention. Provider idempotency and real service recovery remain unresolved.

## docs/entities/join-tickets/PLAN.md

- **PENDING:** Issue/consume schemas, indexes, policy rechecks, capacity failure/restart recovery and replay/concurrent-consume tests are unimplemented. Follow the newer detailed admission plan when adding them.

## docs/entities/join-tickets/README.md

- **PENDING:** No join-ticket model, digest/TTL indexes, issue/consume service or socket admission exists.
- **MODEL:** The newer [admission plan](OFFICE_ADMISSION_IMPLEMENTATION.md) additionally requires `mapVersion` and `membershipGrantId`; this older proposed field list omits them.

## docs/entities/map-overrides/PLAN.md

- **PENDING / conditional:** Scope decision, revision validation and safe geometry rebuild are absent. Imported editor controls do not satisfy the plan and should be hidden in the MVP path unless explicitly activated.

## docs/entities/map-overrides/README.md

- **DIVERGENCE / conditional:** [App](../../apps/web/App.tsx) and [useOffice](../../apps/web/useOffice.ts) retain imported editor/override commands, while there is no revisioned, authorized NestJS override model. The MVP fixed-map path must not expose these unsupported controls.
- **PENDING / conditional:** No allowlisted, revisioned override schema/geometry validation exists; implementation remains conditional on D08.

## docs/entities/map-versions/PLAN.md

- **PENDING:** The target map schema/import, server/client geometry comparison and controlled version drain/reload are absent. Imported map initialization/unique-seat tests cover only the legacy helper boundary.

## docs/entities/map-versions/README.md

- **PENDING:** [packages/world](../../packages/world/src/index.ts) has no immutable manifest/schema, content hash, coordinate/version convention, collision/seat/zone definitions or upgrade behavior.
- **DIVERGENCE:** [main.tsx](../../apps/web/main.tsx) chooses mutable global map configuration before dynamic import; [legacy helpers](../../apps/shared/office-world.js) do not establish the target server/client version contract.

## docs/entities/media-grants/PLAN.md

- **PENDING:** Grant schemas, private token/guard fixture, SDK authorization adapter, replay/source restrictions and recovery-budget tests are absent.

## docs/entities/media-grants/README.md

- **PENDING:** No protected media-token endpoint, scoped generation identity or installed-permit acknowledgement exists in the API.
- **DIVERGENCE:** [useSfu](../../apps/web/useSfu.ts) obtains a legacy socket token and maps all video to Camera, rather than the proposed source-specific HTTP grant flow.

## docs/entities/media-permits/PLAN.md

- **PENDING:** Container-aware shutdown selection, two-/three-person fixture, fault injection, replay/bypass checks and forwarding measurements are all outstanding.

## docs/entities/media-permits/README.md

- **PENDING:** Guard-local permit fields, machine-auth pull/install/revoke interfaces, irreversible generation retirement and independent shutdown are not implemented.
- **EVIDENCE:** No measured eight-second cutoff result exists; [spikes/media-enforcement](../../spikes/media-enforcement/README.md) contains only a README.

## docs/entities/meeting-zones/PLAN.md

- **PENDING:** Serialized group admission, last-slot races, leave/revoke generation retirement and source-limited camera/share integration are absent. Imported controls do not establish server acceptance.

## docs/entities/meeting-zones/README.md

- **DIVERGENCE:** [Legacy meeting definitions](../../apps/shared/office-meetings.js) and client state exist, but the API has no zone admission/capacity policy or isolated generation membership.
- **PENDING:** Server-bound zone/office/workspace validation and explicit authorized join/leave events are absent.

## docs/entities/memberships/PLAN.md

- **STALE:** Permission matrix/guard, unique membership index, removal/leave/transfer and exact counters exist in [tenancy](../../apps/api/src/modules/tenancy/tenancy.service.ts), with cross-company and stale-owner tests.
- **PENDING:** Runtime revocation hints, bounded leases and activation-grant rotation remain missing.

## docs/entities/memberships/README.md

- **MODEL:** [MembershipRecord](../../apps/api/src/modules/tenancy/tenancy.models.ts) has status/version but no `revokedAt`; a reactivated membership reuses `_id`. A separate rotating activation grant is required by the newer ticket plan.
- **PENDING:** Removal currently denies future HTTP authorization; there is no office/conversation/media runtime to receive immediate revocation or expire its lease.

## docs/entities/offices/PLAN.md

- **STALE:** One-office-per-workspace persistence and transactional reference creation exist.
- **PENDING:** Map validation, runtime/epoch ownership, serialized dispatch, capacity/draining/restart handling, bootstrap and metrics remain undone.

## docs/entities/offices/README.md

- **MODEL:** [OfficeRecord](../../apps/api/src/modules/tenancy/tenancy.models.ts) stores `_id`, `workspaceId`, `mapVersion` and `createdAt`; proposed `spawn`, `configurationVersion` and `overrideRevision` are absent. Spawn can be manifest-derived; conditional overrides should not be added automatically.
- **PENDING:** Map is `pending-m0`; no office bootstrap, canonical runtime, epoch/state version, draining or capacity reservation exists.

## docs/entities/outbox/PLAN.md

- **STALE:** Transactional encrypted inserts, stable-ID dispatch, bounded retry, secret purge and failed-state updates exist in [API outbox](../../apps/api/src/modules/identity/delivery/outbox.service.ts) and [worker](../../apps/worker/src/main.ts).
- **PENDING:** Enqueue/acknowledgement crash tests against actual Redis/SMTP, key management and delivery observability remain open.

## docs/entities/outbox/README.md

- **MODEL:** [OutboxRecord](../../packages/delivery/src/outbox.ts) uses `_id`, `subjectId`, `kind`, `payload`, nested `keyVersion`, `cleanupAt` and `createdAt`. It has no `operationId`, direct `workspaceId`, `availableAt` or standalone `encryptionKeyVersion` field.
- **PENDING:** A future explicitly tenant-scoped outbox/status path must validate the invitation-to-workspace relationship; current delivery uses record IDs and does not expose a browser status endpoint. Key rotation/storage and real outage evidence are absent.

## docs/entities/participants/PLAN.md

- **PENDING:** Safe projections, movement sequencing/collision, prediction/reconciliation, authorization leases, takeover, deterministic cleanup and version-gap recovery are absent.

## docs/entities/participants/README.md

- **PENDING:** No authoritative participation ID/session binding, epoch, input sequence, seat/zone/conversation state or monotonic lease exists server-side.
- **DIVERGENCE:** [useOffice](../../apps/web/useOffice.ts) derives browser identity by name and consumes legacy state; it does not enforce server-intent motion and fresh-ticket reconnect.

## docs/entities/seats/PLAN.md

- **PENDING:** Versioned anchor/exit validation, authoritative sit/stand transitions, teardown release, accessible controls on the new office path and concurrency tests remain undone.

## docs/entities/seats/README.md

- **DIVERGENCE:** [Imported seat helpers](../../apps/shared/office-seats.js) expose client geometry, but no canonical server occupancy or stateVersion exists.
- **PENDING:** Reachability/distance validation, serialized sit/stand, blocked-exit behavior and lease/disconnect release are absent.

## docs/entities/sessions/PLAN.md

- **STALE:** Cookie/CSRF/bootstrap, indexes, current validation, expiry, rotation, session listing/revocation and explicit extension exist, with local tests.
- **PENDING:** Active-session UI and live office/media invalidation are not connected.

## docs/entities/sessions/README.md

- **MODEL:** [SessionRecord](../../apps/api/src/modules/identity/identity.models.ts) uses `_id`, `authVersion` and `csrfSecret`, adds `kind` for anonymous/authenticated sessions, and has no `lastActivityAt`. Idle extension explicitly changes `idleExpiresAt`.
- **PENDING:** Account session management/warning UI and socket/media invalidation are absent.

## docs/entities/users/PLAN.md

- **STALE:** Status/canonicalization, unique email index, safe account DTO and transactional version/ownership counters exist.
- **PENDING:** Realtime/media eligibility, allowlisted profile edits and a deletion/retention policy remain absent.

## docs/entities/users/README.md

- **MODEL:** [UserRecord](../../apps/api/src/modules/identity/identity.models.ts) uses `_id` and has no `updatedAt` or appearance subdocument.
- **PENDING:** Profile editing and shared HTTP/realtime/media eligibility integration are absent; current eligibility covers HTTP only. Display names already have a 2–80 character contract.

## docs/entities/workspaces/PLAN.md

- **STALE:** Create/list/detail contracts, slug uniqueness, transaction/counters/idempotency, owner transfer and security audit records exist.
- **PENDING:** D12/D13 closure, lifecycle controls, owner/member UI and runtime revocation remain open.

## docs/entities/workspaces/README.md

- **MODEL:** [WorkspaceRecord](../../apps/api/src/modules/tenancy/tenancy.models.ts) uses `_id`, lacks `updatedAt`, and supports active/suspended only. No archived/closed or hard-deletion lifecycle is implemented.
- **PENDING:** Current-company UI, owner settings/rename, suspension/resumption/offboarding and runtime/media revocation are missing.
