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
| CP05.1 | Engine.IO Origin/size gate, one-use ticket admission, runtime reservation and ready snapshot | Complete locally; production runtime incomplete | `pnpm --filter @gather/api test`: 57/57 pass, including real Socket.IO clients for valid/invalid Origin, oversized packet, malformed auth, replay, duplicate participation, epoch replacement, two-user snapshot, disconnect cleanup and capacity. Formatting, lint and API build pass |

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
