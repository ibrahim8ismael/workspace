# Completion implementation progress

Updated: 2026-11-09. Implementer/reviewer: Codex, at the project owner's request; OpenCode / DeepSeek V4.1 Flash Free at `max` implemented CP02.1–CP02.4. Codex implemented CP02.5 with the owner’s approval. Completed packets: **CP00 — documentation reconciliation**, **CP01 — owner choices and first contracts**, **CP02 — immutable Commons map and renderer sample**, and **CP03 — scoped office admission** from the [completion plan](PROJECT_COMPLETION_PLAN.md).

The owner requested a push after each completed process. Each row below is a reviewable batch: update documentation, validate, commit, then push. Git history is the authoritative record of the actual commit/push; later batches can record earlier commit IDs without self-referencing a commit that does not exist yet.

| Batch | Scope | Status | Validation / evidence |
| --- | --- | --- | --- |
| CP00.0 | Save the existing EGM installation, drift snapshot and completion plan | Committed/pushed as `34b1841` | Prior full `pnpm check`: 32 backend + five shared tests, all builds. Plugin runtime/cache file equality and formatting/lint checked during installation |
| CP00.1 | Correct current overview, app/package and provenance status; preserve historical snapshots | Committed/pushed as `0e9a277` | Auth/tenancy/worker/audit source and asset manifests compared; historical evidence retained; local links/formatting checked |
| CP00.2 | Reconcile actual persistence fields, internal records and entity task status | Committed/pushed as `f86f79d` | Models/services/tests compared; actual fields/indexes and twelve entity specs/plans reconciled; no schema changes |
| CP00.3 | Reconcile backlog/roadmap/decisions, link intentionally pending findings and close CP00 | Complete in the closing CP00 commit | 91/91 report sections mapped in DRIFT_DISPOSITION.md; local link/table/fence, formatting and whitespace checks; no application/schema changes |

## Status vocabulary

- **Implemented:** source exists at the specified boundary.
- **Locally verified:** a named automated/local scenario passed on a recorded build.
- **Environment verified:** real browser/provider/infrastructure behavior has evidence for a stated environment.
- **Release accepted:** the relevant full gate in [ACCEPTANCE.md](ACCEPTANCE.md) has sufficient evidence and signoff.

These states are separate. Existing local auth/tenant tests do not close deployed browser, provider, office, media or recovery gates. The [drift report](2026-11-08_DRIFT_REPORT.md) is an immutable comparison of the input snapshot; fixes and intentionally deferred findings are tracked here rather than rewriting that snapshot.

## Scope boundaries

CP00 changes documentation and preserves existing code/contracts. It does not select a map, close D12/D13, implement office tickets, change password/session policy, start Docker, send mail or deploy. Follow-on work begins with CP01 decisions/contracts and the CP02/CP03 map/admission slices.

## CP00 closure and next packet

All four CP00 requirements are complete: current overview text corrected; actual models/internal records documented; B001–B014 and milestone status reconciled; existing plans cross-linked. [DRIFT_DISPOSITION.md](DRIFT_DISPOSITION.md) maps every original report section to a correction, historical boundary or intentionally pending completion packet. The input drift report and dated execution evidence were not rewritten.

CP00.1 hosted [CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42475964698), and CP00.2 hosted [CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42476201673). The baseline-only CP00.0 CI run was cancelled by the next main-branch push under the repository concurrency policy; that is not a passing result. The closing commit's actual push and CI result must be verified after the commit exists; no future hosted result is asserted here.

Documentation validation checks local file links, Markdown table column counts, code-fence balance, `pnpm format:check` and `git diff --check`. Existing full local `pnpm check` evidence includes 32 backend/five shared tests; application code has not changed in CP00. Full hosted CI runs on each main-branch push; a newer push can cancel an older run. Source implementation/provider/office/media/restore acceptance remains separate.

At CP00 closure, CP01 decisions remained open. CP01 has now started below; explicit later owner choices are recorded without changing that historical boundary.

## CP01 — decisions and first contracts (complete first boundary)

Implementer: Codex. Scope and freeze gates: [CP01_CONTRACTS_AND_DECISIONS.md](CP01_CONTRACTS_AND_DECISIONS.md).

| Batch | Scope | Status | Evidence / limits |
| --- | --- | --- | --- |
| CP01.0 | Record owner choices and affected documentation | Committed/pushed as `1dc5f62` | First three owner choices recorded; later Vivo/English/Chrome-Edge answers are recorded with CP01.1 |
| CP01.1 | Existing API runtime response/error contracts and compatibility/leak checks | Committed/pushed as `deff2e0` | Full pnpm check passed: five contracts tests, five shared tests and 33 backend tests; real HTTP safe projections/error/auth envelopes checked; all builds passed |
| CP01.2 | Office/event/version contracts, budgets, retries and ownership matrix | Committed/pushed as `a62c06b` | Full pnpm check passed: 18 contracts + 33 backend + five shared tests, formatting/lint/typechecks/builds. Scoped schemas, seat-ID compatibility and protocol rules documented; no office/media runtime |
| CP01.3 | Final checks, documentation and packet status | Complete in the closing CP01 commit | Six owner answers recorded; first contract checkpoint reconciled; 18 contracts + 33 backend + five shared tests passed locally; no runtime/release acceptance claimed |

CP00 closing commit `d5c14fd` was pushed and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42476452849).

## CP01 closure and remaining decisions

Accepted owner scope: one company/workspace/office; verified-user self-service company creation; all-LiveKit; Vivo as the initial map candidate; English-first UI; desktop Chrome/Edge validation. [Decision record](../decisions/2026-11-08_CP01.md) preserves what was chosen and what still needs evidence.

[OFFICE_V1.md](../contracts/OFFICE_V1.md) records the implemented first shared contract boundary and technical retry/ownership/budget choices. Full local `pnpm check` passed on the final source with 18 contracts, 33 backend and five shared tests. The decision checkpoint `1dc5f62` [passed hosted CI](https://github.com/ibrahim8ismael/workspace/actions/runs/42477076345); HTTP checkpoint `deff2e0` [passed hosted CI](https://github.com/ibrahim8ismael/workspace/actions/runs/42477551052). The office-v1 checkpoint `a62c06b` also [passed hosted CI](https://github.com/ibrahim8ismael/workspace/actions/runs/42478738071). The closing documentation commit is checked after it exists; no future success is asserted here.

Next packet: **CP02 — actual Vivo geometry/provenance/catalog/immutable export validation**. The imported map header's external-reference attribution must be reviewed alongside code and artwork notices. CP01 selected a candidate, not distribution clearance or an approved hash. Full lifecycle/offboarding (D13), hosting/provider/key access and independently effective media supervision (D03) remain at their documented later gates. No unanswered CP01 owner-scope question remains.

## CP02 — Commons map and renderer sample (complete)

The CP01 closing commit `8529ed7` was pushed and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42478994311). The paragraph above records the handoff before the CP02 source review.

The owner approved [an original multi-room `commons` map](../decisions/2026-11-08_CP02.md), replacing the Vivo candidate after its external-reference attribution was reviewed. Scope, inventory and batch order: [CP02_WORLD_AND_MAP.md](CP02_WORLD_AND_MAP.md). This replaces the candidate choice, without approving a map hash or the remaining assets.

| Batch | Scope | Status | Evidence / limits |
| --- | --- | --- | --- |
| CP02.1 | Pure discrete tile collision; delegated implementation, independent review and gate integration; record original-map decision | Complete in the CP02.1 commit | Independent full `pnpm check` passed: 18 contracts + 16 world + 33 backend + five shared tests; formatting/lint/typechecks/builds passed. Additional 4096 synthetic collision combinations passed; local links/fences/whitespace checked. No map data/art imported |
| CP02.2 | Replace the pre-admission map identity with `commons` | Complete in the CP02.2 commit | Independent full `pnpm check`: 19 contracts + 16 world + 33 backend + five shared tests. Regression coverage rejects old Vivo versions/manifests, invalid prefixes, hash/path mismatches and unready office versions. |
| CP02.3 | Original 24 × 16 Commons layout and shared typed geometry validation | Complete in the CP02.3 commit | Full local `pnpm check` passed: 19 contracts + 30 world + 33 backend + five shared tests. Two meeting rooms, one quiet room, four chairs and 12 ordered exits. Independent traversal reached all 376 walkable tiles. Map, object, seat and zone identifiers match the wire contract. |
| CP02.4 | Original art catalog and deterministic Commons export | Complete in the CP02.4 commit | Full local `pnpm check` passed with 92 tests. Five export tests passed again after the final review fix. Independent audit recomputed the full SHA-256 chain for the geometry, catalog and ten sprites and confirmed the ordered seat exits. |
| CP02.5 | React-mounted Phaser preview using the Commons export | Complete in the CP02.5 commit | Codex implemented at the owner’s request. Headless Chrome verified pixel anchors, filtering, occlusion, keyboard controls, cleanup and recovery from a missing SVG. Full local `pnpm check` passed with 92 tests. |

CP02.1 was pushed as `af80c80` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42481511982). CP02.2 was pushed as `f59e0eb` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42485419168). CP02.3 was pushed as `ec8a88a` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42486791749). CP02.4 was pushed as `9fb4559` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42490743107).

OpenCode ran the exact free catalog model with `max`, then handled a review delta in the same session. Both relay results reported `$0`. Codex reviewed implementation/tests, removed an assertion tied to internal storage representation, clarified whole-tile bounds and retained the upstream MIT notice. Root `pnpm check` now includes `pnpm test:world`.

The collision foundation rejects blocked/out-of-bounds origins as well as destinations, unlike the legacy helper's destination-only guard. It accepts one adjacent tile move, with both orthogonal paths required for diagonals; it does not implement continuous movement, collision sweeps, server timing or runtime authorization. Collision sets are exposed through readonly TypeScript interfaces, not a runtime-frozen map registry. The shared wire contract uses `commons`. The original floor plan and typed geometry validator are implemented in CP02.3. Codex supplied the layout and requested a review revision to consolidate validation and reachability into one pass. CP02.4 binds the original appearance catalog to the deterministic export. CP02.5 verified anchoring, occlusion and the React lifecycle in the development sample. Existing `pending-m0` offices remain unready.

The [renderer sample](CP02_WORLD_AND_MAP.md#cp025-renderer-sample) closes CP02. CP03 begins with scoped office discovery and bootstrap, then implements one-use join-ticket issuance and consumption.

## CP03 — scoped office admission (complete)

CP02.5 was pushed as `60a8c38` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42492725897). The [CP03 plan](OFFICE_ADMISSION_IMPLEMENTATION.md#delivery-batches) splits office discovery, map assignment, issuance and consumption into separately verified batches. The owner selected GPT-6 Luna for implementation. Codex scopes, reviews and verifies each batch before committing and pushing.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP03.1 | Workspace office discovery and authorized Commons bootstrap | Committed/pushed as `de4c273` | Luna implemented the API and test. Codex reviewed the transaction boundary and static registry. Full local `pnpm check` passed 93 tests, including 34 backend tests. Startup rejected separate geometry/catalog byte tampering in temporary copies |
| CP03.2 | Approved version for new offices and explicit pending-map backfill | Complete in the CP03.2 commit | Full local `pnpm check` passed 94 tests, including 35 backend tests. Dry-run/apply/repeat preserved IDs and configured versions. Actual Node CLI rejected malformed args and missing configuration |

CP03.1 used a configured office fixture. CP03.2 now assigns the approved version on creation and provides an explicit backfill for older pending records. Ticket issuance and consumption follow in CP03.3/CP03.4.

CP03.1 was pushed as `de4c273` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42495547022). CP03.2 was pushed as `84e4fac` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42495878964).

The CP03.2 backfill runs with `pnpm --filter @gather/api db:backfill-office-map` for a count-only dry-run. Add `--apply` to update pending records. It updates only `mapVersion: pending-m0`, preserves office/workspace IDs and configured versions, and can be repeated. Verification uses isolated Mongo test data.

CP03.3/CP03.4 add digest-only join tickets with capped lifetime, issuance budgets, activation grants and API office epochs. The internal consumer rechecks current policy and consumes once transactionally. Luna wrote the code and integration tests. Codex reviewed expiry across awaited work, Node ESM imports, policy races and the exact index requirements. The HTTP endpoint is implemented. Socket.IO admission and continuing authorization are CP05.

The final local evidence and remaining boundary are recorded in the [CP03 plan](OFFICE_ADMISSION_IMPLEMENTATION.md#cp03-implementation-evidence). Code review also corrected type-only Mongoose imports so the compiled API module loads through Node ESM.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP03.3/CP03.4 | One-use ticket issuance and atomic consumption | Complete in the closing CP03 commit | Final local `pnpm check` passed 102 tests, including 43 backend tests. Password reset, fresh epoch provider, legacy grant fallback, delayed expiry, concurrent consume/revoke and exact startup indexes were exercised |

CP03.3/CP03.4 was pushed as `b352177` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42528012842).

CP03 closed on 2026-11-09. CP04 browser/company integration and CP05 authoritative office runtime are in progress.

## CP05 — authoritative Socket.IO office

Codex split the existing CP05 contract into reviewable batches in the [CP05 implementation plan](CP05_REALTIME_IMPLEMENTATION.md): ticket admission and ready snapshot; continuing authorization/revocation; serialized movement/seats; versioned recovery/takeover. The owner selected Codex to implement CP05.1 locally after OpenCode DeepSeek reported its free quota exhausted.

### CP05.1 — Socket transport, ticket admission and ready snapshot

Codex added a Nest Socket.IO adapter and `/office` gateway with exact `APP_ORIGIN`, WebSocket-only transport, a 4 KiB Engine.IO message bound and no connection-state recovery. The namespace validates the strict handshake auth, consumes the existing ticket in Mongo, derives identity/scope from the stored ticket, serializes active participation and capacity reservations, uses trusted Commons spawn/default appearance, emits contract-validated snapshots/deltas and cleans up disconnects. Epoch replacement disconnects sockets from the old in-memory runtime before admitting the new epoch. The initial snapshot includes static seats as unoccupied; later CP05.3 owns seat transitions. No movement or continuing lease/revocation is implemented in this batch.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP05.1 | Engine.IO Origin/size gate, one-use ticket admission, runtime reservation and ready snapshot | Complete locally; production runtime incomplete | `pnpm --filter @gather/api test`: 57/57 passed at CP05.1, including real Socket.IO clients for valid/invalid Origin, oversized packet, malformed auth, replay, duplicate participation, epoch replacement, two-user snapshot, disconnect cleanup and capacity |

### CP05.2 — Authorization lease foundation

The API now sets a 5-second Socket.IO handshake timeout and allows up to 60 connection attempts per minute per direct TCP peer address, with bounded in-process limiter storage. It does not trust forwarded-IP headers. Before `office:ready`, the gateway rechecks the session, account, workspace, membership activation grant, office map and epoch against primary Mongo reads. Active sockets are checked each second; successful checks renew a maximum five-second lease measured from the policy request start. A revoked session or membership ends an idle socket and removes its public participation; uncertain policy ends access when the current lease expires. An independent expiry timer closes the socket even if the policy request is still pending; late replies cannot renew the lease.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP05.2a | Handshake/attempt budgets, periodic policy leases, idle logout and membership revocation | Complete locally; not a full CP05.2 exit | `pnpm --filter @gather/api test`: 59/59 passed at this batch; idle session-logout and membership-removal socket tests |
| CP05.2b | Verify idle socket revocation after committed session/account/workspace changes | Complete locally; not a full CP05.2 exit | API suite: 64/64 passed, including logout, reauthentication/session rotation, password change/reset, account suspension, workspace suspension and membership removal |
| CP05.2c | Expire authorization independently of delayed primary-policy responses | Complete locally | API suite: 65/65 passed at this batch; delayed authorization response cannot keep or revive the socket after the five-second lease |
| CP05.2d | Fail closed on policy-read errors; require a fresh ticket after reconnect | Complete locally | API suite: 67/67 passed; repeated primary-policy read errors expire access, reconnect has a new participation/snapshot, and epoch replacement invalidates old sockets |

The CP05.2 local exit covers one API process and uses polling to observe committed changes within the bounded lease interval; it does not connect mutation transactions to an immediate cross-process notification channel. The attempt limiter and runtime are process-local, so multi-instance deployment needs a shared policy/rate coordination design. A real Mongo outage drill remains an operations proof. Movement, seats and server snapshot recovery/takeover now have local coverage; browser socket integration remains CP06 work.

### CP05.3a — Authoritative movement intent

The `/office` gateway accepts strict directional intent only from an admitted socket and binds it to the ticket-derived participation, current epoch and monotonic input sequence. A 30-per-second per-socket attempt budget runs before parsing, with a separate 30 accepted intents-per-second runtime budget per participation. A process-local 20 Hz simulation normalizes diagonal input, advances by monotonic elapsed time at 192 px/sec (six 32-pixel tiles per second, matching the legacy UI's reference pace), expires held intent after 250 ms without a refresh and checks every tile/edge transition against validated Commons geometry. Changed participant states are versioned and broadcast in batches at no more than 10 Hz.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP05.3a | Strict input, sequencing/rate limit, bounded simulation, collision and two-client delta | Complete locally | Full API suite at the batch: 73 tests passed. Includes two-client movement/flood integration and runtime tests for sequence, input rate, server-time speed, diagonal normalization, map bounds and Commons wall collision |
| CP05.3b | Availability, serialized sit/stand, occupancy/release and scoped command budget | Complete locally for one API process; browser and shared-workspace budgets remain open | Full `pnpm --dir apps/api test`: 75/75 passed. Socket.IO integration verifies presence delta and command acknowledgements; runtime tests move two avatars, reject a seat occupied by a standing avatar, serialize the chair claim, reject the competing claim, select the first valid unoccupied exit and release the seat on stand/disconnect |

CP05.3b uses a 30-command-per-second per-socket rolling window for presence/seat commands. The runtime rejects sit while directional intent is still active, requires the chair tile or a reachable adjacent tile, snaps the avatar to the chair center, blocks other movement onto an occupied chair tile, avoids chair tiles for initial spawn and clears occupancy during participation cleanup. Stand chooses the first manifest-ordered valid exit not occupied by another participant. The runtime and limiters remain process-local; per-workspace/shared limits, duplicate-command outcome cache and real two-client seat competition through Socket.IO remain acceptance work. Browser client integration is CP06. Real Mongo-outage and tick/broadcast load evidence remain open.

### CP05.4a — Snapshot gap recovery

The gateway now accepts strict `world:resync` requests only from the admitted actor and current office epoch. It rejects a client version ahead of the authoritative state and returns a validated current snapshot to that socket. The request is subject to both the 30-command-per-second office cap and a separate three-resyncs-per-second socket cap. The browser-side delta-gap detection and recovery loop remains CP06.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP05.4a | Current snapshot recovery after a missed delta; future-version rejection; bounded resync | Complete locally for one API process | Full `pnpm --dir apps/api test`: 77/77 passed; includes runtime snapshot/version/actor checks and a live Socket.IO test for recovery after a missed availability delta, future-version rejection and 3/sec resync throttling |

### CP05.4b — Explicit same-session takeover

The HTTP flow has a separate bounded reference-issuance route and takeover-ticket route. A reference is random, stored by digest in a capped in-memory map, one-use, bound to the current user/session/membership grant/workspace/office/epoch/participation, and expires within 30 seconds or earlier with the authenticated session. The ordinary CP03 join-ticket request remains unchanged. The runtime swaps the exact participation atomically, releases its seat, emits one ordered removal/replacement delta, then the gateway sends `taken_over` and disconnects the old socket. An ordinary second ticket remains a conflict.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP05.4b | Reference issuance/consumption, separate takeover ticket, atomic participation replacement | Complete locally for one API process | Full `pnpm --dir apps/api test`: 79/79 passed; runtime checks one-use reference/session binding/atomic swap; live Socket.IO test verifies ordinary conflict does not evict, replay is rejected, takeover closes the old socket with `taken_over`, new snapshot excludes the old participation and another client sees the replacement delta |

Command replay/deduplication, per-workspace/shared rate budgets, multi-instance fencing, real Mongo outage drills, browser reconnect and measured load remain open.

## CP04 — browser accounts, companies and delivery (in progress)

The [CP04 delivery batches](CP04_BROWSER_AND_DELIVERY.md) separate browser onboarding, session settings, the private environment, real delivery and operational handoff. Luna implemented CP04.1/CP04.2. The owner selected OpenCode DeepSeek V4.1 Flash Free at max effort for CP04.3; Codex plans, reviews and independently verifies before each push.

CP04.1 replaces the default imported dashboard/office entry with the authenticated account/company flow. It preserves the development Commons preview and leaves the old office implementation as migration material. The new client uses strict shared DTOs, same-origin cookies, in-memory CSRF, explicit durable-command retries and account-transition guards.

CP04.1 is complete in its closing commit. Full local `pnpm check` passed 110 tests with formatting, lint, workspace typechecks and all builds. The actual HTTPS browser flow passed registration/verification/login, uncertain creation retry without duplication, cookie reload, invitation/member acceptance and password recovery. Additional error/storage/navigation checks passed. The review fixed a receiver-sensitive browser `fetch` invocation missed by Node mocks; regression coverage was added. See [environment details and boundaries](CP04_BROWSER_AND_DELIVERY.md#cp041-implementation-and-local-evidence). At the CP04.1 boundary, session management and real SMTP/queue/ingress/public deployment acceptance remained outstanding.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.1 | Authenticated browser accounts and company onboarding | Complete in the closing CP04.1 commit | Luna implementation; Codex review; 110 local tests and actual HTTPS/Chrome onboarding, durable retry, recovery and private-storage checks |

CP04.2 started on 2026-11-09 at the owner's request. The [three-batch execution plan](CP04_BROWSER_AND_DELIVERY.md#cp042-execution-plan) keeps the browser session adapters, security/lifetime UI and current-company context separately reviewable. Luna continues implementation; Codex continues planning/review/verification and incremental pushes. The previous CP04.1 commit was `f8963e5`; [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42530736572).

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.2a | Typed browser session/security and company-detail adapters | Complete in the CP04.2a commit | Luna implementation, Codex review; full local check passed 118 tests, formatting/lint/typechecks/builds. No session UI acceptance yet |


| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.2b | Session/security screen, explicit extension and expiry teardown | Complete in the CP04.2b commit | Luna implementation, Codex review; full check 121 tests, final web gates 19 tests and actual HTTPS/Chrome security, expiry, mutex and delayed-response flows |

CP04.2a was pushed as `7a5fe0a`; [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42532200998). CP04.2b adds account security and lifetime controls. Current-company context remains CP04.2c; no office/socket/media state is started by these screens.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.2c | Explicit company selection and isolated detail view | Complete in the CP04.2c commit | Luna implementation and Codex review. Full local check passed 121 tests. HTTPS/Chrome verified scoped detail, two-company switching, late/mismatched responses, membership removal and account teardown |

CP04.2b was pushed as `1545fc4` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42534537619). CP04.2 closes with the current-company view. CP04.3 is next for the private delivery environment.


### CP04.3a — private local configuration

OpenCode `opencode/deepseek-v4.1-flash-free#max` completed the infrastructure configuration on 2026-11-09. Codex reviewed the actual diff, checked the completed session/model metadata and independently verified the gates. Luna remained stopped after the owner changed the implementer. The [delivery evidence](CP04_BROWSER_AND_DELIVERY.md#cp043a--configuration-review-and-evidence) records configuration choices, the relay artifact limitation and the independently corrected settings-file claim.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.3a | Pinned local build/Compose, replica-set/index setup, persistent queue, explicit local mail worker and inbox | Configuration complete in this commit; runtime pending | Full local `pnpm check` passed 121 tests and all formatting/lint/typecheck/build gates. Official schema, private topology, key helper and Mongo initializer logic checks passed independently |

The [runbook](../../infra/README.md) gives the concrete startup sequence. CP04.3b requires actual runtime verification after the existing “Do not run Docker” setup restriction is resolved by the owner. No container was started, no certificate was installed and no external mail was sent. CP04.3 as a whole remains in progress.


### CP04.3b — local runtime verified

After the CP04.3a push (`b1cb776`, [CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42613839075)), the owner explicitly authorized Docker testing. Codex built and exercised the actual local environment. OpenCode DeepSeek V4.1 Flash Free at max effort corrected published-port access by adding a bridge for Caddy/Mailpit only. Codex independently verified the correction and the complete local flow.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.3b | Image builds, setup and private HTTPS/mail environment | Complete in this commit | Actual Mongo commit/abort; startup index rejection/setup; HTTPS/Origin/cookies; Chrome account/company/invitation/recovery through SMTP/Mailpit; persistent BullMQ job and inbox across full recreation; worker resume; disposable cache |

The [runtime evidence and limits](CP04_BROWSER_AND_DELIVERY.md#cp043b--runtime-evidence) record versions, topology correction and test-harness corrections. Project containers were stopped after verification; volumes and the ignored key remain. CP04.3 is complete locally. CP04.4 covers delivery faults and deferred staging provider setup. CP04.5 security/operations is in progress; CP04 overall remains open.


### CP04.4a1 — Mongo outbox fault coverage

OpenCode DeepSeek V4.1 Flash Free at max effort added focused cases to the actual Mongo integration suite; Codex reviewed the diff. Queue-add outage/recovery retains the same encrypted pending record and schedules one ID-only job even if dispatch replays. Provider failure retains the payload and increments attempts; success clears it and duplicate delivery is ignored. This is deterministic component-boundary fault injection, not yet a real Redis outage or SMTP acknowledgement drill. Existing expiry and transactional rollback cases remain part of the suite.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.4a1 | Mongo integration outbox queue/provider failure and retry | Complete in this commit | Focused 2 tests passed; entire API integration file passed 41 tests; final full workspace check and CI recorded below |

The next local batch CP04.4a2 exercises Redis/BullMQ outage, duplicates and expiry using Docker/Mailpit. CP04.4b covers ambiguous provider acknowledgement and key lifecycle. Staging SMTP setup remains subject to D06 owner choices.


### CP04.4a2 — actual Redis outage and recovery

With Docker authorized, Codex stopped only local queue Redis and registered a new fixture account through HTTPS. The actual Mongo outbox stayed pending, encrypted and at zero attempts during the outage. Restarting Redis and the worker delivered the message; Mongo recorded one attempt and delivered status. No external SMTP was configured. This runtime drill is recorded separately from the delegated deterministic tests. Dispatcher duplicate/replay is covered by deterministic integration tests; CP04.4a3 adds expiry cleanup before queueing.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.4a2 | Queue Redis unavailable during registration, then worker recovery | Complete | Actual local Compose Redis stop/start; pending encrypted outbox recovered to delivered with one attempt; no message contents exposed |


### CP04.4a3 — expiry cleanup before dispatch

OpenCode DeepSeek V4.1 Flash Free at max effort added a test for dispatcher expiration cleanup in the Mongo integration suite. Codex reviewed the test to ensure it only mutates its own fixture. The expired payload is cleared and its outbox ID is not queried or added to the queue. Existing tests cover expired-at-delivery and replay after successful delivery.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.4a3 | Expire outbox before queueing and clear encrypted payload | Complete in this commit | Focused Mongo integration case passed; target ID absent from both queue lookup and add |

Real provider acknowledgement and key lifecycle outcomes remain after the CP04.4b1 sender-boundary simulation. CP04.4c still needs owner-supplied D06 provider/domain/recipient choices before any external send.

### CP04.4b1 — ambiguous SMTP acknowledgement

OpenCode DeepSeek V4.1 Flash Free at max effort added a test simulating the sender accepting a message and then losing its acknowledgement. The retry may deliver the same one-use token again; the record transitions to delivered only after a successful acknowledgement and later worker replay does not send again. This demonstrates at-least-once semantics and does not claim exactly-once delivery. Existing cryptographic primitives test wrong-key/tampered-ciphertext rejection; real SMTP and key-loss/rotation drills remain future owner-configured work.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.4b1 | Mongo-backed lost-ack retry and duplicate possibility | Complete in this test commit | Focused integration test passed; it asserts identical token twice, retained encrypted payload after first failure, final payload cleanup and no later replay |

On 2026-11-09 the owner deferred CP04.4c external SMTP setup and asked to continue with CP04.5. This leaves real-provider delivery unaccepted and no external emails sent; see [the delivery decision](CP04_BROWSER_AND_DELIVERY.md#owner-direction--external-smtp-deferred). The local CP04.4 fault coverage remains separate from provider acceptance.

## Authenticated Commons map and chat preview — first CP06 test seam

The owner asked to connect the approved map and existing chat UI to the authenticated company flow so browser/unit tests can start. OpenCode DeepSeek V4.1 Flash Free at max effort wrote the initial UI slice and focused tests. Its free-model quota ended before the final language adjustment; with the owner's approval, Codex completed the small English-only chat option and added English/default-language regression assertions. Codex also moved the preview behind a lazy import after its first build pulled Phaser into the account entry bundle.

The company details screen now opens a local preview only while the server-validated detail matches the selected workspace. It renders the real Commons Phaser sample, adapts the existing chat view as empty/disconnected/non-sendable, labels the preview boundary, and returns to company details. Leaving the view destroys its Phaser game. The preview sends no join ticket and opens no Socket.IO, raw `/ws` or LiveKit connection. Its separate production chunk keeps the account entry at 362.96 kB (107.06 kB gzip); the preview chunk is 1,436.85 kB (380.59 kB gzip) because it contains Phaser and the current map/chat surface.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06 preview slice | Authenticated company-scoped Commons map and disconnected chat test seam | Locally verified, committed/pushed in `3a9456a` | 27 web tests, full `pnpm check`, production build and lazy-chunk review passed. The E2E follow-up below adds one browser journey |

The unit tests cover company-scope selection, view open/back/reset, explicit offline/empty chat, language isolation and Phaser cleanup. A Playwright test now runs sign-in → company → preview → back in headless Chromium and checks that the canvas is removed and no office WebSocket opens. It uses mocked API responses, so it verifies browser UI integration only; actual API authorization/session behavior is covered by separate existing checks. The local E2E passed with Playwright Chromium 158.0.8127.18. CI installs Chromium and runs `pnpm test:e2e`; Edge remains to be tested. Live two-user map/chat behavior remains CP05/CP06 work after authoritative Socket.IO exists; the preview is not a production office session.

## CP06 preview E2E — browser UI path

Codex authored a repeatable Playwright UI E2E after the owner explicitly selected Codex as the fallback implementer when DeepSeek's free quota was exhausted. It intercepts only the account/company API responses with schema-shaped test fixtures; the page itself runs in headless Chrome/Chromium, mounts the actual Commons Phaser renderer, toggles the local sit/stand control, enters the disconnected existing chat view, and returns to details. It asserts that the preview canvas is torn down and no `/ws` or Socket.IO office connection opens.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06 preview E2E | Browser journey through mocked sign-in, company scope, map/chat preview and return | Complete, committed/pushed in `bef6e44` | `pnpm test:e2e`: 1 Chromium test passed after the full `pnpm check`. Local setup: `pnpm exec playwright install chromium`; CI installs Chromium automatically. This does not test live API authorization, SMTP, Edge, or realtime presence |

## CP06.1 — Typed office client core

Codex added the browser-side typed HTTP and realtime foundation for live office entry. `ApiClient` now validates workspace/office IDs and response contracts for the office bootstrap and one-use join ticket. `OfficeClient` keeps the ticket in memory, opens only the `/office` WebSocket namespace, validates the ready payload and runtime events, applies deltas only when epoch/base-version match the accepted snapshot, and asks the server for a fresh snapshot after a gap. Teardown invalidates in-flight bootstrap work and disconnects the socket. It does not yet replace the disconnected company preview with a live office route.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.1 | Typed office bootstrap/ticket client, socket lifecycle and pure snapshot/delta reducer | Locally verified; not a release gate | Web TypeScript typecheck passed; focused world-state tests passed 3/3 for contiguous update, gap recovery and stale epoch rejection |

The existing `ChatView` has no message persistence or server event contract. The office roster and movement can be connected to CP05, while text sending remains explicitly disabled pending an agreed chat scope and backend implementation.

## CP06.2 — Authenticated live office entry and roster

Codex mounted `OfficeClient` in the company-scoped office screen. A person enters only after an explicit button press; successful admission displays the server-authoritative participant count and names. Leave and route teardown close the socket so the API releases the runtime participation. HTTP, socket errors, access-ended/takeover and disconnected states are visible. The Commons image remains a labeled static renderer sample, not a projection of live coordinates. The existing chat surface stays disabled and identifies the missing text-message service.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.2 | Authenticated office entry, live connection status/roster, explicit leave and teardown | Locally verified; real service integration remains | Web typecheck passed; `pnpm test:web`: 30/30; `pnpm test:e2e`: 1 Chromium test passed. E2E verifies that preview rendering does not admit a socket before the user chooses Enter. The browser test still mocks auth/company APIs and does not exercise a live API/socket or a second browser |

## CP06.3 — Live Commons rendering and keyboard movement

Codex extended the approved Commons catalog loader to expose all versioned avatar/object textures and added a live Phaser scene. Before drawing, it compares the authenticated bootstrap map version with the bundled manifest. The scene renders the complete fixed geometry, room zones, walls, furniture, chairs and the server snapshot's avatars/labels; the camera follows the local participation. Arrow keys and WASD send sequenced, epoch-bound movement intent at a bounded cadence through `OfficeClient`; accepted positions still come from authoritative server snapshots/deltas. Seat poses are derived only from the server `seatId`. Static preview remains before entry.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.3 | Version-checked full map render, live participant/seat projection and keyboard movement intent | Locally verified with mocked office transport | Web typecheck and build passed; web unit suite passed 31/31; Playwright Chromium E2E passed 1/1 through mocked bootstrap/ticket/Socket.IO ready, canvas rendering, live roster, movement event and leave |

The browser test uses a protocol-shaped mock socket and does not replace the API's actual Socket.IO integration tests. Real browser-to-API sessions, two-browser collision/seat tests, visual anchor/occlusion review, camera/zoom/accessibility checks and prediction/interpolation remain. The event validates and sends input; no client-side collision authority was added. Text chat still has no backend contract.

## CP06.4 — Availability and seat controls

Codex connected the map controls to `presence:update`, `seat:sit` and `seat:stand`. Each command uses a fresh event ID and current office epoch, validates the server acknowledgement and surfaces bounded failures. The UI uses the last server snapshot to show current availability, occupied seats and sitting state; it does not optimistically change presence/seat state before the server delta arrives. Available seat buttons are derived from the runtime seat list.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.4 | Server-acknowledged availability, sit and stand controls | Locally verified with mocked office transport | Web typecheck and 31 unit tests pass; Playwright Chromium E2E passes through availability update, seat claim/release, movement, and socket cleanup. Backend runtime/API suites separately cover command authorization and serialization |

The mocked browser transport does not prove two real clients competing for the same chair. Full Socket.IO seat-race, denial UX, reconnect resync and browser access-loss behavior remain acceptance work.

After CP06.4, the owner-authorized OrbStack `app` profile was rebuilt from the pushed source. Both API and Caddy containers returned healthy; HTTPS `/` and `/api/health/live` each returned HTTP 200. Existing MongoDB, Redis, Mailpit and worker containers remained running with their retained local volumes. This verifies the rebuilt local delivery stack only; no real account was created and no authenticated browser-to-API/socket session or two-browser test was performed in this runtime check.

## CP06.5 — Real two-browser office path

Codex added an opt-in live Playwright test, `pnpm test:e2e:live`, that uses the running local API, MongoDB, worker, Mailpit, Caddy and Chromium. It creates two uniquely prefixed verified accounts through the actual registration and Mailpit code flow, creates a workspace, invites and activates the second member, then opens two authenticated browser contexts. Both enter the same office through real HTTPS bootstrap/ticket requests and Socket.IO. The test verifies both receive the shared two-person state, the observer's rendered canvas changes when the other browser moves, an availability change reaches the observer's roster, and voluntarily leaving reduces the remaining participant count.

The first real connection attempt exposed a delivery gap: Caddy routed `/api` and static files but sent `/socket.io` to the SPA fallback. CP06.5 adds a same-origin Socket.IO reverse proxy and the real-browser test passes against it. Caddy and API were rebuilt on OrbStack after the change.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.5 | Two verified members, same-office live admission/state, visible remote movement, availability propagation and leave | Locally verified against actual OrbStack services | `pnpm test:e2e:live`: 1 Chromium test passed through real Caddy, API, MongoDB, Mailpit and Socket.IO. Standard mocked-browser tests remain separate |

The live test intentionally creates uniquely prefixed accounts/workspaces and Mailpit messages in the persistent local development stack. These records remain there; do not run this opt-in test against shared or production data. Real browser seat contention/collision, recovery after network gaps, Edge and deployment evidence remain open.

## CP06.6 — Live collision and seat contention

The real-browser run surfaced two client-state issues. First, each world delta replaced the snapshot's full seat list with only the delta's changed seats, so movement/presence deltas with no seat changes removed every Sit control. The typed reducer now merges changed seat occupancies into the current list and retains unchanged seats. Second, the Phaser input loop never sent a zero vector when keys were released, leaving motion active until the server's intent timeout; the browser now sends an immediate stop and the mocked Socket.IO E2E checks it.

The live E2E now follows the original Commons northwest room entrance, positions one browser beside the other at the same seat, and issues both sit actions concurrently. It verifies exactly one participant occupies the seat, both clients see that seat removed from the available controls, and both see it become available again after the winner stands. The winner then walks to the meeting-room wall and the test confirms the server-reported tile stays on the safe side while the blocked direction is held. The roster's data attributes mirror public participant position/seat state to let E2E assert the server-owned state without inferring coordinates from pixels. The map panel copy now describes it as a live server-validated map.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.6 | Preserve shared seat state through deltas, stop movement on key release, verify wall collision and race two browsers for one seat | Locally verified against OrbStack app services | `pnpm test:e2e:live`: 1 Chromium test passed through real Caddy/API/Socket.IO; `pnpm test:web`: 32 tests passed; `pnpm test:e2e`: 1 mocked browser test passed, live test skipped as intended; web typecheck, production build and ESLint passed |

The test adds persistent local accounts, workspaces and Mailpit messages; do not point it at shared or production data. At CP06.6, browser reconnect/version recovery, company isolation, route/renderer teardown, accessibility/visual review, shared command budgets and load remain. CP06.7 closes the office roster isolation and renderer route-lifecycle slices; browser recovery/accessibility and shared budgets/load remain for later acceptance.

## CP06.7 — Company isolation and Phaser route lifecycle

The live E2E now creates a second workspace for the owner. While the member is connected to the first workspace's office, the owner enters the second office. Each browser sees exactly one participant and its roster excludes the other company's user. This is a browser-office slice of isolation evidence; it does not close the broader HTTP/invitation/media/company-policy gate A11.

The test returns the second browser from the office to company details, verifies the live Phaser canvas has been removed, then reopens and reenters the office and verifies exactly one canvas is mounted. Both clients leave cleanly afterward.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.7 | Two-company office roster isolation and live scene route teardown/reopen | Locally verified against OrbStack app services | `pnpm test:e2e:live`: 1 Chromium test passed, including separate company offices, exclusive rosters and one canvas after remount. ESLint passed for the expanded live test |

These checks create additional local test workspaces and Mailpit messages that persist in the local development volumes. Do not run against shared or production data. CP06.7 closes company roster isolation and scene teardown/reopen; CP06.8 closes dropped-delta snapshot recovery. CP06.9 next verifies a fresh-ticket leave/re-entry and focused semantic control state. Abrupt transport-loss recovery and broader visual/accessibility review remain open.

## CP06.8 — Browser snapshot recovery after a dropped delta

The live test now proxies one browser's real Socket.IO frames while leaving the second browser and API untouched. After arming the proxy, it drops the owner's next `world:delta` when availability changes to Busy. The observer stays stale and has no Busy roster entry. The owner changes to Away; this next delta has a base version beyond the observer's current version. The browser detects the gap, sends `world:resync`, receives the API's full `world:snapshot`, and renders Away in the roster.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.8 | Prove browser-side version-gap detection and full-snapshot recovery over the actual Socket.IO path | Locally verified against OrbStack app services | `pnpm test:e2e:live`: 1 Chromium test passed with one server delta deliberately withheld; the test observed the subsequent resync request, full snapshot and recovered Away state |

This closes version-gap recovery for a dropped delta. Unexpected socket disconnect recovery and broader accessibility/visual signoff remain; next packet: CP06.9.

## CP06.9 — Fresh-ticket re-entry and semantic availability state

The live two-browser path now checks the user-facing, deliberate exit/re-entry path after the dropped-delta recovery. The member leaves, the owner observes the roster return to one participant, and the member re-enters; both browsers return to the shared two-person office state. This exercises new bootstrap and join-ticket issuance after a completed session rather than reusing the consumed ticket. The same test verifies the selected Away button exposes its selected state with `aria-pressed="true"`.

An abrupt transport interruption was also attempted through Playwright's WebSocket route. Playwright reports the browser-side socket close, but the local API runtime does not release the server participation through that routed-close simulation; a new ticket is then correctly rejected as a duplicate participation. This is not recorded as a product reconnect pass. A transport-level test that can prove server-side disconnect cleanup and user recovery remains open, along with visual anchor/occlusion and wider keyboard/accessibility review.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.9 | Verify deliberate leave, server-side participation release, fresh-ticket re-entry, and semantic availability state in the live two-browser office | Locally verified against OrbStack app services | `pnpm test:e2e:live`: 1 Chromium test passed; live test ESLint passed. It observed one-person roster after leave, successful re-entry to two participants, and Away `aria-pressed=true`. Abrupt transport-loss simulation did not prove server cleanup and is explicitly excluded |

The failed transport simulation was not retained in the passing test. Its failure is tracked as a remaining test/design gap rather than waived. Keep the test on the owner-authorized local stack only because accounts, workspaces and Mailpit messages persist in its development volumes.

A later extra rerun stopped at the initial anonymous CSRF bootstrap with HTTP 429 because repeated local E2E runs had exhausted the existing per-IP CSRF allowance (30 requests per 15-minute window). The earlier CP06.9 full live run passed. The limit and its Mongo rate-limit records were left intact; rerun after that window expires rather than weakening or clearing the guard.

## CP06.10a — Accessible office control groups and keyboard focus

The office connection controls and world controls now expose named `group` semantics. Availability and seat controls are individually labelled groups. Focus-visible styling is explicit for the office action buttons. The mocked-API Chromium browser test checks those accessible names, tabs from Available to Busy, confirms Busy receives visible focus, and verifies the selected availability state is announced with `aria-pressed`.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.10a | Add screen-reader names for office control groups and verify keyboard traversal/focus-visible styling | Locally verified in mocked-API Chromium E2E | `pnpm exec playwright test tests/e2e/company-office-preview.spec.ts`: 1 Chromium test passed; ESLint and Prettier passed for changed source/test files |

This is a focused essential-control check, not a full screen-reader audit or Chrome/Edge support signoff. Cross-layer recovery after abrupt transport loss and visual map anchor/occlusion review remain in CP06.10b.

## CP06.10b — Unexpected close state and fresh client ticket flow

The mocked-API browser flow now closes the first office WebSocket without using the Leave button. It verifies that the UI reports `Office connection closed.`, removes the live canvas, and allows the user to enter again. The second attempt is observed issuing a second office bootstrap and join ticket and opening a second WebSocket before rendering the connected office again. A separate API integration test exercises a real Socket.IO client disconnecting and verifies that the server broadcasts removal of that participation to the remaining office member.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP06.10b | Verify browser response and fresh bootstrap/ticket on unexpected socket close, alongside API-side participant removal | Locally verified in separate client and API integration tests | Mocked Chromium Playwright E2E: 1 test passed; focused API integration: 1 test passed / 65 skipped. Abrupt close through Playwright's proxy in the live stack still did not prove the combined browser-to-gateway cleanup path |

An exploratory 1280px Chromium capture showed the approved map, wall outlines, furniture/avatar, and disabled chat panel rendered together without overlap in the desktop office layout. This is a visual spot-check only; the actual anchor/occlusion review, Chrome and Edge comparison, and assistive-technology audit remain open for CP06.10c. The screenshot was kept in a temporary directory and is not a committed acceptance artifact.

## CP04.5a — security and operations boundary review

Codex reviewed the current HTTP configuration, password service, audit model, local proxy and existing evidence. The review found the local implementation controls and the outstanding deployment gaps; it made no runtime/security-policy changes. See the [CP04.5a findings](CP04_BROWSER_AND_DELIVERY.md#cp045a--security-and-operations-boundary-review).

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.5a | Source/evidence review of proxy, password workload, audit and delivery limits | Review complete; operational work remains | Strict Origin and local cookie tests exist; proxy trust is disabled; Argon2id concurrency is capped at four; audit is a transaction-local Mongo record with a 30-day TTL. Target-host benchmark, public ingress, independent audit mirror and real provider remain open |

The owner deferred staging SMTP, so CP04.5 and non-provider local work can continue without external sending. Do not mark the production acceptance rows passed on the strength of source review. Audit delivery still requires an independently durable destination and owner-approved retention/outage policy; target-host measurements wait for a deployment target.

### CP04.5b — audit mirror design

Codex reviewed the existing `AuditService`, entity contract and restore runbook, then wrote a target-independent [audit mirror design](CP04_AUDIT_MIRROR_DESIGN.md). It recommends a same-transaction mirror outbox, stable event IDs, at-least-once idempotent delivery, a separately administered immutable destination and suspended access during incomplete restore reconciliation. The proposal selects no provider, retention or outage policy.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.5b | Audit event projection, durable delivery/retry, outage and restore requirements | Design complete; owner choices gate delivery | Existing fields/actions and missing request ID/target type reconciled; options/trade-offs and acceptance cases documented. Destination, retention/immutability, maximum lag/failure policy and operational ownership remain unselected |

### CP04.5c — transactional audit mirror outbox

Codex implemented a version-1 allowlisted projection and SHA-256 digest in `audit_mirror_outbox`. Each row reuses the audit event ID and is inserted in the same Mongo transaction as the business mutation and `audit_events` row. Index provisioning includes the pending-work lookup index. Mongo integration coverage checks the projection and verifies the business mutation, audit row, and outbox row all roll back when mirror insertion fails. This is a local durable staging boundary only: there is no dispatcher, independent destination, acknowledgement, retention/cleanup policy, or restore reconciliation. Pending rows accumulate, so this is not production-ready or a completed independent mirror.

| Batch | Scope | Status | Evidence |
| --- | --- | --- | --- |
| CP04.5c | Same-transaction versioned audit projection and outbox | Local implementation complete; delivery/recovery open | Stable event ID, digest, index and rollback integration coverage added. No provider selected/configured; pending outbox has no consumer or cleanup policy |

After review of that concrete design, delivery still requires owner agreement on the independent storage boundary, retention/immutability, mirror-lag budget and affected actions during a prolonged outage. Target-host Argon2 and ingress measurements still wait for a real deployment target.

## CP06.10c — Live transport-loss recovery

The live two-browser test now discards all frames in both directions on one existing WebSocket, including Engine.IO heartbeat messages. After the real heartbeat deadlines expire, the member sees `Office connection closed.` and the owner sees the participant count fall to one. The member then enters with fresh bootstrap/ticket state and both browsers see two participants again. New WebSocket connections restore normal forwarding. The remaining movement, collision, seat contention, company isolation and renderer teardown checks also pass.

Validation: `pnpm test:e2e:live`: one Chromium test passed against the authorized local Docker stack (approximately 1.5 minutes); targeted ESLint, Prettier and whitespace checks passed. This closes the combined local browser-to-Caddy/API transport-loss scenario. Formal visual anchor/occlusion, screen-reader and Chrome/Edge acceptance, followed by CP07 media enforcement proof, remain open.

## CP06.10d — Focusable map and scoped movement

Accessibility review found that the live map was not keyboard-focusable while Phaser read global cursor/WASD state. The map now exposes a named focusable group with a visible focus outline. Pointer interaction focuses that group. Movement is sent only while focus remains within the map; losing focus stops active intent.

Validation: mocked Chromium Playwright E2E passed, including map focus, Tab traversal to Busy, movement on the map, release-to-stop, and no movement when an action button receives arrow keys. Web typecheck, targeted ESLint and whitespace checks passed. Formal screen-reader and installed Chrome/Edge review remain open; no browser matrix acceptance is claimed. CP07 is the next implementation dependency.

## CP07.1 — Experimental permit policy state

Implemented `spikes/media-enforcement/permit-state.mjs`: default denial, guard epoch/nonce/sequence checks, exact actor/room/source/version bindings, five-second request-start deadlines, atomic snapshots, empty-snapshot removal and irreversible explicit generation retirement during the process lifetime. The caller must supply monotonic time and authenticate strict policy DTOs. No production integration exists.

Validation: five Node tests passed covering binding substitution, delayed/expired responses, stale sequences/nonce/epoch, retirement replay and atomic invalid snapshots. This is algorithm evidence only. LiveKit pinning, authenticated signaling, independent supervisor, durable retirement/cold restart and measured forwarding cutoff remain CP07 requirements. Official token lifecycle documentation was checked; self-hosted removal alone does not invalidate existing tokens.

## CP07.2 — Experimental independent-supervisor policy (2026-11-10)

Added `spikes/media-enforcement/supervisor-state.mjs`: three-second cold-start/progress deadlines, exact outstanding nonce/version installation acknowledgements, guard epoch and increasing sequence checks, latched shutdown and retry after failed/unconfirmed fixed-target stop calls. Guard input cannot select the shutdown target. This is an injectable policy model; no running independent supervisor or Docker adapter is claimed.

Validation: nine Node tests passed across permit and supervisor state. Supervisor scenarios cover cold-start expiry, incorrect/replayed ACKs, late progress and failed/unconfirmed shutdown retries. Actual process independence, adapter timeouts, pinned SFU, signaling enforcement, retirement durability and measured forwarding cutoff remain open before CP08 integration.

## CP07.3 — Separate supervisor process with isolated LiveKit (2026-11-10)

Added `spikes/media-enforcement/supervisor-process.mjs`, a host-side process with a fixed full container ID, required fixture label, disabled-restart check, bounded Docker calls and independent stopped-state inspection. The guard-facing fixture pipe cannot choose commands or targets. The host operator retains Docker privilege, so this is an experimental adapter rather than the production privilege boundary.

Actual OrbStack experiment: official LiveKit v1.13.11 pinned to `sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20` ran in a network-none container without published ports. The separate supervisor received no installation progress and confirmed container stop at **3185.989ms**. The container was removed afterward. Syntax checks passed; permit/supervisor state tests remain the algorithm evidence.

No audio/video flowed in this fixture: this is confirmed SFU-container shutdown evidence, not a measured media cutoff. CP07 still requires real publisher/subscriber traffic, last-received media timestamps, guard freeze/control failure, replay/bypass and restart scenarios, plus the production supervisor isolation design. CP08 remains gated.

## CP07.4 — Real video cutoff and restart replay (2026-11-10)

Added runnable local `spikes/media-enforcement/media-cutoff.mjs`: pinned disposable LiveKit SFU, random fixture secret, loopback-only signaling/ICE-TCP, two real Chromium WebRTC clients, canvas video publication, decoded-frame measurement and independent supervisor shutdown. Resources are cleaned up after each experiment.

Two actual runs completed. Run one: 89 frames, last decoded video frame at 3498ms after the harness starts the supervisor. Run two: 85 frames, last frame at 3299ms; supervisor reported confirmed SFU stop at 3347.595ms on its own relative clock. After a two-second settling interval the receiver's frame counter remained unchanged over a further one second. This measures video display delivery, not audio or packet-level forwarding; the provisional full revocation budget is not accepted from these two samples.

The second run explicitly restarted the stopped SFU and retried the exact original receiver token: **accepted**. This is a failed cold-restart/replay gate, retained as evidence. The fixture bypasses signaling enforcement by design; durable generation retirement, authenticated guarded signaling, bypass isolation, guard-freeze/controller-loss/control-failure and refreshed-token tests remain. CP08 stays gated on CP07. Syntax/format/whitespace checks passed; the two local media experiments completed and removed their containers.

## CP07.5 — Durable generation retirement foundation (2026-11-10)

Added filesystem-backed deny-only generation tombstones and injected retirement storage into experimental permit state. Successful retirement fsyncs the file and directory. New guard epochs reject previously retired generations, and malformed persisted entries block store startup. The guard immediately denies a retirement in memory even if the durable write fails; callers must stop forwarding on persistence failure. Single-writer storage and protected persistent-volume/reconciliation requirements remain explicit.

Validation: twelve Node tests passed across permit, retirement and supervisor state, including guard restart with a new epoch and corrupt retirement data. This is not a passing LiveKit replay gate: direct signaling still bypasses this state. Authenticated signaling enforcement, bypass isolation, guard/controller freeze, control failures, refreshed-token and audio measurements remain necessary for full CP07 acceptance.

## CP07.6 — Initial signaling gate and discovered v1 compatibility failure (2026-11-10)

Implemented experimental fixed-upstream signaling proxy with exact path/Origin checks, one bounded token parameter and deadline-limited injected authorization. Local loopback tests verify denied unknown/admin/v1 paths, incorrect Origin, invalid/duplicate tokens and authorized validation forwarding. Thirteen tests pass across the spike modules.

A real integration attempt failed: pinned browser SDK 2.23.0 uses `/rtc/v1` with encoded join-request authentication, rather than the legacy query-token `/rtc` path supported by this initial gate. The unsupported path is deliberately denied. The experimental integration edits were removed from the successful unguarded cutoff baseline; no passing guarded media, JWT wiring, bypass isolation or restart-replay fix is claimed. CP07 remains incomplete. Next required work is bounded v1 join-request decoding/verification and complete signaling path inventory before rerunning media/fault/reconnect/audio scenarios.

## CP07.7 — Verified v1 signaling and measured audio/video cutoff (2026-11-10)

Corrected CP07.6's compatibility diagnosis by inspecting installed SDK source: v1 keeps `access_token` separate from encoded connection settings. The guard now allowlists bounded v1 join/validate paths. The real media harness wires SDK JWT verification plus exact room/identity and durable retirement checks. The same old receiver token is rejected after explicitly restarting both guard and SFU; a successful replay now fails the harness.

Actual guarded media result: 89 video frames and 249 active waveform samples; last decoded frame at **3460ms**, last active audio sample at **3793ms** after the harness initiates the supervisor. Supervisor confirmed container stop at 3397.127ms on its own clock. Counters remained stable after settling. The receiver must attach/play remote audio for Chromium's WebAudio measurement; two earlier attempts failed the activity precondition and are not cutoff results. Source: the reproducible `media-cutoff.mjs --run-local` fixture; random secrets and browser tokens are not printed or committed.

Direct host-loopback SFU signaling remains a bypass in this experiment. This result fixes the guarded original-token replay case only. Refreshed tokens, source permissions, independent running guard/controller failures, control-plane failures, real bypass isolation and production supervisor privilege separation remain required before CP07 acceptance. Thirteen state/loopback tests and the real guarded audio/video experiment passed.

## CP07.8 — Isolated signaling and real guard freeze (2026-11-10)

Added fixture `guard-process.mjs` and `--isolated` media mode: pinned restricted Node container runs the guard separately in the SFU network namespace. SFU signaling binds namespace loopback with no published port 7880; only guarded signaling and ICE/TCP are host-loopback published. The fixture checks Docker port configuration and denies direct host access to the unguarded signaling port. Guard source/dependencies/retirement mounts are read-only, root filesystem read-only, capabilities dropped and Docker socket absent.

Two real audio/video experiments passed. Isolated run: 87 decoded frames, 239 active waveform samples, last video 3356ms/audio 3725ms. Guard-freeze run pauses the guard container while media flows: 87 frames/248 samples, last video 3254ms/audio 3632ms; the independent host supervisor confirmed SFU stopped at 3298.051ms relative to its own start. Original-token replay after guard/SFU restart was rejected in both experiments. Resources were removed after each run.

Remaining: real authenticated policy/install-ACK progress wiring, SFU-refreshed token replay, strict source permissions, controller loss, Docker control and supervisor failures, TURN/alternate ingress and shared-node tenant-impact evidence. This fixture deliberately starts the supervisor without progress; it does not yet prove healthy progress followed by a stall. CP07 remains gated.

## CP07.9 — Progress then stall and real refreshed-token rejection (2026-11-10)

The media harness now supports `--progress-stall`: exact fixture installation ACKs keep the separate supervisor running for four seconds, while assertions confirm advancing real audio/video. ACKs then stop, generation retirement is persisted and the guard container can be paused. This is private-pipe fixture progress, not authenticated policy/guard wiring.

The isolated fixture also updates receiver metadata through LiveKit's private room API to induce token refresh. It captures a changed current SDK engine token and independently verifies signature/identity/room without printing or persisting the token. After guard/SFU restart, both original and refreshed-token attempts must fail.

Actual combined run `--run-local --isolated --progress-stall --freeze-guard` passed: 159 frames/425 active waveform samples; last video 2576ms and audio 2938ms after progress stops and pause completes. Supervisor stop reported 6764.645ms from its own earlier startup, including the healthy phase. Original and refreshed replay flags were both false. Cleanup removed both fixture containers. An earlier progress-stall run passed with last audio at 2952ms.

CP07 remains incomplete: controller-authenticated pulls and actual guard installation ACKs, controller loss, real shutdown-control/supervisor failure, source restrictions, shared-tenant effects and ingress/TURN audit remain open. No full eight-second production revocation guarantee is inferred from these local fixtures.

## CP07.10 — Authenticated policy-pull transport foundation (2026-11-10)

Added experimental `policy-pull.mjs`: HMAC-SHA256 machine request/response authentication, fresh 32-byte challenge nonce, exact signed DTO field checks, bounded one-second request and 64KiB/256-permit response, redirect denial and installation through request-start PermitState deadlines. Response integrity is verified before parsing. Remote transport requires authenticated TLS and protected independent policy keys.

Validation: seventeen spike tests passed. New policy scenarios cover signed successful installation, incorrect signature, substituted epoch/nonce, signed unknown fields, oversized responses and expiry after controller unavailability. These transport tests inject Response objects; they do not prove controller outage handling with real media. Runtime integration into guard installation and supervisor ACKs remains unfinished, and CP07 is not accepted. Next is a private controller fixture plus real guard installation progress feeding the supervisor before fault/cutoff tests.

## CP07.11 — Authenticated controller/install/ACK loop and real controller loss (2026-11-10)

Added a separate private synthetic policy authority (`policy-process.mjs`) and `--policy-loss` fixture mode. Guard pulls signed challenge-bound snapshots every 500ms, installs expiring permits, and emits actual installation ACKs only on success. The harness relays guard process log events into the independent supervisor pipe instead of generating fixture ACKs. Policy HTTP binds unexposed namespace loopback 7886; independent HMAC keys are random per run. This authority grants fixed fixture identities, not real application memberships.

Actual audio/video experiment passed after four seconds of healthy authenticated progress: policy container removed, generation retired, last video at **2877ms** and audio at **3238ms** after the fault operation completed. Received 168 frames/446 active waveform samples. Supervisor stop at 7086.772ms on its earlier startup clock. Original and SFU-refreshed replay flags were false after guard/SFU restart. Cleanup removed experiment resources.

Eighteen state/transport tests passed, including no installation ACK for an invalid signed reply. Production boot epochs, controller application-policy scoping, source-specific authorization, shutdown/supervisor control failures, shared-node effects and deployment privilege/key isolation remain open. Docker-log-to-stdin relay is experimental process plumbing and is not claimed as a production supervisor channel.

## CP07.12 — Supervisor-crash negative acceptance evidence (2026-11-10)

Added reproducible `--supervisor-crash` mode requiring the isolated authenticated policy-loss experiment. After healthy real media and policy/install progress, it removes the controller, persists retirement and SIGKILLs the host watchdog. It observes existing decoded video/audio for 8500ms and intentionally fails when forwarding continues. All test resources are cleaned up afterward; cleanup is not enforcement evidence.

Actual result: **failed cutoff**, 170 additional video frames and 426 active waveform samples over the 8500ms observation. The failure is joint controller loss plus supervisor crash. Controller loss with the supervisor alive passed CP07.11. Current admission checks do not revoke an already-forwarding transport when the only effective shutdown process dies.

Next engineering requirement: establish and measure a surviving independent shutdown path or SFU-enforced lease for this fault model. Docker-control failure, source restrictions and shared-tenant effects remain open too. CP07 and dependent CP08 acceptance remain open; no production cutoff guarantee is claimed.

## CP07.13 — Surviving watchdog-crash enforcement path (2026-11-10)

Implemented a separate fixed-target guardian process around the existing watchdog. It validates the full SFU container identity/fixture label/no-restart policy, forwards progress and independently confirms SFU shutdown when the child watchdog dies. The harness identifies and SIGKILLs the child specifically; the guardian survives and enforces shutdown. The CP07.12 failing experiment remains available without this new mode.

Actual `--run-local --isolated --policy-loss --supervisor-crash --guarded-supervisor` run passed: last decoded video **124ms**, last active waveform **455ms** after fault initiation; guardian stop confirmation **306.926ms** from child exit. Both original and refreshed-token restart attempts were rejected. Resources cleaned up. Both enforcement processes still share Docker infrastructure; control-channel, simultaneous-process and host failures remain distinct open limits. Source and tenant-isolation experiments follow separately.

## CP07.14 — Real SFU source permissions and foreign-room rejection (2026-11-10)

Added `--source-permissions`. A microphone-only signed token joins the real SFU; the test deliberately overwrites the SDK's local permission object to allow all sources. Camera and screen-share publication are rejected, while microphone publication with the identical token succeeds and the connection remains healthy. A signed token for another room is separately denied by the guard. This verifies source enforcement beyond the client permission check and a negative room-scope case.

Actual combined experiment passed all four assertions: cameraRejected, screenShareRejected, microphonePublished and foreignRoomRejected. Controller-loss plus child-watchdog SIGKILL also passed with the independent guardian: audio cutoff 467ms/video 133ms; original/refreshed restart replay false. Guardian stop confirmation 280.186ms after child death. Cleanup removed resources. The earlier guardian-only success was committed/pushed separately as CP07.13.

Remaining tenant gate: two concurrently authorized rooms/companies, absence of cross-room received tracks and measured impact of shared SFU shutdown. These source/scope checks do not close that broader requirement. Docker-control and simultaneous enforcement-process failures, production privilege/epoch lifecycle and screen-share-audio/post-join source updates remain open.
