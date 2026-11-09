# Initial implementation backlog

Status: imported client and initial backend implemented; office/media/production work pending · Updated: 2026-11-09

IDs remain stable planning references. The [completion plan](PROJECT_COMPLETION_PLAN.md) orders remaining cross-stack work; [implementation progress](IMPLEMENTATION_PROGRESS.md) records completed batches and pushes. Initial backend implementation evidence is in [AUTH_IMPLEMENTATION_EVIDENCE.md](AUTH_IMPLEMENTATION_EVIDENCE.md). Implementation/local verification and full release acceptance are separate.

| ID | Target | Concrete task and reviewable output | Depends on | Current status / remaining work |
|---|---|---|---|---|
| B001 | M0 | Pin actual upstream commit; write path/asset/license inventory and blocked reuse list | None | Imported pin/path/public-file inventory implemented; future derived assets still require review |
| B002 | M0 | Partial: Vite/pnpm/Node/TypeScript and exact library pins selected with buildable scaffold; browser matrix and deployment image pins remain open | D01; see SETUP_PROGRESS.md | Toolchain/pins/builds implemented; browser matrix and image pins pending |
| B003 | M0 | Define runtime schemas, opaque IDs, errors, protocol/map version and event acknowledgement rules | B002 | CP01 first HTTP/office/event/version/error/profile/conversation shapes implemented and tested; CP02 geometry/catalog verified; runtime enforcement remains pending |
| B004 | M0 | Freeze immutable geometry/seat/zone format; select one cleared avatar/object sample | B001, B003 | Owner replaced Vivo with original `commons` after CP02 source review; pure collision foundation implemented/tested. Shared map identity updated to `commons`. Original layout, seats, zones and geometry validation implemented in CP02.3. Catalog and immutable export checked in CP02.4. CP02.5 verified the catalog in the development renderer |
| B005 | M0 | Mount one Phaser scene in React and demonstrate pixel anchors/occlusion/cleanup | B004 | CP02.5 development sample implemented and verified in Headless Chrome. Full office bridge and pilot browser verification remain CP06 |
| B006 | M0 | Specify host-only session, anonymous CSRF bootstrap, exact Origin and secret-redaction contract | B003 | HTTP cookie/CSRF/Origin contract and CP04.1 loopback HTTPS cookie/browser checks verified; deployed ingress/proxy/redaction pending |
| B007 | M0 | Build Compose/Caddy/private Mongo replica-set and Redis skeleton; demonstrate transactions and same-origin routes | B002, B006 | CP04.3 complete locally: pinned Compose and explicit setup; actual transactions, same-origin HTTPS/mail and persistent queue/inbox recreation verified. External/provider and pilot acceptance remain later gates |
| B008 | M0 | Resolve all-LiveKit versus hybrid proximity and record tradeoff | D02 | Owner accepted all-LiveKit in CP01; pinned server/enforcement proof pending CP07 |
| B009 | M0 | Select independent Docker-compatible media supervisor with no unrestricted public/internal control surface | B007, B008, D03 | Pending D03 and private supervisor proof (CP07) |
| B010 | M0 | Run isolated media spike: stale/refreshed replay, removal, authority loss, freeze, failed deletion and bypass; record forwarding cutoff | B009 | Pending actual media fault/cutoff evidence (CP07) |
| B011 | M1 | Define Mongo schema/index migrations and conditional policy/counter transaction helpers | B003, B007 | Initial models/index provisioning/exact startup constraints and policy transactions implemented; data migration/rollback tooling pending |
| B012 | M1 | Implement verification/login/logout/recovery/reauth, session rotation and race protections | B006, B011 | Backend lifecycle plus CP04.1 browser registration/verification/login/recovery/logout verified; CP04.2b browser session settings/lifetime controls verified; production gates pending |
| B013 | M1 | Select mail/key storage; implement encrypted outbox, dispatcher and ID-only jobs; demonstrate actual delivery | B011, D06 | Encryption/dispatcher/ID jobs/SMTP adapter implemented; provider, keys and real queue fault evidence pending (CP04/CP10) |
| B014 | M1 | Implement tenant creation, matching-recipient invitation and owner/member concurrency rules | B011, B012, B013 | Backend tenant/invite/owner/member transactions and CP04.1 browser list/create/accept-invitation verified; CP04.2c browser current-company selection verified. Lifecycle and realtime integration pending |
| B015 | M2 | Implement ticket consume → runtime reservation → ready/snapshot lifecycle | B003, B014 | CP03 office discovery, map assignment, ticket issuance and atomic consumption implemented and locally verified. CP05.1 gateway/runtime reservation/ready snapshot is next |
| B016 | M2 | Implement intent-driven movement, collision, seat serialization and snapshot gap repair | B004, B005, B015 | Pure discrete collision foundation locally verified (CP02.1); authoritative runtime movement/seats/gap repair planned CP05.3–CP05.4 and client CP06 |
| B017 | M2 | Implement continuing authorization, monotonic deadlines, fresh epochs and explicit takeover | B012, B015 | CP01 epoch/version/lease/retry/takeover boundary documented; live authorization CP05.2 and takeover CP05.4 remain |
| B018 | M3 | Implement proximity state machine and guarded current-generation voice grants | B010, B016, B017 | Pending conversations/guarded voice (CP07/CP08) |
| B019 | M4 | Add fixed group admission, camera/share sources, safe React controls and tenant UI polish | B018 | Pending meeting/video/share/admin integration (CP09) |
| B020 | M5 | Run declared workload, weak-network/TURN and failure scenarios; tune provisional defaults with evidence | B019 | Pending measured workload/faults (CP11) |
| B021 | M1 design; M5 drill | Implement independent security evidence mirror and rehearse safe backup restore | B007, B011, D11 | Transactional app audit implemented; independent mirror/design/restore drill pending (CP04/CP10/CP11) |
| B022 | M0 | Resolve B2B customer/tenant hierarchy (D12) and onboarding/lifecycle mode (D13); update tenant contracts before freezing schemas | Owner clarification; before B003/B011 tenant freeze | D12 and D13 self-service onboarding accepted; Original Commons replaced Vivo in CP02; English-first and Chrome/Edge chosen. D13 lifecycle remains gated before CP09 |
| B023 | M1–M5 | Implement current-company context and independent memberships; specify offboarding; verify cross-company isolation, company quotas and shared media-node impact | B022, B014, B020 as applicable | Independent HTTP roles/counters and CP04.2c current-company isolation verified locally. Lifecycle, socket, media and noisy-neighbor evidence pending |

## First implementation entry point

CP00–CP03 are complete. Continue CP04 browser account/company integration and CP05 authoritative realtime admission. Preserve B012/B014 behavior rather than implementing it again. CP04.1 connects minimal account/company UI and removes known legacy auth/admin/invitation storage keys. CP04.2 completes session settings and current-company context. Continue with the private delivery environment in CP04.3. Do not expand product media before B008–B010 produce evidence.

The [system backend implementation plan](BACKEND_SYSTEM_IMPLEMENTATION.md) maps these items to HTTP, Socket.IO, LiveKit and private service interfaces. Its first M2 checkpoint uses the [office bootstrap and join-ticket plan](OFFICE_ADMISSION_IMPLEMENTATION.md) for the HTTP and ticket foundation of B015.

Every work item must name its implementer when started and link code/output and relevant acceptance evidence when completed. Entity plans contain the detailed tasks; use these IDs to connect delivery order without duplicating task status across separate trackers.
