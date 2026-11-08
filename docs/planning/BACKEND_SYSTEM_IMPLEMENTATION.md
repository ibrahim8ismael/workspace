# System backend implementation plan

This is the delivery plan for the Gather Lite B2B MVP backend, covering HTTP APIs, Socket.IO application events, WebRTC media and internal service interfaces. The [project brief](../../GATHER_LITE_PROJECT_KNOWLEDGE.md) governs the architecture. The earlier technology-stack document is historical where it specifies Next.js, Colyseus or systemd-only supervision. New contract shapes are proposals until reviewed. The [acceptance register](ACCEPTANCE.md) owns verification status.

The [cross-stack completion plan](PROJECT_COMPLETION_PLAN.md) expands the frontend, renderer, delivery and operational sequence. Its [implementation progress](IMPLEMENTATION_PROGRESS.md) tracks CP00 and incremental pushes. Existing backend stages and acceptance gates below remain applicable; documentation reconciliation does not implement a new service.

## Starting point

- NestJS already serves liveness, authentication, session and company owner/member APIs. MongoDB transaction tests cover the initial backend. The mail worker and encrypted outbox are implemented, with real SMTP, persistent queue recovery, deployed browser security and audit restore evidence pending. See [auth implementation evidence](AUTH_IMPLEMENTATION_EVIDENCE.md).
- Office rows exist with a `pending-m0` map version. The office, conversations and media modules are scaffolds. The imported client builds with the pinned dependencies and still uses upstream integration paths. See [repository layout](../architecture/REPOSITORY.md) and [client migration](../migration/WEB_IMPORT.md).
- The current backend treats one workspace as one company tenant with one office. Keep this as the working assumption while D12 is open. Every account may have independent memberships, and company ownership confers customer privileges only. D13 determines onboarding, suspension, resumption and offboarding. See [B2B product plan](../product/B2B_SAAS.md).

## Contracts and code ownership

| Boundary | Plan | Implementation ownership |
| --- | --- | --- |
| HTTP | [Route inventory and contracts](../contracts/HTTP.md) | `apps/api` identity, tenancy, office and media modules. Shared browser-safe schemas in `packages/contracts` |
| Office events | [Socket.IO protocol and runtime](../contracts/REALTIME.md) | `apps/api` office gateway/runtime and conversations. Pure geometry and simulation rules in `packages/world` |
| Voice, camera and screen | [LiveKit and WebRTC integration](../contracts/MEDIA.md) | `apps/api` media policy and SDK adapter. Independently supervised guard/SFU, first proven in `spikes/media-enforcement`. Browser SDK integration is a separate client stage |
| Delivery and security evidence | [Operations plan](../operations/README.md) | `apps/worker`, server-only `packages/delivery`, API audit and infrastructure. Stable outbox IDs in BullMQ; restricted recovery evidence outside app backups |
| Persistence | [Data model](../architecture/DATA_MODEL.md) | MongoDB for durable domain records, office runtime memory for live state, guard memory for expiring permits, dedicated persistent queue Redis and separate evictable cache where required |

The authorization chain runs from authenticated session to company membership, office join ticket, live participation lease, conversation generation, installed media permit and room-scoped JWT. Each step checks current authority at its own boundary. Durable changes and immediate revocation use the owning service and database policy. Worker jobs handle retryable delivery.

## Implementation order

| Stage | Deliverables in order | Acceptance before advancing |
| --- | --- | --- |
| 0. Contracts and risk proofs | Resolve D12/D13 at the affected tenant boundaries. Finalize Zod contracts, permission/error matrix and map/protocol versioning (B003/B004/B022). Select one cleared fixed map and prove the renderer separately. Choose the media topology and pin a compatible self-hosted server. Run the isolated guard and cutoff spike (B008–B010). | A06 for map/renderer evidence. The media proof is an early gate for M3 and can run independently of the office API work. Record actual A07 evidence before shipping media |
| 1. Identity, workspace and delivery | Preserve the current auth/company contracts. Close real SMTP and persistent queue tests, HTTPS/CSRF and provider/key setup. Define the restricted audit mirror and restore policy. Specify the owner settings and company lifecycle contracts after D13, including revocation across live paths (B006/B007/B011–B014/B021/B023). | A01–A03, relevant A09/A11 cases. Test per-tenant permissions and account/session failure paths with real MongoDB. Add deployed-origin and delivery evidence separately |
| 2a. Office bootstrap and tickets | Deliver [Office Bootstrap + Join Ticket](OFFICE_ADMISSION_IMPLEMENTATION.md). Add office discovery, validated map bootstrap, `pending-m0` backfill and atomic one-time ticket issuance/consume. | Two tenants and two roles, replay/expiry/races, map mismatch, removed and reinvited member, startup/index checks. This is partial A04 evidence |
| 2b. Authoritative office and sockets | Wire exact-Origin transport admission, runtime capacity, `office:ready`, reauthorization and explicit takeover (B015/B017). Add intent-driven movement, presence, seats and versioned recovery (B016). Implement allowlisted profile/appearance after selecting the asset catalog. | A04/A05 plus cross-company isolation from A11. Two real Socket.IO test clients move, collide, sit, resync and lose access on revocation. Renderer and client hookup have their own A06 checks |
| 3. Opt-in proximity audio | Implement deterministic pairing, one active conversation per participant, policy versions and generation rotation. Integrate the proven guard, scoped LiveKit grants, signed webhook reconciliation and media failure states (B018). | A07/A08 with two callers, original/refreshed token replay, late permits, forwarding cutoff, denied capture, TURN-only and weak-network trials |
| 4. Meetings and company administration | Add explicit admission to fixed private zones, serialized capacity and leave behavior, microphone/camera/screen source rules and safe admin APIs/UI as scoped (B019/B023). Complete the browser media and office integration in its own stage. | A08/A11 with three or more meeting users, final-slot races, zone separation, removed member versus authorized survivors, camera/screen permission and source-cap checks |
| 5. Operational pilot | Load-test the provisional 20-person office, concurrent tenants and shared-SFU failure. Exercise restart, draining, outage/queue replay and restricted restore with independent audit evidence (B020/B021/B023). | A09–A11, recorded weak-network results, alert/recovery owners and measured recovery/cutoff budgets. Close the remaining acceptance cases before pilot signoff |

## Decisions and delivery checkpoints

- D12/D13 govern tenant contracts and lifecycle. Define which actor can suspend or close a company, the state transition, retention, and how old sessions, tickets, leases and permits behave on resumption before exposing a lifecycle command.
- D02/D03 govern media. The working proposal is self-hosted LiveKit for both call types and a custom signaling guard with independent, container-aware SFU shutdown. Document the selected mechanism and measured cutoff. A failed spike requires a design or product decision before proceeding with product media.
- D04, D05, D06, D07, D09 and D11 govern map/version format, hosting/TURN, mail/key storage, lease budgets, workload/source limits and independent recovery evidence. Keep measured results and approved changes in the [decision register](../decisions/README.md).
- Each stage names an owner at kickoff and produces a reviewable contract change, code where applicable, and scenario evidence in the existing register. Start with `pnpm test:api` on real HTTP/MongoDB, then add real socket clients, pinned-SFU fault tests and a browser journey as their stages land. Run `pnpm check` before a verified implementation push. Schedule Docker and deployed-service tests as infrastructure work. This plan does not record execution of those tests.

The [entity catalog](../entities/README.md) classifies all 26 entities, including internal records and deferred features. Map overrides are conditional under D08. Persistent chat, channels, calendars, desk assignments, billing, recording, AI notes, custom maps, SSO and mobile stay outside this delivery sequence.
