# Completion implementation progress

Updated: 2026-11-10. Implementer/reviewer: Codex, at the project owner's request; OpenCode / DeepSeek V4.1 Flash Free at `max` implemented CP02.1–CP02.4. Codex implemented CP02.5 with the owner’s approval. Completed packets: **CP00 — documentation reconciliation**, **CP01 — owner choices and first contracts**, **CP02 — original Commons map and renderer sample** (later superseded by the owner-directed Vivo adoption), and **CP03 — scoped office admission** from the [completion plan](PROJECT_COMPLETION_PLAN.md).

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

## CP06.10e — Local live UI, API and Socket.IO smoke (2026-11-10)

With the owner handling the local development-certificate warning in Zen, the Docker/Caddy app was opened at `https://localhost:8443`. The authenticated company view entered the office through the real API and Socket.IO path; the page showed one connected participant and the live Commons map. Keyboard movement changed the followed map view. Busy updated the participant roster, then availability was restored to Available. The text-chat panel correctly stayed disabled because text messaging is not implemented.

The first real two-browser E2E run passed admission, remote movement/presence, dropped-delta recovery, heartbeat-loss cleanup, fresh-ticket re-entry and seat contention before exposing two test-driver issues in the final wall check: the route crossed the table's seat tile, then keyboard focus remained on the seat button. The test now routes via a clear tile and refocuses the map. The corrected `pnpm test:e2e:live` passed its full Chromium scenario against the local Docker stack. The earlier API suite passed 79/79 tests. These checks prove the current local integration, not production/browser-matrix acceptance.

The running default screen is the new AuthApp/account shell; the original OpenOfficeForAll UI remains unreachable from the entry point. The owner has now confirmed the supplied interface and styles as the product UI. Its local identity, raw WebSocket, P2P and legacy map assumptions require replacement while its shell and reusable components are restored. See the [integration plan](../migration/OPENOFFICE_UI_INTEGRATION.md), [browser client status](../../apps/web/README.md), and [upstream import record](../migration/WEB_IMPORT.md). Zen manual review does not close the accepted Chrome/Edge, formal visual, or screen-reader gates.

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

## CP07.15 — Concurrent authorized room isolation and shared-SFU impact (2026-11-10)

Added `--company-isolation`: separate policy/guard mappings authorize four real Chromium participants across two fixture rooms. Exclusive receiver rosters and second-room subscribed track owners are asserted while both rooms actually receive media. This is media room isolation; application tenant identity/role integration is still separate.

Actual combined source/room/controller-loss/watchdog-crash run passed. First receiver sees only publisher; second sees/subscribes only publisher-b. Guardian stopping the shared SFU interrupts both rooms: second-room last video at 165ms after fault, 121 frames; first-room video/audio cutoff 129ms/512ms. Original and refreshed replay remain denied. This demonstrates confidentiality isolation and measures node-wide availability impact, not fault-independent company availability. Next: shutdown-control failure evidence and supported deployment failure boundary.

## CP07.16 — Failed primary stop command and independent fallback (2026-11-10)

Added fixed-target fixture stop denial to the child watchdog and escalation on stop-unconfirmed in the surviving guardian. The test modifies no Docker daemon state: only the first process's actuator is denied. The guardian uses its own actuator and confirms stopped state.

Actual combined two-company/source/controller-loss run passed: first stop unconfirmed, child terminated, guardian stop confirmed 467.149ms after child exit; audio cutoff 3346ms/video 2906ms, second-room video cutoff 2909ms after fault. Both original/refreshed replays remained denied and source permission checks passed. Shared Docker API/host/VM failures and simultaneous loss of both enforcement processes remain outside this successful process-level fault experiment and require a separate deployment fencing boundary to include in a hard guarantee.

## CP07.17 — Full signed publication-source subset checks (2026-11-10)

Source review found guard admission checked microphone alone despite broader signed JWT publication grants. Added `source-grants.mjs` requiring explicit nonempty unique publisher sources and checking every source against the installed permit; broad/unknown/screen-share-audio grants are denied. Test fixtures now issue minimal sources and explicitly label captured tracks as microphone/camera. Initial strict-source runs correctly rejected unlabeled synthetic publications; those labels were fixed before recording success.

Twenty regression tests passed. Full real two-room/source/controller-loss/primary-stop-denial experiment passed: audio cutoff 3137ms/video 2747ms, second-room video 2744ms; original/refreshed replay false. This closes the discovered source-subset gap at admission. Application source-grant issuance and post-join permission changes remain separate integration work; shared Docker/host failure remains an infrastructure limitation.

## CP07.18 — Fresh boot epoch through actual policy and supervisor wiring (2026-11-10)

Removed the fixed experimental guard epoch. Each guard boot now receives fresh random 32-byte state, and startup validates it. Authenticated policy responses echo the challenge epoch; guard installation ACKs and the independent supervisor bind the same value. Cold restart changes the epoch while reloading deny-only tombstones, without restoring persisted allows.

Full real regression passed with guardEpochChanged=true; original/refreshed replay false; audio/video cutoff 3096ms/2689ms and second-room video 2723ms under controller loss and denied primary actuator. Source/room checks remained successful. Shared Docker-control failure and production privilege topology remain open infrastructure requirements.

## CP07.19 — SFU-local lease survives loss of both host enforcement processes (2026-11-10)

Added `sfu-lease.sh` as the pinned SFU container's PID-1 wrapper. Authenticated policy installation atomically updates a read-only-mounted lease with SFU epoch and request-start shared Linux uptime deadline. Expiry kills the wrapper's own LiveKit child directly, independent of Docker API and host watchdog/guardian availability. Startup permits three seconds for new policy bootstrap; admission remains default-deny. A stale-file cold-start failure was fixed and rerun. Failed Docker container creation is now cleaned up by exact returned fixture ID, and errors redact command arguments containing ephemeral fixture secrets.

Actual full two-room/source/policy-loss run killed both guardian and watchdog. SFU exited through its local lease; no host process remained to send a Docker stop. Last decoded video 4672ms, active audio **5045ms**, second-room video 4710ms after fault initiation. Docker inspect confirmed stopped before cleanup; original/refreshed replay false and guard epoch changed. Twenty regression tests passed. A failed controller container from the initial restart attempt was explicitly removed.

Remaining limits: experiment uses a synthetic controller and local ICE/TCP; no assertion covers a frozen kernel/VM, malicious authorized lease writer, or production host fencing. Docker daemon was not terminated because the dev stack is shared; the successful fallback path performs no Docker control operation at the fault. Full deployment acceptance remains separate.

## OpenOfficeForAll UI migration — inventory and boundary (2026-11-10)

The owner confirmed that the supplied OpenOfficeForAll app, layout, reusable components and styles are the product UI. Repository audit confirmed the upstream files and MIT/provenance notices are present at pinned commit `23d6b8999396f9e9d51291bf85bd7b72161f833f`; `main.tsx` currently routes around them to the newer AuthApp. The supplied `App.tsx` combines UI with legacy login/token storage, slug-based workspace services, `/config`, raw WebSocket events and P2P media. Current `ApiClient`/`OfficeClient` already cover cookie sessions, company APIs, office bootstrap/tickets and Socket.IO. The integration map and ordered migration are documented in [OPENOFFICE_UI_INTEGRATION.md](../migration/OPENOFFICE_UI_INTEGRATION.md).

Stage 1 inventory is complete. Next is restoring the supplied shell and moving the supported account/company journey into its visual system, then adapting office state and admission to the existing client. Keep the Commons map, defer unavailable chat/calendar/edit/media operations, preserve upstream notices, and ship each completed code/documentation slice in its own pushed commit.

## OpenOfficeForAll UI migration — upstream account-entry styles (2026-11-10)

The authenticated account flow keeps the existing secure API logic for login, registration, verification, resend and password recovery, while its entry screen now uses OpenOfficeForAll's dashboard header, welcome modal, labels, primary buttons and links. The login, loading and retry states remain on the same app entry. This is the first visible migration slice; the company list/details, office shell/map placement and unsupported feature controls still use the newer integration UI.

Web TypeScript, focused ESLint, production build and `pnpm exec playwright test tests/e2e/company-office-preview.spec.ts` passed (one Chromium test). The next migration batch reuses the upstream workspace dashboard and dialog styles for the current company list/create/invitation APIs.

## OpenOfficeForAll UI migration — company directory (2026-11-10)

The authenticated company directory now uses the supplied dashboard layout, search, company-card grid and create/join dialogs. Company data still comes from the current workspace DTOs; create and invitation acceptance continue through `ApiClient`, with existing idempotency, retry, session-expiry and error handling retained. No upstream legacy workspace APIs, map thumbnails or browser storage were brought back. E2E navigation uses the new “Open office” action label.

Web TypeScript, focused ESLint, production build and `pnpm exec playwright test tests/e2e/company-office-preview.spec.ts` passed (one Chromium test). The production build retains the existing large lazy office-preview chunk warning. Next migrate the company details and account-security views into the upstream visual system, then continue with the supplied office shell and Commons renderer adapter.

## OpenOfficeForAll UI migration — company details (2026-11-10)

The company detail view now uses the OpenOfficeForAll dashboard header, spacing, dashboard buttons and card treatment. Company identity, membership and role continue to come from the current workspace-detail API. The display now names the backend field accurately as a company slug rather than implying a legacy `gather/` route. The Commons office preview remains embedded in the existing integration UI for the next shell migration.

Web TypeScript, focused ESLint, production build and `pnpm exec playwright test tests/e2e/company-office-preview.spec.ts` passed (one Chromium test). The existing large lazy office-preview chunk warning remains. Next migrate account security, then place the current office client and Commons renderer inside the supplied office shell.

## OpenOfficeForAll UI migration — account security (2026-11-10)

Account security now uses the dashboard header, card layout, fields and action buttons. Session refresh/extension, password verification/change, session revocation and sign-out-all still call the existing session/auth API paths. The sign-out-all action retains the upstream danger-button treatment. The shared session-lifetime notice now uses the dashboard secondary-button styles across the authenticated views.

Web TypeScript, focused ESLint, production build and `pnpm exec playwright test tests/e2e/company-office-preview.spec.ts` passed (one Chromium test); the flow now also opens account security, checks its sections, and returns to the company dashboard. The pre-existing large lazy office-preview chunk warning remains. Next adapt the office shell and embed the existing `OfficeClient` and Commons renderer, keeping unsupported media/chat actions visibly unavailable.

## OpenOfficeForAll UI migration — office shell and live Commons adapter (2026-11-10)

The company office now uses the supplied full-screen office structure: navigation rail, company sidebar, map area and bottom control bar. The versioned Commons renderer and `OfficeClient` remain the sources for map and live state, including movement, availability, seats and Socket.IO reconnect. The sidebar retains the account-session expiry controls. Chat is labeled unavailable; calendar and activity controls are disabled. No legacy office API or media path is mounted.

Web typecheck, focused ESLint, production build and `pnpm test:web` passed. The mocked UI E2E passed, including keyboard traversal and reconnect. After rebuilding the authorized local Docker stack to remove a stale frontend bundle, `pnpm test:e2e:live` passed with two real browser clients against the local API/Socket.IO stack, covering admission, movement, recovery, reconnect, seat contention and company isolation. This is not media/audio evidence. Next integrate owner invitation management into the supplied company UI; Chrome/Edge and screen-reader review remain open.

## OpenOfficeForAll UI migration — owner invitation management (2026-11-10)

Added strict browser API methods for listing, creating and revoking scoped company invitations. The company details screen displays the owner-only invitation panel using the supplied dashboard card, form, buttons and status styles. It lists safe recipient/status/expiry metadata, never invitation tokens, and retains idempotency keys for explicit uncertain-result retries. The existing join-code flow remains the member acceptance UI. The invitation API uses the transactional outbox; the local test stack delivered only to Mailpit, with no external email-provider acceptance claimed.

Web typecheck, ESLint, formatting, production build, 33 web tests and mocked Chromium E2E passed. The rebuilt local Docker stack then passed `pnpm test:e2e:live`: the owner created and revoked an invitation in the browser against the real authenticated API, followed by two-browser Socket.IO admission, movement/recovery, reconnect, seat contention and company isolation. Visual/accessibility review in Chrome and Edge and obsolete presentation cleanup remain before declaring the supplied UI migration complete.

## OpenOfficeForAll UI migration — Chromium visual and keyboard review (2026-11-10)

At 1280×720, the company invitation panel and full-screen Commons office were visually inspected in Playwright Chromium. The dashboard card/form hierarchy and office rail/sidebar/map/controlbar fit the supplied design; the session panel remains scrollable in the office sidebar. Added skip links for the account, company, security and office landmarks; keyboard focus moves to each target. The invitation form now has a named, spellcheck-disabled email input and associates/focuses its inline error. Revocation now requires a separate confirmation action. The shared styles respect reduced motion and the office shell accounts for safe-area insets.

The updated mocked Chromium E2E covers keyboard-only skip links and invitation confirmation. The rebuilt two-browser local Docker E2E passed with invitation create/confirm/revoke, member controls hidden, and the existing Socket.IO suite. Playwright currently has only bundled Chromium; no installed Chrome or Edge executable was found. Installing those browsers required an interactive sudo password, unavailable in this session. The in-app browser also could not open the local HTTPS site because its development certificate is untrusted. Chrome/Edge manual acceptance and obsolete presentation cleanup remain open; Chromium review does not claim cross-browser or screen-reader acceptance.

## OpenOfficeForAll UI migration — local app and live E2E recheck (2026-11-10)

Restarted the local Docker app stack; `https://localhost:8443/` returned HTTP 200 and the API, Caddy, Mailpit, MongoDB and Redis queue reported healthy (worker running). The current `pnpm test:e2e:live` passed against that stack: two browser clients completed office admission, movement, collision and seat contention through the current API and Socket.IO path. The first sandboxed browser launch was blocked by macOS MachPort permissions; the same test passed when run with the locally authorized browser process permissions. This confirms the local Chromium path only; Chrome/Edge acceptance and obsolete presentation cleanup remain open.

## OpenOfficeForAll UI migration — remove status and company panels (2026-11-10)

By owner request, removed the repeated SIGN-IN STATUS / Current session cards, expiry copy and Keep working controls from all screens. Company selection now loads authorized membership detail and opens the office shell directly; the intermediate company-details page and owner invitation panel are unmounted. Office Back returns to the company directory, and the office sidebar no longer displays the company slug. Owner invitation APIs and their unmounted component remain available; member invitation-code acceptance remains in the directory. These changes supersede the earlier main-journey panel requirements and UI evidence above.

Session expiry cleanup moved into a single invisible account-root hook so removing the cards does not remove sign-out and office teardown behavior. Dedicated account-security session listing/revocation and manual refresh remain in that settings screen. Removed obsolete view state, props and session-panel styles.

Web typecheck, focused ESLint/format checks, production build and all 32 current web tests passed. Mocked Chromium E2E passed direct office navigation, absence of the removed panels, clean return, Socket.IO controls and expiry-driven sign-out. The first live run exposed a test-interception timing dependency: direct navigation loads Socket.IO before the old late WebSocket interception. Registering the probe before navigation corrected that setup without weakening the dropped-delta/resync assertions. The rebuilt local Docker frontend then passed the full two-browser live E2E, including movement, dropped-delta recovery, reconnect, seat contention, company isolation and returning/re-entering through the company directory. Chrome/Edge-specific acceptance remains separate.

## OpenOfficeForAll migration — owner reselects supplied Vivo map (2026-11-10)

The owner directed using the same Vivo map and UI styles from OpenOfficeForAll, with this project's APIs. This supersedes the earlier D04 decision to replace Vivo with original Commons geometry. Source review confirms `apps/shared/maps/vivo.js` declares its geometry as measurements from Gather 2.0; this source note is preserved in the migration plan. The active client still mounts the Commons Phaser renderer and the API registry accepts Commons only.

Implementation order: establish the imported map's versioned server manifest and authoritative collision/seat geometry; add a safe office-map version backfill plan; connect the upstream `VivoScene` and office UI to `OfficeClient`; replace account/workspace legacy service calls with `ApiClient`; then verify map movement, collision, seats, reconnect and company isolation in two browsers. Preserve the imported MIT notices and make the Gather-derived geometry provenance explicit in release evidence.

## OpenOfficeForAll migration — derive server Vivo geometry (2026-11-10)

Added `VIVO_GEOMETRY` in `packages/world`, derived from the imported upstream map, wall collision, blocked-tile and seat sources. It validates as a 52 × 50 tile world (1664 × 1600 pixels), with 203 map objects, 58 seats and five meeting zones. Reverse-duplicate wall edges are canonicalized; map-boundary edges are enforced by world bounds. The package now declares the imported shared source as a workspace dependency; Docker's API image includes that runtime dependency. `pnpm --filter @gather/world test` passed all 31 tests, the API passed all 79 tests, its build passed, and `docker compose build api` completed successfully.

This is the first runtime data adapter only. The API's trusted map registry, workspace defaults/backfill, office runtime's `COMMONS_GEOMETRY` constants, ticket version schema, active frontend renderer and upstream screen components still need coordinated migration before the Vivo map or full UI appears in the app.

## CP07.20 — Late-policy cutoff and fail-closed cold bootstrap (2026-11-10)

Added authenticated delayed-policy fault (1500ms replies vs 1000ms guard abort). Room retirement is postponed until after cutoff to avoid masking lease-renewal errors. A startup timing failure led to stronger default-deny SFU bootstrap: no LiveKit child starts until a valid request-start lease newer than this boot exists. This replaces the prior three-second startup grace; stale pre-boot allow files cannot bootstrap media.

Actual full two-room/source/local-lease/both-host-enforcers-killed experiment passed under delayed replies: audio 5224ms/video 4845ms, second-room video 4826ms. The harness now fails explicitly above an 8000ms measured cutoff. Added real rejection probes for wrong identity/signature, expired JWT, unrestricted publisher and screen-share audio; all passed alongside microphone-positive and camera/screen-negative SFU checks. Original/refreshed replay false, new boot epoch true. CP07 evidence consolidation and final fault-profile review follow; no production rollout is implied.

## CP07.21 — Local proof consolidation, exact install versions and full checks (2026-11-10)

Consolidated the reproducible pinned local ICE/TCP profile in [MEDIA_ENFORCEMENT_EVIDENCE.md](MEDIA_ENFORCEMENT_EVIDENCE.md), including a committed transcription of the final real fault output, requirement matrix, earlier failed experiments and correction evidence. Final room deletion is asserted to fail specifically with 401/403 before independent cutoff, not an arbitrary connection error. Installation ACK versions now use the authenticated policy snapshot sequence rather than a local request counter; the final real fault scenario passed again after that correction.

Final combined actual run: room deletion rejected with 401 while media initially continued; controller removed, guard paused, both host enforcement processes killed; SFU-local expiry stopped active audio at **5035ms**, decoded video at **4702ms**, second-room video at **4692ms**. Admission/source/positive microphone checks passed, boot epoch changed, original and refreshed replay false. The delayed-policy run independently passed at **5224ms** active audio, without pre-retiring the room to mask lease errors.

Full repository `pnpm check` passed with **190 tests**: 19 contracts, 30 world, 20 media-spike, five export, five shared, 32 web and 79 API; formatting/lint/typechecks and all application builds passed. Media-spike regressions now run in the standard check command. Narrow Node/browser globals were added for actual runtime contexts, and existing empty catches/unused initialization were cleaned up. A pre-existing Markdown table formatting failure in infra/README.md was corrected. The production web build retains an existing large-chunk advisory; it is not a failed gate.

CP07's named local experiment exit is demonstrated, with measured case limits and retained failures. A07 production release acceptance remains open. CP08/CP09 must replace synthetic policy identities with real participation/session/company policy, and CP10 must validate deployment privileges, keys/TLS/volume protections and any added TURN/UDP/alternate ingress. A live kernel/wrapper and trusted authenticated policy writer remain explicit assumptions. Shared-node fail-closed shutdown interrupts both companies; this is a recorded operational limitation, not confidentiality leakage.


## CP02.6a — owner-directed Vivo server map and version registry (2026-11-10)

Added a reproducible Vivo manifest and immutable geometry export with version
`vivo-v1-0208da25a5cdc4cbb4036ae04a5bb8796962752a3d84de24961ebc15d8038e7b`. The server validates the
52 × 50 map, all terrain/wall/furniture blockers, 58 seats and five meeting areas against the imported
source. New workspaces select Vivo; old Commons map versions continue through bootstrap, admission,
runtime collision and seats. The `pending-m0` backfill now targets Vivo. This closes the backend map
version transition while retaining the upstream provenance and MIT notice.

Verification: contracts 19/19, world 31/31, API 80/80; `pnpm check:vivo`, API build and image build
passed. API integration coverage includes new Vivo offices and a legacy Commons bootstrap. The next
step mounts upstream `VivoScene` in the current office route and wires its movement/seat/status
actions to `OfficeClient`; two-browser Vivo collision and isolation acceptance remain. Pushed as
`64cb536` (`feat(world): register owner-directed Vivo map`).

## CP02.6b — Vivo map and controls in the authenticated office (2026-11-10)

Mounted the supplied OpenOfficeForAll `VivoScene` in the authenticated company office screen. It
renders the imported base map and seats, adapts server snapshots to the upstream participant shape,
and sends movement intents, availability and seat actions through this repository's `OfficeClient`.
The office preloads its authenticated bootstrap and selects the renderer by immutable map version:
new Vivo offices use VivoScene; previously stored Commons offices keep the compatible Commons
renderer and seat controls. The app remains on its secure `AuthApp` entry point; the legacy upstream
`App.tsx` services and bearer-token flow stay unmounted. Unsupported chat, calendar, editor and media
actions remain unavailable.

Verification: formatter, ESLint, typecheck, and the targeted Playwright run passed. The browser test
covers sign-in, direct company entry, Vivo scene mounting, movement intent, sit/stand, availability,
disconnect/re-entry, keyboard focus and ensuring controls do not trigger movement. It uses mocked
HTTP and Socket.IO. Visual anchor/occlusion review, screen-reader review, and Chrome/Edge signoff
also remain. This batch is committed and pushed separately.

## CP02.6c — live Docker verification of the Vivo office UI (2026-11-10)

Rebuilt and restarted the local API and Caddy images from the pushed Vivo implementation. The app
remains available at `https://localhost:8443`; both the web root and `/api/health/live` returned
HTTP 200. Updated the live two-browser scenario to use VivoScene and Vivo seats instead of Commons
canvas selectors.

`LIVE_OFFICE_E2E=1 pnpm test:e2e:live` passed against local Docker and Mailpit. The test registers
two verified accounts, creates an owner workspace and invitation, opens its newly created Vivo
office in two browser contexts, and verifies server-observed movement, presence changes, seat
sit/stand synchronization, dropped-delta snapshot recovery, silent WebSocket interruption and fresh
re-entry, then confirms a second company stays isolated. Formatter and ESLint passed.

This does not yet verify Vivo wall collision or simultaneous seat contention in the browser. The
Commons map still has earlier collision/seat-race browser evidence; that evidence does not transfer
to Vivo. Formal visual anchor/occlusion, screen-reader and Chrome/Edge acceptance remain open. The
legacy monolithic upstream `App.tsx` is still unmounted; the current authenticated shell retains the
supplied OpenOfficeForAll styles and Vivo map with this project's APIs and Socket.IO.

## CP02.6d — OpenOfficeForAll-style pre-join lobby (2026-11-10)

Replaced the disconnected read-only map preview with the owner-provided pre-join layout: workspace
and signed-in account header, camera-off preview, authenticated display name, disabled media controls
and a Join action. No office map or map bootstrap is loaded before Join. Joining requests the current
workspace-scoped bootstrap and one-use ticket, then enters through the existing Socket.IO client;
the map renderer appears only after a valid `office:ready` event. Leave, disconnect and re-entry
return through the lobby. The company header also remains the keyboard-accessible Back action.

The name is read-only because the existing ticket API takes its display identity from the authenticated
account; media controls remain disabled until the product media flow is connected. After admission,
map selection still follows the server's immutable office version, so a pre-existing Commons office
continues to render Commons and newly created offices use Vivo.

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test:web` (32 tests), and the mocked Chromium
office E2E passed. The local Caddy frontend was rebuilt and restarted in OrbStack; `/api/health/live`
returned 200. `pnpm test:e2e:live` then passed against the real local API and Socket.IO, including
two-browser movement, seat/status synchronization, snapshot recovery, reconnect and company
isolation. Browser launch required the previously authorized local Chromium process permission.

## CP02.6e — migrate existing offices from Commons to Vivo (2026-11-10)

The owner confirmed that existing offices must use the selected Vivo map too. Added
`db:migrate-legacy-office-maps-to-vivo`, a repeatable dry-run/apply migration that matches only the
exact trusted Commons manifest version, changes it to the approved Vivo version, and preserves
office/workspace IDs. Unknown/custom versions and `pending-m0` records are not changed. Its API
integration test verifies no-op dry-run, exact-version filtering, preserved IDs, and idempotent
re-application.

Before applying in an environment, back up MongoDB and stop the API so active office sessions close.
Local execution completed: the dry-run found 58 candidates; apply updated all 58, preserving office
and workspace IDs. After the API restart, a direct Mongo check confirmed that `testbany` (office
`31e62fd4-4773-4829-865d-bb82cf3c1d6f`) uses Vivo and that all 72 local offices now use the Vivo
manifest version. The rebuilt Caddy app and API health checks passed. The latest live two-browser run
rendered `Live Vivo office`, confirmed a Vivo SVG map and authoritative movement, then timed out
waiting for a seat claim at `tests/e2e/live-office.spec.ts:276`; the full live scenario is not green
until that separate seat interaction is fixed and rerun. Other environments still need their own
backup, dry-run review, explicit apply, API restart and fresh client bootstrap.

## Frontend data audit cleanup (2026-11-10)

The owner requested removal of demo values and correction of frontend defaults. Findings and the remaining backend/API boundaries are tracked in [FRONTEND_DATA_AUDIT.md](FRONTEND_DATA_AUDIT.md).

| Batch | Scope | Status | Evidence / limits |
| --- | --- | --- | --- |
| UI-DATA.1 | Remove the mounted fake chat channel, empty demo messages/users and disabled composer; preserve only the live roster and explicit unavailable state | Pushed as `6b4a6c9` | `git diff --check` passed. Text messaging remains deferred because there is no server API/event or approved retention/authorization contract. |
| UI-DATA.2 | Centralize the active product brand; remove the stale HTML title; require server-selected map state instead of a `vivo` fallback | Pushed as `3486ca3` | `git diff --check` passed. Missing map/participant state now returns a navigation error instead of selecting a client map. |
| UI-DATA.3 | Render the snapshot's one approved appearance through the mapped base sprite; stop claiming microphone/camera/screen state absent from the snapshot | Pushed as `2a6e31d` | `git diff --check` passed. Profile customization is still unimplemented because the server has no profile endpoint and the approved art catalog has only one appearance. |

No automated test suite or application build was run for these UI cleanup batches. At that point in the sequence, chat, meetings/calendar, editing and media were still disabled pending contracts; CP06.11 below supersedes the chat portion by implementing the fixed office channel. The other surfaces remain gated; see the [completion plan](PROJECT_COMPLETION_PLAN.md).

## CP06.11 — OpenOfficeForAll office chat and navigation (2026-11-10)

Integrated the supplied `ChatView` into the authenticated office shell and connected it to a single built-in `office` channel. The channel resolves its company/office scope from the authenticated route and is not a customer-managed channel record. The user selected **90-day retention** for the first chat release. Added strict shared HTTP/event schemas, a Mongo `office_messages` collection with exact expiry and TTL/history indexes, scoped history/send endpoints, sender-scoped idempotency, a 60-per-minute actor/workspace send budget, and post-commit `chat:message` delivery only to the matching admitted Socket.IO office room. History is bounded to the latest 100 unexpired messages.

Restored working OpenOfficeForAll-style navigation for Office and Messages. Calendar and Activity navigation show explicit not-yet-connected states. The active office chat uses company-member names, server message history and live events; the composer sends through this API. Failed sends preserve the draft and reuse the same idempotency ID while its text is unchanged, preventing duplicate messages after ambiguous outcomes. DMs, nearby chat, meeting chat, attachments, editing, channel administration, calendar/activity feeds, and audio/video remain outside this slice. The map and session behaviors continue to use current map-version selection and project-owned APIs/Socket.IO.

Verification: `pnpm test:contracts` passed (22 tests), `pnpm test:api` passed (82 tests across 3 files, including Mongo/HTTP/Socket.IO persistence, retention, retry conflict, office/company isolation and live room broadcast), `pnpm test:web` passed (31 tests), `pnpm lint` passed, `pnpm --filter @gather/web build` passed, and the mocked Chromium `company-office-preview.spec.ts` passed with chat navigation, history, send failure/same-ID retry and reconnect history refresh. `git diff --check` passed. Docker verification could not run because the local Docker API socket was unavailable. The live composed-browser chat flow therefore remains open in A12; see the [acceptance register](ACCEPTANCE.md) and [chat plan](../entities/chat-messages/PLAN.md).

This batch is committed and pushed; Git history records the implementation commit. The next product checkpoint is CP08 guarded LiveKit media UI/integration, with visual/accessibility and Chrome/Edge review still open.

## CP08.1 — proximity pairing state and private realtime updates (2026-11-10)

Implemented the first application-policy slice for proximity audio. Each office runtime now owns an
in-memory pairing manager. Pairing requires both participants to opt in and be Available, selects
the nearest eligible pair with a stable participation-ID tie-break, allows at most one pair per
participation, joins within two map tiles, and ends after leaving three tiles for 500 ms. Opt-out,
Away/Busy, disconnect, and authorization cleanup end a pair immediately. Explicit leave suppresses
that pair until eligibility or distance resets. Conversation updates are emitted only to the two
admitted sockets and carry a version/generation; the initial state explicitly says
`mediaReady: false`.

This implements pairing and conversation state only. It does not issue media grants, install CP07
permits, start LiveKit, or enable microphone controls. CP07's local enforcement proof is not yet
the application's live grant path, and release acceptance A07 still has deployment/TURN/privilege
gates. The supplied UI therefore must keep real audio controls unavailable until that guarded path
is connected; there is no P2P or unguarded fallback.

Verification: `pnpm --filter @gather/api test` passed (87 tests across four files), including a new
Socket.IO integration scenario proving pair updates reach the two opted-in members but not another
admitted office member, and that explicit leave sends a versioned end to the pair only. The pure
pairing suite passed (4 tests), `pnpm --filter @gather/web typecheck` passed, `pnpm test:web` passed
(31 tests), `pnpm test:contracts` passed (22 tests), and `pnpm lint` passed. Docker/LiveKit media
verification remains unavailable because the local container-engine app bundle is not executable;
no real audio cutoff or media UX acceptance is claimed.

This CP08.1 batch is committed and pushed separately. Next: wire the proved CP07 guard/supervisor to
real application membership and the LiveKit adapter; only then expose the upstream microphone
controls and run two-browser audio, cutoff, revocation, reconnect, and company-isolation checks.

## CP08.2a — guarded media contract boundary (2026-11-10)

Added strict shared schemas for a session-bound media-token request/response and the CP07 machine
policy exchange: guard boot epoch/nonce challenge, bounded signed snapshot with generation/identity/
room/source permits, and exact positive-sequence installation acknowledgement. Token requests cannot
select a room or source, policy sources are deduplicated, and a policy snapshot cannot contain two
permits for the same generation/identity.

This step defines wire shapes only. There is still no machine-authenticated API handler, application
policy publisher, installation-ack processing, media-token endpoint, or active LiveKit client. The
media controls remain unavailable until those pieces are implemented and verified against the
guard.

Verification: `pnpm test:contracts` passed (24 tests), including rejection of client-selected room,
zero versions, duplicate permits/sources, and malformed policy challenges; contracts TypeScript
typecheck and `pnpm lint` passed. The contract batch is committed and pushed separately. Next:
implement the private signed policy pull/ack API, connect it to current office conversation state,
and test that no token can be issued before the exact permit-install acknowledgement.

## CP08.2b — signed application policy pull and install acknowledgement (2026-11-10)

Added machine-authenticated `POST /api/media/internal/policy/pull` and `/ack` routes for the CP07 guard protocol.
Each request authenticates the exact raw JSON bytes with HMAC-SHA256 using a separately provisioned
32-byte `MEDIA_MACHINE_KEY`; malformed keys are rejected and an unconfigured key fails closed.
Challenges are bounded, nonce-replay protected and tied to one current guard epoch/monotonic
sequence. Pull replies contain only current proximity-generation microphone permits and are signed
over the exact response bytes. The API accepts only a matching, unexpired, single-use installation
acknowledgement. Only then does it mark still-current pairs active and privately publish
`mediaReady: true`; stale generations and replayed acknowledgements cannot activate a pair.

The API integration test verifies the signed snapshot, exact pair membership, private active notices,
outsider exclusion and replay rejection. The full API suite passed (88 tests across four files),
`pnpm --filter @gather/api build`, `pnpm test:contracts` (24 tests), and `pnpm lint` passed. This is
the application-side protocol endpoint only: the CP07 guard process is not yet wired to these
routes, application policy state is process-local, and no LiveKit token, browser media connection
or real-audio result exists. Docker/LiveKit could not be exercised because the local container
engine is unavailable. HMAC authenticates payloads but does not encrypt them or make the routes
network-private; authenticated TLS and ingress restriction remain deployment requirements. A07/A08 remain open.

This code-and-docs batch is committed and pushed separately. Next: connect the existing CP07 guard
pull/install loop to the signed API endpoints over an authenticated private transport, verify that
the real guard emits its ACK only after installation, and keep media-token issuance disabled until
that integration is proven.

## CP08.2c — CP07 client ACK bridge and shared HMAC key format (2026-11-10)

Connected the guard's `pullPolicy` client to an optional `CP07_POLICY_ACK_ENDPOINT`. After the
signed policy response passes schema/challenge validation and `PermitState.install` succeeds, the
guard posts an HMAC-authenticated ACK containing the exact epoch, nonce and sequence. It verifies
the API's HMAC-signed response and exact acknowledgement body before writing supervisor lease
progress or emitting the supervisor ACK. A rejected, stale, malformed or timed-out application ACK
does not renew supervisor progress. The CP07 synthetic fixture keeps its existing mode when no app
ACK endpoint is configured.

Standardized `CP07_POLICY_KEY` on the same canonical base64 encoding of 32 random bytes used by
`MEDIA_MACHINE_KEY`; both sides decode to the identical raw HMAC key before signing. This closes a
previous mismatch where the fixture client treated the base64 text itself as the HMAC key. The media
spike suite passed (23 tests), `pnpm lint` and `pnpm format:check` passed. CP08.2b's API integration
suite remains green (88 tests), including the raw request signatures and signed policy/ACK response.

This verifies the separate API endpoint and guard adapter paths, but no real API-to-guard Docker
network, LiveKit media, token issuance or cutoff is claimed; the local container engine is
unavailable. HMAC gives message integrity/authentication, not confidentiality or network isolation,
so production transport and ingress restrictions remain required. A07/A08 remain open.

This code-and-docs slice is committed and pushed separately. Next: exercise the app API and guard
adapter against each other over the local authenticated transport, then add a session-bound media
token route that requires a currently installed permit before any browser can join LiveKit.

## CP08.3a — session-bound proximity LiveKit grant and dynamic guard identity (2026-11-10)

Added `POST /api/conversations/:conversationId/media-token`. The API derives room, identity and
microphone scope from the current server-owned proximity pair; it rejects a different account or
session, stale conversation version, revoked/mismatched membership, changed map version, missing
LiveKit configuration, or a generation without an installed current microphone permit. It checks
authorization again after signing. The LiveKit JWT is limited to the current generation room, allows
microphone publication and subscription, denies data publishing and administrative/metadata grants,
and expires within 60 seconds or the earlier session deadline. Responses set `Cache-Control:
no-store`; the API returns the expiry encoded in the signed JWT rather than estimating it.

The CP07 application-policy guard mode now accepts participation IDs that change per office join,
but only when the signed JWT identity and room match a currently installed microphone permit and
the room generation is not retired. It requires both the application policy pull and signed ACK
endpoints; the older fixed fixture identity path remains separate. This code does not yet wire the
OpenOffice microphone control to the endpoint, join a LiveKit server from the browser, or exercise
the API/guard pair over Docker. No real audio, device permission or integrated media-cutoff result
is claimed; application policy state remains process-local and A07/A08 remain open.

Verification: the full API integration suite passed (88 tests), including signed-token claim checks,
blocked pre-ACK token requests, outsider/session/company denial and a leave-before-issue race. The
media enforcement suite passed (25 tests), including dynamic application identities and source,
room, retirement and permit rejection. API build, `pnpm lint`, and `pnpm format:check` passed.

This implementation-and-docs batch was pushed as `4d7cf45`. The supplied office-shell control
integration is recorded in CP08.3b below; a real two-browser guarded audio and cutoff exercise is
still required before treating proximity voice as accepted.

## CP08.3b — supplied office-shell proximity voice controls (2026-11-10)

Connected the authenticated company office shell (`AuthApp` → `CompanyOfficePreview`) to the
proximity token API and the pinned `livekit-client`. The existing OpenOffice-style control bar now
has a microphone control and the sidebar has explicit nearby-voice opt-in. Opt-in only enables
pair matching; it never requests a device. The mic stays off until the user activates it while the
current socket conversation is active and `mediaReady`. The client rechecks conversation version
and generation against the token response, loads the SDK only on demand, joins with the scoped
server URL/token, publishes only microphone audio, attaches subscribed remote audio, and handles
mute/unmute/reconnecting/disconnect. Mute is configured to stop the local microphone track. Opt-out,
pair end/generation change, office leave and component teardown abort a pending grant, stop capture,
detach remote audio and disconnect the room. No camera or screen-share control is enabled for
proximity; those sources remain CP09 meeting scope.

Added the `ApiClient.proximityMediaToken` protected mutation and tests for its route, body, CSRF and
no-store behavior; four client-session tests cover explicit start, stale generation rejection,
abort on conversation end, and remote-track detach. A mocked browser E2E covers opt-in through the
Socket.IO office boundary, waiting for an active private pair, requesting the correct conversation
version's media token, and opting out. `pnpm --filter @gather/web typecheck`, `pnpm --filter
@gather/web build`, `pnpm test:web` (37 tests), and the focused `company-office-preview` E2E (1 test)
passed, along with repository lint and format checks. The E2E uses mocked API/office Socket.IO, a
syntactically valid test-only grant, and an intentionally closed fake LiveKit websocket; it asserts
the browser attempts signaling, but does not prove a successful LiveKit join, device prompt, remote
sound or media cutoff. The build retains a separate lazy LiveKit chunk (~532 kB minified).

The owner reaffirmed 90-day office-chat history retention; CP06.11 already implements it, so this
voice slice made no retention changes. This code-and-docs batch is pushed separately. Remaining
CP08 proof is a real API↔guard deployment and two-browser LiveKit audio/cutoff run with TURN and
isolation checks; A07/A08 stay open.

## CP08.3c — application policy and separate guard process (2026-11-10)

Extended the proximity media integration test to start the actual CP07 `guard-process.mjs` as a
separate Node process. The guard polls the running Nest integration-test API over signed localhost
HTTP using the shared canonical HMAC key, installs the active pair's permits, and sends its signed
installation acknowledgement. The test takes an application-issued LiveKit JWT and sends the
pinned `/rtc/v1/validate` signaling shape through the guard. A local mock SFU upstream confirms that
the current token is forwarded. After `conversation:leave`, the guard installs the next empty
snapshot and denies the still-unexpired token. The guard then restarts with a fresh epoch, installs
the API's empty policy and continues to reject that old token. The upstream records only the path,
never the token query value. Temporary processes, ports and retirement storage are cleaned up.

`guard-process.mjs` now accepts test-scoped listen host/port and fixed upstream overrides while
retaining its isolated-fixture defaults. This demonstrates the API-to-guard process/network
boundary, install ACK and current application-token authorization. The upstream is deliberately a
mock, so this is not a LiveKit join, real browser audio, supervisor progress bridge, forwarding
cutoff measurement or production deployment. `pnpm --filter @gather/api build` and the focused
`auth.integration.test.ts` proximity case passed (1 selected test; 68 unrelated cases skipped).

The EGM CP08 audit also found stale contract/entity text describing grant routes as unimplemented
and `mediaReady` as always false. This docs batch corrects those statuses and records the remaining
webhook, real-SFU, measured cutoff and deployment gaps. The owner-selected 90-day office chat
retention remains implemented by CP06.11.

## Commons asset check after Vivo MVP selection (2026-11-10)

The full repository check exposed a stale coupling in `scripts/commons-assets.mjs`: the legacy,
original Commons export used the current MVP map ID to validate its own geometry and to build its
manifest. After Vivo became the MVP, that check rejected valid Commons artifacts (`commons` is a
separate map identity). The Commons exporter now validates and emits its fixed `commons` identity;
Vivo remains the MVP and is checked by its own asset pipeline. The production Commons manifest,
geometry, catalog and sprite hashes are unchanged.

Regression coverage asserts the Commons manifest remains `commons` while the configured MVP ID is
different. This is a maintenance fix for the retained Commons asset pipeline, not a change to the
active Vivo office or its map data. The CP08.3c integration test's child-process type was also
corrected to match its actual `ignore/pipe/pipe` stdio configuration; this lets the full API test
typecheck exercise the separate guard process without weakening its stream handling.

Verification: full `pnpm check` passed, including formatting, lint, workspace typechecks, contract
tests (24), world tests (31), media-enforcement tests (25), Commons asset tests (5), shared tests
(5), web tests (37), API integration tests (88), map asset checks and production builds. Commons
and Vivo map IDs/manifests validated independently, with all committed Commons artifact hashes
unchanged. The web build still reports the existing large preview chunk (about 1.39 MB minified)
and lazy LiveKit chunk (about 532 kB); this map-check fix does not alter that bundling.

## CP08.4 — real API grants through guarded LiveKit audio (2026-11-11)

Added an opt-in end-to-end media fixture, `pnpm test:media-live`. The existing API integration test
creates a real nearby pair, starts a pinned LiveKit SFU and the separate CP07 application-policy
guard, and lets the guard install/ACK the active policy over signed local HTTP. It issues both
participants' short-lived grants through the actual API route. A Vite-served browser fixture loads
the production `ProximityAudioSession` class in two Playwright Chromium clients with fake microphones.
Both clients join through the guard; each reports the other current participation as its only remote
audio identity, with active waveform samples. The fixture is opt-in and keeps its Docker ports on
loopback.

The selected pair then ends through the API Socket.IO command and the guard ACKs the empty policy.
The browser fixture applies the production session's stop operation and measures decoded audio
samples at 20 ms intervals: **0 ms measured cutoff**, with both sample counters stable after
cleanup. This proves the real API token → guard → LiveKit → Chromium audio path and the session stop
path. The test does not mount `CompanyOfficePreview`; it does not independently prove the full UI
component responds to Socket.IO state changes. That cross-layer UI proof, permission denial and the
CP08.5 revocation/failure matrix remain open.

After the explicit leave, both original tokens were still unexpired and rejected by the guard after
restarting the guard with a fresh epoch and restarting the pinned SFU. The first run exposed a
fixture-only ICE TCP port mismatch: the server advertised its container port while Docker mapped a
different host port. The fixture now sets its advertised ICE TCP port equal to the loopback-published
host port. Chromium itself was installed into Playwright's local cache to run this opt-in test; no
browser binary or generated token was added to the repository. Targeted verification passed one
CP08.4 API integration test (68 unrelated tests skipped), web/API test typechecks, lint and format.
The full `pnpm check` also passed: all 215 contract, world, media-enforcement, asset, shared,
web and API tests, plus the production build. The build retains the existing large preview bundle
warning (about 1.39 MB minified) and the LiveKit client chunk (about 532 kB). The fixture's Vite
child now receives only the process/runtime variables it needs instead of inheriting the API test
process environment.

## CP08.5.1 — real mute/unmute cutoff and recovery (2026-11-11)

Extended the opt-in API-grant media fixture to toggle the production `ProximityAudioSession` on one
of two Chromium participants and measure the other participant's decoded waveform. A LiveKit mute
keeps the remote subscription present, so the receiver verifies that active samples stop and remain
stable for 500 ms instead of expecting the track to unsubscribe. In the successful run, mute-to-last-
active-sample measured **59 ms**, the receiver stayed stable through silence, and unmute-to-resumed-
audio measured **668 ms** with at least six additional active samples. Both are within the eight-
second cutoff budget. `pnpm test:media-live` passed the focused real API/guard/SFU/browser test;
Prettier and lint also passed. Permission denial plus map usability, full UI component wiring,
opt-out/away and server-side revocation/failure cases remain in CP08.5.
