# CP04 — browser accounts, companies and delivery

Started on 2026-11-09. Implementation by GPT-6 Luna, with planning, review and verification by Codex. The owner requested this delegation arrangement. Parent scope is the [completion plan](PROJECT_COMPLETION_PLAN.md#cp04--finish-delivery-same-origin-browser-auth-and-company-onboarding).

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
