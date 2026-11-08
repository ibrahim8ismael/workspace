# Initial implementation backlog

Status: imported client and initial backend implemented; office/media/production work pending · Updated: 2026-11-08

IDs remain stable planning references. The [completion plan](PROJECT_COMPLETION_PLAN.md) orders remaining cross-stack work; [implementation progress](IMPLEMENTATION_PROGRESS.md) records completed CP00 batches and pushes. Initial backend implementation evidence is in [AUTH_IMPLEMENTATION_EVIDENCE.md](AUTH_IMPLEMENTATION_EVIDENCE.md). Implementation/local verification and full release acceptance are separate.

| ID | Target | Concrete task and reviewable output | Depends on | Current status / remaining work |
|---|---|---|---|---|
| B001 | M0 | Pin actual upstream commit; write path/asset/license inventory and blocked reuse list | None | Imported pin/path/public-file inventory implemented; future derived assets still require review |
| B002 | M0 | Partial: Vite/pnpm/Node/TypeScript and exact library pins selected with buildable scaffold; browser matrix and deployment image pins remain open | D01; see SETUP_PROGRESS.md | Toolchain/pins/builds implemented; browser matrix and image pins pending |
| B003 | M0 | Define runtime schemas, opaque IDs, errors, protocol/map version and event acknowledgement rules | B002 | Auth/company schemas, UUID DTOs/errors implemented; office/realtime/version/response schemas pending (CP01) |
| B004 | M0 | Freeze immutable geometry/seat/zone format; select one cleared avatar/object sample | B001, B003 | Pending: approved immutable geometry/catalog (CP02) |
| B005 | M0 | Mount one Phaser scene in React and demonstrate pixel anchors/occlusion/cleanup | B004 | Pending: Phaser sample/bridge (CP02/CP06) |
| B006 | M0 | Specify host-only session, anonymous CSRF bootstrap, exact Origin and secret-redaction contract | B003 | HTTP cookie/CSRF/Origin contract implemented and locally verified; deployed browser/edge redaction pending (CP04) |
| B007 | M0 | Build Compose/Caddy/private Mongo replica-set and Redis skeleton; demonstrate transactions and same-origin routes | B002, B006 | Pending: same-origin/private service environment (CP04); temporary Mongo transactions already tested |
| B008 | M0 | Resolve all-LiveKit versus hybrid proximity and record tradeoff | D02 | Pending D02 (CP01/CP07) |
| B009 | M0 | Select independent Docker-compatible media supervisor with no unrestricted public/internal control surface | B007, B008, D03 | Pending D03 and private supervisor proof (CP07) |
| B010 | M0 | Run isolated media spike: stale/refreshed replay, removal, authority loss, freeze, failed deletion and bypass; record forwarding cutoff | B009 | Pending actual media fault/cutoff evidence (CP07) |
| B011 | M1 | Define Mongo schema/index migrations and conditional policy/counter transaction helpers | B003, B007 | Initial models/index provisioning/exact startup constraints and policy transactions implemented; data migration/rollback tooling pending |
| B012 | M1 | Implement verification/login/logout/recovery/reauth, session rotation and race protections | B006, B011 | Backend lifecycle implemented/local tests; browser and production gates pending (CP04) |
| B013 | M1 | Select mail/key storage; implement encrypted outbox, dispatcher and ID-only jobs; demonstrate actual delivery | B011, D06 | Encryption/dispatcher/ID jobs/SMTP adapter implemented; provider, keys and real queue fault evidence pending (CP04/CP10) |
| B014 | M1 | Implement tenant creation, matching-recipient invitation and owner/member concurrency rules | B011, B012, B013 | Backend tenant/invite/owner/member transactions implemented/local tests; browser/lifecycle/live integration pending |
| B015 | M2 | Implement ticket consume → runtime reservation → ready/snapshot lifecycle | B003, B014 | Pending: bootstrap/tickets/runtime admission (CP03/CP05) |
| B016 | M2 | Implement intent-driven movement, collision, seat serialization and snapshot gap repair | B004, B005, B015 | Pending authoritative world/client (CP02/CP05/CP06) |
| B017 | M2 | Implement continuing authorization, monotonic deadlines, fresh epochs and explicit takeover | B012, B015 | Pending live authorization/epochs/takeover (CP05) |
| B018 | M3 | Implement proximity state machine and guarded current-generation voice grants | B010, B016, B017 | Pending conversations/guarded voice (CP07/CP08) |
| B019 | M4 | Add fixed group admission, camera/share sources, safe React controls and tenant UI polish | B018 | Pending meeting/video/share/admin integration (CP09) |
| B020 | M5 | Run declared workload, weak-network/TURN and failure scenarios; tune provisional defaults with evidence | B019 | Pending measured workload/faults (CP11) |
| B021 | M1 design; M5 drill | Implement independent security evidence mirror and rehearse safe backup restore | B007, B011, D11 | Transactional app audit implemented; independent mirror/design/restore drill pending (CP04/CP10/CP11) |
| B022 | M0 | Resolve B2B customer/tenant hierarchy (D12) and onboarding/lifecycle mode (D13); update tenant contracts before freezing schemas | Owner clarification; before B003/B011 tenant freeze | Pending formal D12/D13 decisions (CP01); existing slice uses workspace-as-company without deciding future hierarchy |
| B023 | M1–M5 | Implement current-company context and independent memberships; specify offboarding; verify cross-company isolation, company quotas and shared media-node impact | B022, B014, B020 as applicable | Independent HTTP company roles/counters locally verified; current-company UI/lifecycle/socket/media/noisy-neighbor evidence pending (CP04–CP11) |

## First implementation entry point

CP00 reconciles the status above. Next, close the relevant B022 decisions and freeze remaining B003/B004 contracts, then deliver CP02/CP03 against the existing backend. Preserve B012/B014 behavior rather than implementing it again. Connect minimal company/auth UI and real delivery under CP04; the imported UI remains migration material until legacy secret/transport assumptions are removed. Do not expand product media before B008–B010 produce evidence.

The [system backend implementation plan](BACKEND_SYSTEM_IMPLEMENTATION.md) maps these items to HTTP, Socket.IO, LiveKit and private service interfaces. Its first M2 checkpoint uses the [office bootstrap and join-ticket plan](OFFICE_ADMISSION_IMPLEMENTATION.md) for the HTTP and ticket foundation of B015.

Every work item must name its implementer when started and link code/output and relevant acceptance evidence when completed. Entity plans contain the detailed tasks; use these IDs to connect delivery order without duplicating task status across separate trackers.
