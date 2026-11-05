# Delivery roadmap

Status: planned; dates and implementers unassigned · Updated: 2026-11-05

Milestones are dependency ordered. M0 produces evidence for risky assumptions before broad feature work. A milestone passes only with recorded results in the [acceptance register](ACCEPTANCE.md).

| Milestone | Deliverable | Main dependencies | Exit gate |
|---|---|---|---|
| M0: foundation proofs | Upstream provenance; chosen toolchain/media topology; contract drafts; same-origin Compose skeleton; one real Phaser avatar/object; guarded media spike | Decisions D01–D08 and D10–D11 as applicable | Measured pixel/anchor/occlusion sample, Mongo transactions, cookie/CSRF routing, and stale-token/failure media enforcement proof; no public debug issuer |
| M1: identity and workspace foundation | Verified account lifecycle, cookies, recovery, workspace/membership/invite rules, mail outbox/worker and minimal onboarding | M0 contracts, Mongo, mail/secrets choices | Auth races and tenant/owner/capacity checks; real email delivery; no localStorage session tokens |
| M2: two-user office | Fixed map/avatar, authoritative Socket.IO movement, seats, admission, presence and leases | M1 identities/membership plus M0 geometry/renderer | Two users move/collide/sit; replay/spoofing fails; reconnect/epoch/takeover works |
| M3: proximity voice | Opt-in deterministic pairs, versioned conversations, scoped LiveKit grants and enforcement | M2 runtime plus successful M0 media spike | Permission-denial and TURN tests; original/refreshed replay blocked; measured revocation cutoff and interruption behavior |
| M4: complete pilot features | Fixed group zones, camera/share, administration polish, reused UI adapters | M3 voice isolation | Six-person default zone cap, private-zone isolation, source limits and concurrent policy changes verified |
| M5: operational pilot | Declared 20-participant workload, weak-network behavior, alerts, worker recovery and restore drill | M1–M4 evidence | Pilot acceptance complete, named operational owners, demonstrated recovery; no unmeasured public capacity claims |

## B2B SaaS scope gate

Resolve D12 (one company per workspace versus organization hierarchy) and D13 (company onboarding/lifecycle) before tenant schemas and onboarding freeze. Company isolation, independent memberships and clear company context are MVP requirements. Company quotas and shared-service/noisy-neighbor behavior need M5 evidence. Payments and enterprise identity features remain deferred. See [B2B product plan](../product/B2B_SAAS.md).

## Suggested working slices

1. M0: pin upstream and clear one avatar/object → define pure geometry and bridge → demonstrate React/Phaser lifecycle.
2. M0: choose topology/supervision → isolate media fixture environment → measure replay, guard freeze and shutdown failure behavior.
3. M1: CSRF/session contract → pending registration + real mail → verification/login/logout → recovery concurrency.
4. M1: workspace creation → invitation acceptance → member removal and atomic owner transfer.
5. M2: one admitted avatar → two-user snapshots/deltas → authoritative collision/seats → fresh reconnect and leases.
6. M3: explicit opt-in pair → guarded audio → boundary retirement → permission/reconnect/TURN failures.
7. M4–M5: fixed meetings and explicit video/share → declared pilot profile → restore and operational handover.

## Provisional budgets

30 members/workspace; 3 owned workspaces/user; 20 simultaneous office participants; 6 meeting media participants; 30 movement inputs/sec; 4 KiB maximum application-event payload; 20 Hz simulation; up to 10 Hz broadcast. These are configurable starting values requiring measurement. Proposed media targets are at least 95% successful joins and two-second p95 join on a declared stable-network profile. Proposed recovery objectives are RPO one hour and RTO four hours. Keep source authorization/cutoff requirements explicit when tuning.

See [initial backlog](BACKLOG.md) for executable preparation tasks and each entity's `PLAN.md` for its work breakdown.
