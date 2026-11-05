# Initial implementation backlog

Status: all items unstarted · Updated: 2026-11-05

IDs are local planning references. No work has been assigned or scheduled outside these files.

| ID | Target | Concrete task and reviewable output | Depends on |
|---|---|---|---|
| B001 | M0 | Pin actual upstream commit; write path/asset/license inventory and blocked reuse list | None |
| B002 | M0 | Settle Vite planning default, package manager, supported browsers and maintained dependency/image pins | D01, source brief |
| B003 | M0 | Define runtime schemas, opaque IDs, errors, protocol/map version and event acknowledgement rules | B002 |
| B004 | M0 | Freeze immutable geometry/seat/zone format; select one cleared avatar/object sample | B001, B003 |
| B005 | M0 | Mount one Phaser scene in React and demonstrate pixel anchors/occlusion/cleanup | B004 |
| B006 | M0 | Specify host-only session, anonymous CSRF bootstrap, exact Origin and secret-redaction contract | B003 |
| B007 | M0 | Build Compose/Caddy/private Mongo replica-set and Redis skeleton; demonstrate transactions and same-origin routes | B002, B006 |
| B008 | M0 | Resolve all-LiveKit versus hybrid proximity and record tradeoff | D02 |
| B009 | M0 | Select independent Docker-compatible media supervisor with no unrestricted public/internal control surface | B007, B008, D03 |
| B010 | M0 | Run isolated media spike: stale/refreshed replay, removal, authority loss, freeze, failed deletion and bypass; record forwarding cutoff | B009 |
| B011 | M1 | Define Mongo schema/index migrations and conditional policy/counter transaction helpers | B003, B007 |
| B012 | M1 | Implement verification/login/logout/recovery/reauth, session rotation and race protections | B006, B011 |
| B013 | M1 | Select mail/key storage; implement encrypted outbox, dispatcher and ID-only jobs; demonstrate actual delivery | B011, D06 |
| B014 | M1 | Implement tenant creation, matching-recipient invitation and owner/member concurrency rules | B011, B012, B013 |
| B015 | M2 | Implement ticket consume → runtime reservation → ready/snapshot lifecycle | B003, B014 |
| B016 | M2 | Implement intent-driven movement, collision, seat serialization and snapshot gap repair | B004, B005, B015 |
| B017 | M2 | Implement continuing authorization, monotonic deadlines, fresh epochs and explicit takeover | B012, B015 |
| B018 | M3 | Implement proximity state machine and guarded current-generation voice grants | B010, B016, B017 |
| B019 | M4 | Add fixed group admission, camera/share sources, safe React controls and tenant UI polish | B018 |
| B020 | M5 | Run declared workload, weak-network/TURN and failure scenarios; tune provisional defaults with evidence | B019 |
| B021 | M1 design; M5 drill | Implement independent security evidence mirror and rehearse safe backup restore | B007, B011, D11 |
| B022 | M0 | Resolve B2B customer/tenant hierarchy (D12) and onboarding/lifecycle mode (D13); update tenant contracts before freezing schemas | Owner clarification; before B003/B011 tenant freeze |
| B023 | M1–M5 | Implement current-company context and independent memberships; specify offboarding; verify cross-company isolation, company quotas and shared media-node impact | B022, B014, B020 as applicable |

## First implementation entry point

Start B022 alongside B001–B004 and the B006 contract definition; resolve tenancy before freezing tenant contracts. Do not expand media features until B008–B010 resolve and prove the enforcement design. Do not import all upstream UI before mapping its feature scope and removing legacy secret/backend assumptions.

Every work item must name its implementer when started and link code/output and relevant acceptance evidence when completed. Entity plans contain the detailed tasks; use these IDs to connect delivery order without duplicating task status across separate trackers.
