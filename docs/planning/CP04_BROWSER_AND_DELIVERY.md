# CP04 — browser accounts, companies and delivery

Started on 2026-11-09. GPT-6 Luna implemented CP04.1 and CP04.2. The owner selected OpenCode with DeepSeek V4.1 Flash Free at max effort for CP04.3. Codex owns planning, review, independent verification, documentation and pushes. Parent scope is the [completion plan](PROJECT_COMPLETION_PLAN.md#cp04--finish-delivery-same-origin-browser-auth-and-company-onboarding).

## Delivery batches

| Batch | Deliverable | Verification |
| --- | --- | --- |
| CP04.1 | Browser API adapter and account/company onboarding | Register, verify, sign in, recover password, list/create companies and accept an invitation through real HTTPS browser requests. Validate request/response boundaries and explicit durable-command retries |
| CP04.2 | Session settings, reauthentication and current-company context | Session list/revoke/logout-all, password change, explicit idle extension and teardown across account/company changes |
| CP04.3 | Reproducible private delivery environment | TLS ingress, transaction-capable MongoDB, persistent Redis queue, explicit worker and local mail sink. Configure service boundaries before running the environment |
| CP04.4 | Delivery fault evidence and staging-provider setup | Commit/enqueue ordering, restart/duplicates, ambiguous delivery acknowledgement, queue outage, expiry and actual authorized SMTP delivery |
| CP04.5 | Security and operational handoff | Review cookie/Origin/proxy behavior, password workload, audit-mirror requirements, environment evidence and remaining pilot limits |

## CP04.1 verification boundary

Use the existing account and company contracts from the [API reference](../contracts/AUTH_AND_ROLES_API.md). The browser owns cookies and automatic Origin headers. The client keeps CSRF in memory, sends JSON mutations, validates responses and uses explicit retries with stable idempotency keys for durable company operations.

The default application entry moves to the authenticated account/company path. The Commons renderer sample keeps its development route. Office admission and the integrated renderer follow in CP05/CP06.

Local browser verification uses a disposable MongoDB replica set, the actual NestJS API and a loopback HTTPS server serving the built client. Fixture verification/invitation codes are read privately from the encrypted outbox for the test. Actual mail delivery and persistent queue behavior are verified in later batches.

## CP04.1 review checklist

- Keep cookie identity independent of imported localStorage identities and remove known legacy credential/admin/invitation keys while preserving preferences.
- Deduplicate CSRF bootstrap; rotate memory on successful login; fence late response bodies before they change session state.
- Never retry a mutation automatically. An unconfirmed company/invitation result retains the same key for an explicit same-payload retry, including malformed success responses and server/gateway failures.
- Ignore company results after screen/account teardown, prevent overlapping submissions and avoid overwriting a newly created membership with an older list response.
- Keep code/password inputs out of URLs, storage and logging. Use form labels, keyboard submission, visible errors and focus when the screen changes.
- Validate against the actual API with loopback HTTPS, disposable transaction-capable MongoDB and a private outbox fixture. This does not establish real SMTP, persistent queue, public ingress, Edge or pilot acceptance.

## CP04.1 implementation and local evidence

Implemented on 2026-11-09 by GPT-6 Luna; reviewed and independently verified by Codex.

- `apps/web/src/lib/api.ts` validates shared request/response schemas, binds browser fetch correctly, deduplicates CSRF bootstrap, rotates the token on login and fences stale bodies before changing session memory. Requests use same-origin credentials and no-store caching. Mutations never retry automatically.
- `SubmissionKey` keeps the same command key for an explicit same-payload retry after transport errors, malformed success responses or 5xx responses. The company UI prevents overlapping mutations/list reloads and ignores responses after teardown. A rejected authenticated CSRF request clears the account view before another mutation.
- The account screens implement registration, code verification/resend, login, forgotten/reset password and logout. Company list/create/invitation acceptance show the server-owned role. Known legacy session/browser-identity/admin/invitation keys are removed; preferences are retained. Blocked browser storage does not prevent startup.
- Root `pnpm check` passed **110 tests**: 19 contracts, 30 world, five exporter, five legacy shared, eight web and 43 backend. Formatting, ESLint, workspace typechecks and all builds passed. The production web build contains one 336.35 kB JavaScript entry and excludes the old office/LiveKit and development Phaser entry paths.
- Headless Chrome **152.0.7977.42**, macOS **26.6.1 arm64**, loopback HTTPS + actual NestJS + disposable MongoDB replica set: registration → private outbox code → verification → login → company creation → cookie reload → invitation acceptance as member → password recovery passed. The test corrupted a creation response after the API committed; the client made no automatic retry, reused the original key on explicit retry and displayed exactly one company.
- A real-cookie account-switch check passed: after another login replaced the browser cookie, a company command using the old in-memory CSRF was rejected, the old account/company UI cleared and no company was created for the new account.
- Additional browser checks passed for recovery from an initial `/me` 503, legacy-secret cleanup while retaining a theme preference, password input clearing across views, blocked localStorage and a 390 px layout without horizontal overflow. Secure/HttpOnly/host-only session-cookie attributes, empty auth storage and zero runtime exceptions were checked in the main flow. The narrow viewport is a layout smoke check, not mobile-browser acceptance.

Verification used private fixture reads, not actual email delivery. Edge, public TLS/ingress/proxy behavior, persistent Redis, worker/SMTP faults, session settings and integrated office/media remain unverified here. CP04 is still in progress; CP04.2 is next. No Docker or external mail service was run. Hosted CI is recorded on the closing commit's GitHub Actions run after push.

## CP04.2 execution plan

Started on 2026-11-09 with the same owner-approved division: GPT-6 Luna implements; Codex scopes, reviews, verifies, documents and pushes each completed batch.

| Batch | Scope | Completion evidence |
| --- | --- | --- |
| CP04.2a | Typed browser adapters for sessions/revocation, logout-all, reauthentication, password change, explicit extension and company detail | Strict response/ID validation; DELETE JSON/CSRF behavior; rotation, memory clearing, stale-response and no-retry tests; repository checks |
| CP04.2b | Account security screen and session lifetime controls | Real HTTPS browser session list, other/current-session revocation, logout-all, reauthentication/CSRF rotation, password change and explicit extension; idle warning/expiry; response teardown |
| CP04.2c | Explicit current-company selection and isolated company context | Server-authorized detail before selection, owner/member display, switch/leave-view cleanup, rejected membership/access, stale response and account teardown tests |

The company selection is a context screen for the existing company API. It does not enter a realtime office, request a join ticket or start media. Selected state stays in memory and is cleared on signout, account changes or lost access. Office/world/media lifecycle hooks belong to the later integrated office packets.

Session timers are a browser UX estimate from server-issued expiry metadata; protected requests still enforce the actual session on the API. Passive reads, focus events and countdowns must never extend access. The user must explicitly request an extension, which remains bounded by absolute expiry. Reauthentication replaces the session/cookie and CSRF binding; browser state must discard responses tied to the old binding. Password change, current-session revocation and logout-all return to signin.

No external delivery or infrastructure deployment is included in these batches. Keep the CP04.1 code-entry and private test-fixture boundaries. Run full checks before each batch commit/push and inspect its hosted CI result; record exact evidence without accepting the remaining CP04 environment/provider gates.

### CP04.2a — session adapter evidence

Completed in the CP04.2a commit. Luna implemented `sessions`, validated company detail, JSON `DELETE` revocation, logout-all, password change, reauthentication and explicit extension in the browser adapter. Session/current designation comes from a strictly validated public session DTO; only a current-session revocation clears client session memory. Destructive success handlers and rotation both recheck their originating generation before changing memory.

Codex reviewed headers/ID interpolation, schema rejection, awaited-body races and clearing behavior. Full local `pnpm check` passed **118 tests** (16 browser tests plus the existing 102 non-browser tests), formatting, lint, all workspace typechecks and builds. This batch adds transport adapters; session/security controls and current-company UI are still CP04.2b/CP04.2c. No backend, schema, dependency or mail/infrastructure change was needed.

### CP04.2b — browser verification checklist

Use a real HTTPS browser against the actual API and disposable MongoDB. A private test command file may age the fixture's password-proof timestamp or shorten its idle/absolute deadline; this is fixture-only database control, never a product endpoint or shipped clock override.

1. List two real sessions, revoke the other one, retain the current cookie and confirm the revoked session cannot authenticate.
2. Reject password change after recent proof expires; verify the password explicitly, observe session/CSRF rotation, then change the password and require signin. Confirm the old password no longer works.
3. Explicitly extend a near-idle session once; verify no timer/read/focus request performs an extension, and the result does not exceed absolute expiry.
4. Revoke the current session and sign out all sessions in separate flows; discard account/company/password state and reject old cookies.
5. Observe warning/expiry after a shortened fixture deadline and refresh after a tab resumes. Treat server policy as authoritative; local countdowns are UI estimates.
6. Reject stale responses and unexpected session/account replacements; maintain explicit retry/error behavior and verify keyboard/navigation teardown without browser-secret storage.

### CP04.2b — implementation and local evidence

Completed in the CP04.2b commit. Luna implemented `AccountSecurity`, the shared `SessionLifetimeNotice`, pure deadline/current-session checks and `useSessionGuard`. Codex reviewed lifecycle generations, synchronous mutation locking, focus-read throttling, sensitive-error handling and teardown. One mutex covers company/security/logout/extension mutations. Session reads are cancelled before mutations; focus/visibility reads are bounded and blocked by the mutex. Unexpected account/session replacement clears the old UI. Wrong verification/current passwords remain actionable errors instead of false session-expiry signouts.

Estimated expiry clears the account view even when another request is pending; there is no indefinite deferral behind a hung mutation. Root/child generation checks discard its late result. Password inputs reset on submission; current-session revoke, logout-all and password change return to signin with cleared account/company state.

Verification on 2026-11-09:

- Full local `pnpm check` passed **121 tests**: 19 browser + 102 existing non-browser tests, formatting, lint, all workspace typechecks and builds. After the final expiry change, root formatting/ESLint, web typecheck, 19 browser tests and production web build passed again.
- Headless Chrome **152.0.7977.42**, macOS **26.6.1 arm64**, actual NestJS + loopback HTTPS + disposable MongoDB: two independent sessions; other/current revocation; incorrect verification/current password; expired recent proof; reauthentication cookie/session rotation; password change and old-password rejection; logout-all invalidating another cookie; explicit extension and absolute cap; idle and absolute expiry; unexpected current-session replacement all passed. Independent scenario accounts respect the existing login budgets; no product rate limit was changed.
- A delayed logout response released after estimated expiry and a new signin did not sign out the new UI. Both an old 401 and a successful response carrying the original cookie-clear header were tested in this Chrome fixture.
- An extension response was corrupted after the API committed. There was no automatic retry; a readonly refresh recovered its actual outcome. During a 31-second held mutation, focus did not start competing account/session reads. Corrupted successful reauthentication likewise required a fresh check and cleared the unexpected session binding.
- No browser secret storage or runtime exceptions were observed. The test-only file controls shortened fixture deadlines/aged recent proof; they are outside the repository and expose no HTTP endpoint. No Docker, Redis or actual mail provider was run.

The remaining CP04.2 deliverable is explicit current-company selection and isolated company context in CP04.2c. Edge and public provider/ingress acceptance remain outside this local Chrome evidence.

### CP04.2c — current-company verification

Luna implemented `CompanyOverview` and Codex reviewed the selection lifecycle and independently tested it. Opening a company checks the existing authorized detail route. The browser validates the response schema and matches the returned company ID to the requested ID. The view displays the company name, address, role and member count. Selection stays in memory. Leaving the company view aborts its request and discards its result. Refresh can run explicitly or on a throttled return to the tab. If the server denies company access, the app clears the context and refreshes the company list while keeping the user signed in.

Headless Chrome 152.0.7977.42 on macOS 26.6.1 arm64 exercised the production build through loopback HTTPS with the actual API and disposable MongoDB. The scenario covered switching between two companies with a held response, rejecting a valid response for the wrong company, clearing selection on reload and through security/reauthentication, owner/member role isolation, actual membership removal through the API, expiry and a subsequent signin under another account. The browser created no office connection and stored no selection or credentials. Edge and deployed ingress checks remain pending.

The final `pnpm check` passed 121 tests, including 19 browser adapter/session tests and 43 backend tests. Formatting, lint, workspace typechecks and production builds passed.

CP04.2 is complete. CP04.3 covers the reproducible private delivery environment.

## CP04.3 execution checkpoints

The owner selected OpenCode with `opencode/deepseek-v4.1-flash-free#max` for the remaining implementation on 2026-11-09. Codex owns planning, review, independent verification, documentation and pushes. Existing configuration drafts are the handoff input.

| Checkpoint | Scope | Verification |
| --- | --- | --- |
| CP04.3a | Private local Compose files, pinned build images, replica-set/index setup, persistent queue, optional cache, explicit worker and local inbox | Official Compose schema, configuration review, key creation and initialization failure checks, repository gates |
| CP04.3b | Authorized environment startup and end-to-end local delivery | Actual image builds, internal networking, HTTPS/cookies/Origin, replica-set transactions, queue/inbox persistence, captured verification/recovery/invitations and worker restart |

The [local runbook](../../infra/README.md) contains the concrete startup sequence and private settings. It uses `https://localhost:8443`, a loopback inbox on port 8025 and internal container networks. The existing setup constraint is “Do not run Docker”, recorded in [setup progress](SETUP_PROGRESS.md). After configuration review and the CP04.3a push, the owner explicitly authorized local Docker testing on 2026-11-09. This supersedes that setup restriction for CP04.3b; certificate trust installation and external SMTP remain outside this authorization.

CP04.2c was pushed as `0f087b0` and [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42545164151).

### CP04.3a — configuration review and evidence

Completed on 2026-11-09 with OpenCode `opencode/deepseek-v4.1-flash-free#max` implementing the configuration and Codex independently reviewing it. The exported session records that exact provider/model/variant, a completed final response and zero reported cost. The CLI relay did not produce its normal result artifact; session export, actual files and independent checks supplied the review evidence. No Docker command was executed.

Codex independently ran the full `pnpm check`: **121 tests**, formatting, lint, workspace typechecks and production builds passed. Final checks also passed the official Compose JSON schema at revision `3a4a6995e4a971f6173dff9130cb3e38e6738651`, private-port/network/profile assertions, image digest/platform checks, scoped lint and syntax checks. The temporary Mongo initializer harness covered fresh initialization, idempotent reuse, concurrent initialization, configuration drift, unrelated errors and the primary polling deadline. These checks do not replace actual mongosh/container execution; individual network calls still use driver timeouts.

The key helper was verified in disposable directories for exclusive creation, mode `0600`, canonical 32-byte base64, refusal to overwrite, invalid placeholder rejection and no secret output. Codex then generated the ignored local settings file once; its key is retained privately and is excluded from Git and the build context. The implementer's final claim that this file was absent was stale and was corrected by independent review.

Accepted configuration choices: setup jobs are explicit and the existing API startup index validator remains authoritative; the local worker uses development mode for plaintext SMTP to Mailpit; the cache is optional; runtime images retain the workspace dependency tree; mongosh globals are declared only for `infra/mongodb/**/*.js` without disabling lint rules. These are local configurations, not a production deployment.

CP04.3b remains open: actual image builds, setup/restart, HTTPS/cookies/Origin, transactional writes, real queue-to-inbox delivery and persistence. CP04.4 provider delivery and later operational acceptance are not completed by this checkpoint.

### CP04.3b — runtime evidence

Completed on 2026-11-09 after explicit owner authorization to run local Docker. CP04.3a was pushed as `b1cb776`; [hosted CI passed](https://github.com/ibrahim8ismael/workspace/actions/runs/42613839075). Codex executed the runtime checks. OpenCode `opencode/deepseek-v4.1-flash-free#max` implemented the one required configuration correction; its completed session and model/variant were verified independently.

The first runtime exposed an issue missed by static checks: published ports were absent from actual `NetworkSettings.Ports` when Caddy and Mailpit joined only internal bridges. The correction adds `host-access`, a standard bridge used only by those two services, while retaining their internal service links. API/worker/Mongo/Redis remain internal; the two host bindings remain exactly `127.0.0.1:8443` and `127.0.0.1:8025`. This intentionally permits egress for Caddy/Mailpit. No external mail provider or relay is configured. See the [Docker network specification](https://docs.docker.com/compose/how-tos/networking/).

Independent actual evidence:

- Docker Engine **29.8.2**, Compose **5.5.0**, OrbStack; Linux **arm64** images; macOS **26.6.1**, Headless Chrome **152.0.7977.42**. All API, worker and web image targets built successfully from the pinned bases and frozen dependency lockfile. This does not constitute an amd64 runtime test.
- Fresh Mongo initialization and reuse succeeded. The API exited before index setup, then became healthy after the explicit index job. Actual Mongo transactions committed and aborted correctly in an isolated validation collection.
- Runtime inspection verified only the two loopback publishers, exact `host-access` membership, internal backend networks, nonroot API/worker processes, read-only/drop-all API/worker/Caddy and queue AOF/noeviction. All configured service healthchecks passed; worker delivery provides its functional evidence.
- A client explicitly trusting the exported public local CA verified HTTPS before and after full recreation. SPA deep links and API route separation passed. Same-origin CSRF bootstrap succeeded, cross-site bootstrap was rejected and forged forwarding headers did not bypass an invalid Origin. Browser tests used an isolated temporary profile with certificate warnings bypassed; no OS trust installation occurred.
- Through actual Caddy/API/Mongo/Redis/worker/Mailpit, Chrome passed registration, captured verification-code entry, signin, company creation, explicit retry after a corrupted committed response without duplicate company creation, cookie reload, invitation acceptance and password recovery. The cookie was Secure/HttpOnly/SameSite=Lax at `/`; no browser secret storage or runtime exceptions were observed.
- A separate fixture paused the actual BullMQ queue, requested recovery, verified the queued job contained only `outboxEventId`, then performed full `down`/`up` without volume deletion. The waiting job, queue marker and inbox persisted; the optional cache marker disappeared. After queue resume, the restarted worker delivered the message, its code reset the password, and company membership and subsequent session reload worked. The retained encryption key successfully decrypted the queued payload.
- The verification harness was corrected for BullMQ 6's paused metadata/wait-list representation, excluding one-shot setup jobs from persistent-service `--wait`, and waiting for UI mutation completion. Independent accounts avoided the unchanged recovery/login budgets. Failed harness attempts are not counted as passing product evidence.
- The revised Compose file passed the official schema, boundary assertions, formatting and `git diff --check`. Application code/dependencies were unchanged from the **121-test** passing CP04.3a baseline. Current service logs contained neither the retained key nor any of nine captured one-time codes; runtime image checks confirmed private settings and Git metadata were excluded. These are bounded local checks, not a general redaction audit.

After final checks the project containers were stopped, with named volumes and the private key retained. CP04.3 is complete for the reproducible local environment. External provider acceptance, duplicate/ambiguous acknowledgement and outage/expiry drills remain CP04.4; production security/operations, public ingress and Edge remain later acceptance work.

## CP04.4 execution plan

| Step | Deliverable | Evidence / dependency |
| --- | --- | --- |
| CP04.4a1 | Mongo integration coverage for queue-add outage and provider failure/retry | Outbox remains encrypted and retryable, recovery reuses one ID-only job, successful replay is a no-op; completed in this test commit |
| CP04.4a2 | Runtime Redis outage and outbox recovery | Actual Redis stop during registration, encrypted pending outbox, restart and Mailpit delivery; completed in this runtime evidence batch |
| CP04.4a3 | Expiry cleanup and deterministic queue duplicate/replay behavior | Expired payloads are purged during dispatch without queue contact or mail; dispatcher replay avoids adding an existing job; completed in this test commit |
| CP04.4b | Acknowledgement/crash and secret-lifecycle drills | CP04.4b1 models SMTP accepted with acknowledgement lost and verifies at-least-once retry/duplicate possibility; actual provider acknowledgement and key-loss drills remain later |
| CP04.4c | Authorized staging SMTP provider setup and delivery | Owner decision D06: sending domain/provider, DNS control, designated recipient inboxes and protected key storage; actual external sends require an agreed concrete setup |

#### Owner direction — external SMTP deferred

On 2026-11-09, the owner directed the team to continue CP04 while ignoring the external email provider for now. CP04.4c is therefore explicitly deferred; no provider, domain, DNS, recipient or production key setup is authorized by this direction, and no external email was sent. The local delivery sink, queue/outbox fault coverage and simulated lost-ack behavior above remain useful, but they do not satisfy real-provider delivery acceptance. Continue with CP04.5 security and operational handoff while keeping the real-provider release gate open.

### CP04.4a1 — outbox fault contract tests

OpenCode `opencode/deepseek-v4.1-flash-free#max` added two tests to the existing Mongo integration suite. Codex reviewed the diff and independently ran the focused and full-file gates. Queue-add failure leaves the transactionally created outbox row pending with its authenticated-encrypted payload intact; retry enqueues the same ID-only payload, changes state to queued and skips an already-present job. Mail-provider failure raises only the worker's sanitized error, increments attempts and leaves payload retryable; a successful retry clears payload, marks delivery and makes later replay a no-op. Existing transactional rollback and expiry tests remain in place. These scenarios use the existing real Mongo replica-set fixture with a deterministic queue/sender boundary; CP04.4a2 still needs actual Redis/Mailpit runtime faults.

The full `pnpm check` and [hosted CI](https://github.com/ibrahim8ismael/workspace/actions/runs/42620649150) passed the preceding test-only change.

#### CP04.4a3 — expiry before queue dispatch

OpenCode `opencode/deepseek-v4.1-flash-free#max` added a Mongo integration case to age one fresh outbox record, call the existing dispatcher, and verify it becomes expired, its encrypted payload is cleared, and that record ID is never sent to `getJob` or `add`. The test leaves every unrelated fixture untouched. Existing delivery-level expiry and successful replay tests cover the adjacent boundaries. No worker implementation changed.

#### CP04.4a2 — real Redis outage and recovery

Using the running local Compose stack, Codex stopped only the queue Redis service, registered a fresh fixture account through HTTPS, and confirmed that Mongo retained a pending encrypted outbox record with zero delivery attempts. Redis and the worker were restarted; the worker delivered the message and Mongo recorded `delivered` with one attempt. No external provider was used and no message code or recipient was printed. This is an observed local fault drill, not yet a repeatable committed runner; CP04.4a3 separately tests expiry cleanup before queueing; deterministic dispatcher tests cover deduplication.

Product-code changes remain delegated to the owner-selected OpenCode DeepSeek free model at max effort. Local fault work continues before staging provider access.


### CP04.4b1 — lost SMTP acknowledgement

OpenCode `opencode/deepseek-v4.1-flash-free#max` added a Mongo integration test that simulates a provider accepting and recording a message while its acknowledgement is lost. The worker retains the encrypted outbox item and retries it; the same verification token can therefore be sent twice. The retry marks the record delivered and clears the payload, and later replay does not call the provider again. This establishes at-least-once behavior and makes no exactly-once claim. It is a deterministic sender-boundary simulation, not an actual SMTP provider fault.

Existing primitives cover wrong-key/ciphertext rejection. Real provider acceptance, acknowledgement loss, key rotation/loss drills and staging SMTP still depend on an owner-selected D06 configuration. No external email was sent.
