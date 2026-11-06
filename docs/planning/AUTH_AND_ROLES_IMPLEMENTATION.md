# Backend authentication and roles implementation plan

Status: initial backend slice implemented and locally verified; plan was committed first as a2858c8.

## Authorized scope

Implement backend APIs, persistence, delivery plumbing and automated checks for first-party authentication and company-scoped roles. Do not connect or modify the imported frontend. Do not run Docker. Continue incremental commits/pushes after meaningful verified stages.

The existing project brief, HTTP contract outline, entity plans and security plan are the baseline. This plan turns those drafts into an ordered implementation slice; it does not claim any security acceptance has passed.

## Decisions for this slice

- A global user account has independent workspace memberships. Use the current workspace-as-company planning default; do not add an organization hierarchy or freeze that future cardinality through an unrelated account field.
- Implement company roles `owner` and `member`, matching the existing MVP plan. Roles belong to memberships, not a global user role field. Platform operators are outside customer RBAC and receive no implicit access.
- Use opaque server sessions in Secure HttpOnly host-only cookies, not JWTs or frontend storage. Store only session-token digests; check account/authVersion, revocation and explicit idle/absolute expiry.
- Use MongoDB/Mongoose with replica-set transactions and majority-acknowledged security changes. Do not add a production in-memory auth fallback or a debug token issuer.
- Keep schema fields allowlisted with runtime validation, private/no-store responses, structured errors and bounded request/hash work.
- Implement mail as encrypted expiring Mongo outbox records plus a configured SMTP/BullMQ worker. No actual provider credentials or sending domain are selected by this task. Do not expose verification/reset tokens through public API responses or logs.
- Use temporary real Mongo replica-set processes for integration tests if available; this does not require Docker. Production database, mail and queue connectivity remain environment configuration requirements.

## Execution stages

### Stage 1 — Contracts and persistence foundation

1. Freeze request/response schemas for the routes below. Reject unknown fields, NoSQL operators and client-supplied roles/status/identity.
2. Define user, credential, session, purpose-separated auth-token, workspace/membership/invitation, audit and outbox records with explicit unique/TTL indexes.
3. Implement database configuration, bounded transaction helpers and explicit index provisioning. Production startup must not silently create/drop indexes or work against a standalone database lacking transactions.
4. Implement bounded Argon2id hashing, random-secret/digest helpers, encrypted outbox payloads, cookie options and error/redaction policy.
5. Add focused checks for validation, password policy, expiry and encryption integrity; build/typecheck before the first implementation push.

### Stage 2 — Account and session lifecycle

1. Safe CSRF bootstrap creates bounded anonymous browser state; preserve an existing valid session. Validate Fetch Metadata and custom header on bootstrap, exact Origin and JSON on mutations.
2. Registration creates a pending account, credential, single-use verification token and encrypted outbox message transactionally. It returns a generic response and no authenticated session.
3. Verification requires token plus knowledge of the pending password. Mailbox recovery safely replaces credentials if preregistration used someone else's address. Recovery cannot lift suspension or restore membership.
4. Login verifies credentials, rechecks current credential/authVersion within session issuance, rotates browser-session/CSRF bindings and returns a safe account DTO.
5. Session validation checks authoritative Mongo state. Implement private `me`/session listing, logout, logout-all and explicit session revocation.
6. Password reset and change consume/version credentials atomically; expired/superseded tokens remain unusable even before TTL deletion. Recent password reauthentication rotates the session/CSRF binding.
7. Rate-limit bootstrap, login, signup and delivery work by appropriate account/IP/global scopes. Never trust arbitrary forwarded headers or permanently lock an account due to attacker attempts.

### Stage 3 — Company RBAC

1. Authenticated verified accounts create/list workspaces; creation establishes the owner membership and exact account/workspace counters transactionally.
2. Membership guards resolve full workspace scope and allowed roles from current server records. A role in company A grants nothing in company B.
3. Owners manage recipient-bound invitations; verified matching accounts redeem them exactly once. Acceptance creates/reactivates a member and updates capacity once.
4. Implement scoped member listing, member removal/leave and atomic owner transfer. Prevent owner removal without transfer and owner self-promotion through generic role patching.
5. Reauthorize privileged writes inside the transaction and make real conditional writes on session/user/membership/workspace policy records so concurrent revocation contends with the protected action.
6. Durable commands use scoped idempotency keys/result reconciliation. Exact membership/ownership quotas survive retries and concurrent requests.

### Stage 4 — Delivery, checks and documentation

1. Dispatch committed outbox IDs to BullMQ; keep tokens/secrets outside jobs. Workers decrypt only current expiring payloads, send through configured SMTP, tolerate retry/duplicate effects, and purge secrets after delivery/expiry.
2. Run real HTTP/database checks for account lifecycle, credential races, CSRF/Origin, cookies, expiry, role escalation, tenant ID substitution, invitation concurrency, owner transfer and quotas.
3. Add backend checks to pnpm/CI, document environment/index setup, and include manual curl request examples that require no frontend.
4. Run the full repository check without changing web code, push the implementation and inspect hosted CI. Record measured results and any remaining provider/deployment limitations.

## HTTP route scope

All routes are under `/api`. Public authentication mutations still require valid anonymous/session-bound CSRF and the configured Origin.

| Route | Method | Policy / result |
|---|---|---|
| `/auth/csrf` | GET | Safe bootstrap; returns CSRF token, never raw session secret |
| `/auth/register` | POST | Generic pending-registration response; mail outbox |
| `/auth/verify-email` | POST | Token plus pending password proof; no automatic login |
| `/auth/resend-verification` | POST | Generic, throttled, supersedes previous verification |
| `/auth/login` | POST | Rotate HttpOnly session; active verified account only |
| `/auth/me` | GET | Current safe account projection |
| `/auth/sessions` | GET | Safe session metadata without digests/secrets |
| `/auth/sessions/:sessionId` | DELETE | Revoke own selected session |
| `/auth/logout`, `/auth/logout-all` | POST | Revoke current/all access; correctly scoped cookie clearing |
| `/auth/forgot-password`, `/auth/reset-password` | POST | Generic issuance; atomic single-use credential replacement |
| `/auth/change-password`, `/auth/reauthenticate` | POST | Password proof/recent-auth checks; revoke/rotate access |
| `/workspaces` | POST / GET | Verified actor; create/list only own authorized companies |
| `/workspaces/:workspaceId` | GET | Current workspace member/owner only |
| `/workspaces/:workspaceId/members` | GET | Current tenant membership; safe directory fields |
| `/workspaces/:workspaceId/members/:userId` | DELETE | Current owner removal policy; owner invariant |
| `/workspaces/:workspaceId/leave` | POST | Current member; owner transfers first |
| `/workspaces/:workspaceId/transfer-ownership` | POST | Current owner, recent password proof, verified existing member target |
| `/workspaces/:workspaceId/invitations` | POST / GET | Current owner; safe listing never exposes invite secrets |
| `/workspaces/:workspaceId/invitations/:invitationId` | DELETE | Current owner, scoped revocation |
| `/invitations/accept` | POST | Matching active verified account, single-use token |

## Verification gates

- Registration grants no authenticated access; verification cannot activate an attacker-selected password without its proof.
- Wrong Origin/CSRF, unknown fields, operator payloads and fake roles fail before domain changes.
- Cookies have the required flags/scope; tokens/digests/passwords never appear in safe API projections or jobs.
- Session expiry is enforced before TTL cleanup; reset/logout-all and credential-version changes invalidate existing access.
- Concurrent reset redemption has one winner; login based on older credentials cannot issue usable access after a committed reset.
- Company memberships and roles are independent; ID substitution and member-to-owner escalation fail.
- Owner transfer has exactly one owner, and membership/ownership quotas are exact under retries/concurrency.
- Invitation acceptance is recipient-bound, expires explicitly and does not double-count membership.
- Transactional outbox survives enqueue failures; duplicates never duplicate token redemption/membership effects.
- Frontend files and bindings are outside this slice. Passing backend tests is not proof of email deliverability or deployed ingress security.

## Remaining deployment/product decisions

SMTP provider/domain, production Mongo/Redis endpoints, secret key storage, independent recovery audit mirror, hashing/load measurements, deployment HTTPS ingress and the organization hierarchy remain explicit follow-up choices. The existing media-revocation/supervision proof is still an independent release gate; backend auth work cannot mark it passed. No service-level guarantee or production readiness is established by this initial slice.

## Progress evidence

- Planning checkpoint: `a2858c8`, committed and pushed before backend source edits.
- Final real HTTP/Mongo and primitive suite: 32 backend tests passed locally, plus five shared checks.
- Suspension/session/body-limit scenarios and pnpm/CI integration are included. Full `pnpm check` passed.
- Frontend code and connections remain unchanged. No Docker or real mail delivery was run.
- See [implemented API contract](../contracts/AUTH_AND_ROLES_API.md) for current behavior and remaining release gates.

Detailed local results and remaining release gates: [implementation evidence](AUTH_IMPLEMENTATION_EVIDENCE.md). Hosted commit status is available in GitHub Actions.
