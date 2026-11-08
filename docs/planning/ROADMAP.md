# Delivery roadmap

Status: partial M0/M1 implementation; full milestone acceptance pending · Updated: 2026-11-08

Milestones are dependency ordered. M0 produces evidence for risky assumptions before broad feature work. A milestone passes only with recorded results in the [acceptance register](ACCEPTANCE.md).

| Milestone | Deliverable | Main dependencies | Exit gate |
|---|---|---|---|
| M0: foundation proofs | Upstream provenance; chosen toolchain/media topology; contract drafts; same-origin Compose skeleton; one real Phaser avatar/object; guarded media spike | Decisions D01–D08 and D10–D11 as applicable | Measured pixel/anchor/occlusion sample, Mongo transactions, cookie/CSRF routing, and stale-token/failure media enforcement proof; no public debug issuer |
| M1: identity and workspace foundation | Verified account lifecycle, cookies, recovery, workspace/membership/invite rules, mail outbox/worker and minimal onboarding | M0 contracts, Mongo, mail/secrets choices | Auth races and tenant/owner/capacity checks; real email delivery; no localStorage session tokens |
| M2: two-user office | Fixed map/avatar, authoritative Socket.IO movement, seats, admission, presence and leases | M1 identities/membership plus M0 geometry/renderer | Two users move/collide/sit; replay/spoofing fails; reconnect/epoch/takeover works |
| M3: proximity voice | Opt-in deterministic pairs, versioned conversations, scoped LiveKit grants and enforcement | M2 runtime plus successful M0 media spike | Permission-denial and TURN tests; original/refreshed replay blocked; measured revocation cutoff and interruption behavior |
| M4: complete pilot features | Fixed group zones, camera/share, administration polish, reused UI adapters | M3 voice isolation | Six-person default zone cap, private-zone isolation, source limits and concurrent policy changes verified |
| M5: operational pilot | Declared 20-participant workload, weak-network behavior, alerts, worker recovery and restore drill | M1–M4 evidence | Pilot acceptance complete, named operational owners, demonstrated recovery; no unmeasured public capacity claims |

## Current delivery status

The [completion plan](PROJECT_COMPLETION_PLAN.md) provides the cross-stack packet sequence; [implementation progress](IMPLEMENTATION_PROGRESS.md) records implementer, checks and incremental pushes. M0/M1 are not passed as a whole.

| Milestone | Code/local evidence already available | Still open |
| --- | --- | --- |
| M0 | Pinned imported source/assets, exact toolchain/builds, local transaction/HTTP security checks and CP01 first wire schemas with 18 contract tests | Approved map contract/Phaser, deployed same-origin environment, media topology/supervision/cutoff proof |
| M1 | Backend accounts/sessions/company roles, invitations/transfer/counters, encrypted outbox/worker and safe app audit; 33 local backend tests plus strict response compatibility | Browser onboarding/current-company UI, real SMTP/Redis faults, wider password screening, keys/proxy/mirror/recovery evidence |
| M2 | Office reference persisted with pending-m0; libraries installed | Bootstrap/tickets, authoritative sockets/world/seats/leases/takeover and Phaser integration |
| M3–M5 | Plans/module boundaries only | Conversations/media/meetings, deployment and measured pilot/recovery |

CP00 documentation reconciliation and CP01 owner choices/first contracts are complete. Neither closes A01–A11. Remaining implementation starts with CP02 map/catalog validation and CP03 actual office admission, then follows the later packets.

## B2B SaaS scope gate

D12 one company/workspace/office and D13 verified-user self-service onboarding are accepted (2026-11-08). D13 lifecycle/retention/export remains open before those controls. [CP01 contracts](../contracts/OFFICE_V1.md) cover the first wire boundary; CP02/CP03 still need actual map data and backend admission. Company isolation, independent memberships and clear company context are MVP requirements. Company quotas and shared-service/noisy-neighbor behavior need M5 evidence. Payments and enterprise identity features remain deferred. See [B2B product plan](../product/B2B_SAAS.md).

## Suggested working slices

1. M0 remaining: use the existing pinned import to select an approved map/avatar/object → freeze pure geometry → demonstrate React/Phaser lifecycle.
2. M0: choose topology/supervision → isolate media fixture environment → measure replay, guard freeze and shutdown failure behavior.
3. M1 remaining: preserve the implemented account/session APIs and local race checks → connect browser forms → verify real mail and deployed HTTPS/CSRF.
4. M1 remaining: connect the implemented company/invitation/removal/transfer APIs to authorized UI → verify tenant switching, real delivery and agreed lifecycle.
5. M2: one admitted avatar → two-user snapshots/deltas → authoritative collision/seats → fresh reconnect and leases.
6. M3: explicit opt-in pair → guarded audio → boundary retirement → permission/reconnect/TURN failures.
7. M4–M5: fixed meetings and explicit video/share → declared pilot profile → restore and operational handover.

## Provisional budgets

30 members/workspace; 3 owned workspaces/user; 20 simultaneous office participants; 6 meeting media participants; 30 movement inputs/sec; 4 KiB maximum application-event payload; 20 Hz simulation; up to 10 Hz broadcast. These are configurable starting values requiring measurement. Proposed media targets are at least 95% successful joins and two-second p95 join on a declared stable-network profile. Proposed recovery objectives are RPO one hour and RTO four hours. Keep source authorization/cutoff requirements explicit when tuning.

See [initial backlog](BACKLOG.md) for executable preparation tasks and each entity's `PLAN.md` for its work breakdown.
