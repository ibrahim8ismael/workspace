# Decision register

Status: source-derived decisions plus planning proposals · Updated: 2026-11-08

Agreed choices come from the supplied project brief. A recommended default is usable for planning but remains distinguishable from an owner decision. Record the date, rationale, consequences and affected docs when resolving an entry.

## Agreed direction

**B2B SaaS for companies and their teams**, confirmed by the owner on 2026-11-05. See the [product plan](../product/B2B_SAAS.md). Payments remain excluded from MVP.

React + TypeScript application UI; Phaser renderer rewrite; NestJS HTTP with Socket.IO realtime; MongoDB/Mongoose durable state; Redis and BullMQ; first-party opaque cookie sessions; self-hosted LiveKit integration; Caddy and Docker; no MVP billing. The owner confirmed on 2026-11-10 that the supplied OpenOfficeForAll frontend, layout, styles and Vivo map are the product UI/world; replace legacy services with this project's APIs and Socket.IO. Preserve map/asset provenance and import notices. The current app uses Vivo; Commons support remains only for any office still bound to that immutable legacy version. See the [integration plan](../migration/OPENOFFICE_UI_INTEGRATION.md). Keep a single canonical office owner initially.

## CP01 accepted decisions (2026-11-08)

The owner explicitly chose **one company = one workspace = one office (D12)**, **verified-user self-service company creation (D13 onboarding)**, and **LiveKit for proximity and meetings (D02)**. See the [decision record](2026-11-08_CP01.md) for scope, consequences and remaining questions. The owner selected **English-first pilot UI** and **desktop Chrome/Edge validation**. The original CP02 Commons direction was superseded by the owner's 2026-11-10 direction to adopt the pinned OpenOfficeForAll Vivo map; CP02.6 implemented the coordinated runtime/renderer migration. Source attribution remains recorded, and browser collision/accessibility evidence remains open. D13 lifecycle, D03 deployment enforcement and browser evidence are not closed by these choices.

## Decisions to resolve

| ID | Question | Planning default / required evidence | Resolve by |
|---|---|---|---|
| D01 | Frontend toolchain | Scaffold selects React/Vite, pnpm 10.33.0, Node 24.18+, TypeScript 6.0.3 and exact library pins; desktop Chrome/Edge and English-first scope accepted; actual browser/OS version evidence and deployment image pins remain open | Scaffold selected; remaining M0 choices open |
| D03 | Bounded media revocation under Docker | Local CP07 proof uses authenticated guard policy, host watchdog/guardian and SFU-local expiry independent of Docker control. Final-profile active audio cutoffs 5035ms/5224ms; see [evidence and limits](../planning/MEDIA_ENFORCEMENT_EVIDENCE.md). Deployment privileges, additional transports and universal timing guarantees remain unaccepted | Local proof established; deployment before pilot |
| D04 | Immutable map and asset pipeline | Owner directed adoption of the pinned OpenOfficeForAll Vivo map on 2026-11-10, superseding the earlier CP02 Commons selection. Trusted manifest, API/runtime/renderer support and existing-office migration are implemented; keep source attribution/notices. Vivo collision, visual and accessibility checks remain open | CP02 integrated; review remains |
| D05 | Hosting and region | Validate same-origin ingress, private services, WebRTC UDP/public IP, TURN/TLS routing and recovery capability | M0 skeleton; finalize before pilot |
| D06 | Email and encryption secrets | API/worker inject a validated 32-byte base64 outbox key; encryption/expiry/retries exist. Provider/domain, restricted key store, rotation and actual delivery/fault evidence remain open | M0/M1 |
| D07 | Authentication and lease budgets | Current HTTP slice: Argon2id 19 MiB/two iterations/one lane, bounded concurrency, 12h absolute/60m idle sessions and 10m recent proof; Mongo budgets. Host benchmarks, deployed proxy/idle UX and live lease budgets remain open | Contracts in M0; tune before pilot |
| D08 | MVP decoration edits | Fixed map first; map overrides are a conditional model, not commitment to an editor | Before enabling overrides |
| D09 | Video, membership and workload budgets | Measure provisional 360p/15fps, source caps, six-person zone and 20-person office profile | M3–M5 |
| D10 | Import versus clean seed | Ask whether real upstream business data exists when migration is implemented; clean onboarding is default if none exists | M0 inventory |
| D11 | Independent security recovery evidence | Select restricted mirror outside app backups, acknowledgement failure policy and safe restored-access reconciliation | Design M0/M1; drill M5 |
| D13 | Remaining company lifecycle | Self-service creation is accepted. Specify current-company switching, suspension/resumption/closure authority, retention/export and offboarding without adding billing | Before lifecycle controls / CP09 |

## Implemented defaults versus owner decisions

CP00 documented existing defaults; CP01 records explicit approval of D12, D02 and D13 onboarding, and the owner later selected the OpenOfficeForAll Vivo map. [AUTH_AND_ROLES_API.md](../contracts/AUTH_AND_ROLES_API.md) still owns exact implemented auth/quota behavior. Map source compatibility and browser evidence remain open; D03/D05/D06/D07/D09/D11 require their stated design, access and measurement evidence.
See [completion plan](../planning/PROJECT_COMPLETION_PLAN.md) for decision dependencies and [progress](../planning/IMPLEMENTATION_PROGRESS.md) for completed documentation work.

## Boundaries for future changes

Horizontal office scaling requires ownership routing/fencing before multiple world owners. Payments, direct/nearby/meeting messaging, customer-managed channels, calendars, recorder/AI features, map editor, SSO and E2EE remain deferred; the fixed company-wide office text channel is included. If the M0 media spike cannot meet the retained privacy requirement, document the limitation and obtain an explicit architecture decision; do not silently weaken the guarantee.

## Decision record template

```text
ID / title:
Status: proposed | accepted | superseded
Date / decision maker:
Context and evidence:
Decision:
Alternatives and consequences:
Affected entity/contract/milestone/acceptance links:
Replaces / replaced by:
```
