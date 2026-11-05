# Decision register

Status: source-derived decisions plus planning proposals · Updated: 2026-11-05

Agreed choices come from the supplied project brief. A recommended default is usable for planning but remains distinguishable from an owner decision. Record the date, rationale, consequences and affected docs when resolving an entry.

## Agreed direction

**B2B SaaS for companies and their teams**, confirmed by the owner on 2026-11-05. See the [product plan](../product/B2B_SAAS.md). Payments remain excluded from MVP.

React + TypeScript application UI; Phaser renderer rewrite; NestJS HTTP with Socket.IO realtime; MongoDB/Mongoose durable state; Redis and BullMQ; first-party opaque cookie sessions; self-hosted LiveKit integration; Caddy and Docker; no MVP billing. Reuse suitable Open Office For All frontend/assets after provenance review. Keep a single canonical office owner initially.

## Decisions to resolve

| ID | Question | Planning default / required evidence | Resolve by |
|---|---|---|---|
| D01 | Frontend toolchain | Scaffold selects React/Vite, pnpm 10.33.0, Node 24.18+, TypeScript 6.0.3 and exact library pins; browser support matrix and deployment image pins remain open | Scaffold selected; remaining M0 choices open |
| D02 | Proximity media topology | Recommend LiveKit for both proximity and groups; hybrid P2P adds signaling/lifecycle and revocation complexity | Before media spike / M0 |
| D03 | Bounded media revocation under Docker | Choose and prove independent guard/SFU shutdown supervision; eight-second target is provisional and unmeasured; normal container restart policies are insufficient evidence | M0 gate |
| D04 | Immutable map and asset pipeline | Adapt upstream metadata; choose units/versions/anchors; Tiled and atlases optional | M0 |
| D05 | Hosting and region | Validate same-origin ingress, private services, WebRTC UDP/public IP, TURN/TLS routing and recovery capability | M0 skeleton; finalize before pilot |
| D06 | Email and encryption secrets | Select provider, sending-domain setup, restricted key store and safe retry/expiry behavior | M0/M1 |
| D07 | Authentication and lease budgets | Source starting values; choose measured read freshness, hashing parameters, quotas, idle UX and bounded deadlines | Contracts in M0; tune before pilot |
| D08 | MVP decoration edits | Fixed map first; map overrides are a conditional model, not commitment to an editor | Before enabling overrides |
| D09 | Video, membership and workload budgets | Measure provisional 360p/15fps, source caps, six-person zone and 20-person office profile | M3–M5 |
| D10 | Import versus clean seed | Ask whether real upstream business data exists when migration is implemented; clean onboarding is default if none exists | M0 inventory |
| D11 | Independent security recovery evidence | Select restricted mirror outside app backups, acknowledgement failure policy and safe restored-access reconciliation | Design M0/M1; drill M5 |
| D12 | Customer organization/workspace hierarchy | Recommend one company per workspace/tenant with one office; decide whether a parent organization owning multiple workspaces is required before schema freeze | M0, before B003/B011 tenant contracts |
| D13 | Company onboarding and lifecycle | Choose self-service versus operator-assisted pilot; specify current-company switching, suspension and offboarding without adding commercial billing implicitly | M0/M1 before onboarding flow freeze |

## Boundaries for future changes

Horizontal office scaling requires ownership routing/fencing before multiple world owners. Payments, persistent messaging, calendars, recorder/AI features, map editor, SSO and E2EE remain deferred. If the M0 media spike cannot meet the retained privacy requirement, document the limitation and obtain an explicit architecture decision; do not silently weaken the guarantee.

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
