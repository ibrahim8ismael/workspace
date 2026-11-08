# Authentication and company role APIs

Status: initial backend implementation · Updated: 2026-11-06. Frontend integration is outside this change. Local/hosted verification results are recorded separately; this document is not production signoff.

## Runtime contract coverage (CP01, 2026-11-08)

Strict browser-safe response schemas for the existing account/workspace/member/invitation/session DTOs and response wrappers are exported from `packages/contracts/src/http/responses.ts`. Existing HTTP error codes and the exact safe envelope are exported from `packages/contracts/src/errors.ts`. Integration checks parse real responses; negative contract tests reject internal credentials/session/policy fields and raw exception content. This adds shared validation contracts without changing route behavior or installing a response interceptor.

## Browser/client contract

The prefix is `/api`. Authentication uses only the opaque `__Host-gather_session` cookie (`Secure; HttpOnly; SameSite=Lax; Path=/`, no Domain). Raw session secrets never appear in JSON. Non-browser test clients can maintain the cookie explicitly; browser integration requires a suitable HTTPS/same-origin deployment and remains future work.

1. Request `GET /api/auth/csrf` with `Sec-Fetch-Site: same-origin` and `X-Requested-With: XMLHttpRequest`. An optional Origin must exactly match `APP_ORIGIN`. It returns `{ csrfToken }` and creates an anonymous cookie if needed. A valid existing session is preserved.
2. Every state-changing call sends `Content-Type: application/json`, exact `Origin: <APP_ORIGIN>`, the cookie, and `X-CSRF-Token: <csrfToken>`. Send `{}` for empty commands. Missing/wrong Origin or CSRF fails before domain changes.
3. Login and reauthentication rotate cookie and CSRF bindings. Use the returned CSRF token for subsequent mutations. GET `auth/csrf` can retrieve the binding of the current valid session without replacing its cookie.
4. Durable company commands (create workspace, invite/revoke, accept invitation, member removal/leave, owner transfer) require `Idempotency-Key`: 16–100 ASCII letters/digits/underscores/hyphens; UUIDs work. Reusing a key with different content fails with `idempotency_conflict`. Repeated results describe the original operation; they are never ongoing authorization evidence.

All private responses are no-store. Errors have `{ error: { code, message, requestId } }`; responses do not echo raw exception details or request payloads. Expect 400 for invalid DTOs/tokens, 401 for missing/stale authentication, 403 for CSRF/Origin/tenant denial, 404 for scoped absent resources, 409 for state/quota/idempotency conflicts, 413 for oversized bodies, 429 for budgets, and 503 for unavailable dependencies. JSON request bodies are limited to 4 KiB.

## Authentication routes

| Method/path | Input | Success |
|---|---|---|
| GET `/auth/csrf` | Safe bootstrap headers | 200 `{ csrfToken }` |
| POST `/auth/register` | `email`, `displayName`, `password` | 202 generic instructions; pending account, no authenticated session |
| POST `/auth/verify-email` | `token`, original pending `password` | 200 verified; sign in separately |
| POST `/auth/resend-verification` | `email` | 202 generic instructions; previous verification superseded |
| POST `/auth/forgot-password` | `email` | 202 generic instructions; unknown address indistinguishable in response |
| POST `/auth/reset-password` | `token`, `newPassword` | 200; all sessions invalidated, no automatic login |
| POST `/auth/login` | `email`, `password` | 200 `{ account, csrfToken }` and rotated cookie |
| GET `/auth/me` | Authenticated cookie | 200 safe `{ account }` |
| GET `/auth/sessions` | Authenticated cookie | 200 safe `{ sessions }` metadata |
| DELETE `/auth/sessions/:sessionId` | Own session UUID, JSON `{}` | 200 revoked; clear cookie if current session |
| POST `/auth/logout` | `{}` | 200 revoke current session, clear cookie |
| POST `/auth/logout-all` | `{}` | 200 invalidate all sessions and outstanding auth-token generations |
| POST `/auth/change-password` | `currentPassword`, `newPassword` | 200 revoke access; sign in again; recent proof required |
| POST `/auth/reauthenticate` | `password` | 200 rotated cookie and `{ account, csrfToken }` |
| POST `/auth/session/extend` | `{}` | 200 explicit idle extension bounded by absolute expiry |

Account DTO: `{ id, email, displayName, verifiedAt }`. Session metadata: `{ id, current, createdAt, absoluteExpiresAt, idleExpiresAt }`. Roles are not global account properties.

Emails are trimmed/lowercased without provider-specific plus/dot rewriting. Passwords are 15–128 characters with no trimming/truncation, limited byte size, known-common/repeated-value checks and Argon2id (19 MiB, two passes, one lane). The initial common-value list is not a comprehensive breached-password dataset; broader offline/provider-backed screening is a release gate. Verification lasts 24 hours; reset 15 minutes. Tokens are purpose-bound digest records, explicitly expiring and transactionally consumed/superseded. Mailbox recovery can activate a pending account only by replacing its credential; suspension and revoked memberships are preserved.

Sessions start at 12 hours absolute/60 minutes idle. Passive heartbeat does not extend access. Explicit extension does not cross absolute expiry. Recent password proof lasts ten minutes for password change and owner transfer. Account status/authVersion, revocation and expiry are checked on protected requests; no authoritative Redis session cache exists.

## Company routes and permissions

A workspace is the current MVP company boundary. An explicit organization hierarchy remains open. Each membership has `owner` or `member` and independent active/revoked status. A customer owner has no platform operations privileges.

| Method/path | Input | Permission / success |
|---|---|---|
| POST `/workspaces` | `name`, `slug` | Verified active account; 201 `{ workspace }`, initial owner + office reference |
| GET `/workspaces` | — | Current memberships; 200 `{ workspaces }` (bounded list) |
| GET `/workspaces/:workspaceId` | UUID | Current member/owner; 200 `{ workspace }` |
| GET `/workspaces/:workspaceId/members` | UUID | Current member/owner; safe names, IDs and roles |
| POST `/workspaces/:workspaceId/invitations` | `email` | Current owner; 201 safe invitation metadata; code sent through outbox |
| GET `/workspaces/:workspaceId/invitations` | UUID | Current owner; safe metadata/status, never token/digest |
| DELETE `/workspaces/:workspaceId/invitations/:invitationId` | JSON `{}` | Current owner; revoke pending invite |
| POST `/invitations/accept` | `token` | Matching verified mailbox; atomically consume/create or reactivate membership |
| DELETE `/workspaces/:workspaceId/members/:userId` | JSON `{}` | Current owner; owner cannot be removed through this path |
| POST `/workspaces/:workspaceId/leave` | `{}` | Current member; owner transfers first |
| POST `/workspaces/:workspaceId/transfer-ownership` | `userId` | Current owner, recent password proof, existing active verified member target |

Workspace DTO: `{ id, name, slug, role, memberCount }`. Member projection excludes email/credentials. Unknown fields—including role/status/ownerId overrides—are rejected. UUID path substitution does not bypass tenant policy.

Selected initial quotas: three owned companies per user, 30 members per company, 50 pending invites per company, seven-day invite expiry. Invitations do not reserve member slots. Counters and membership/owner changes share a transaction; retries do not increment twice. Ownership changes serialize on workspace policy and atomically change both membership roles and ownership counters. The created office is a reference with `pending-m0` map version; no office/runtime/media API is implemented by this slice.

## Persistence, indexes and delivery

Collections: `users`, `credentials`, `sessions`, `auth_tokens`, `rate_limits`, `workspaces`, `memberships`, `invitations`, `offices`, `operations`, `audit_events`, `outbox`. Durable identities use opaque UUIDs. Unique indexes enforce email, credentials/user, session/token/invite digests, workspace slug, workspace/user membership and one office reference per workspace. Startup validates the exact unique key shapes and rejects sparse/partial or compound substitutes. Owner uniqueness is maintained by serialized transactional policy writes and verified after transfer; it is not a uniqueness-index swap between role records.

Sensitive mutations revalidate and make real conditional writes to current session/user/membership/workspace records inside snapshot transactions with majority writes. Concurrent reset/removal/transfer conflicts with the same records, so an earlier allow decision is insufficient. TTL is cleanup only. Admission/session reads use bounded primary linearizable checks where required. Driver transaction handling retries conflicts and reconciles commit outcomes; scoped operation records make durable command retry outcomes stable.

Business mutations and encrypted expiring mail outbox records commit together. BullMQ jobs carry outbox IDs only. The separately configured worker sends plain-text codes with backend instructions, not frontend links, and purges encrypted payloads on delivery/expiry. Duplicate delivery remains possible after ambiguous acknowledgement; credentials/invitations stay single-use. Application security audit records commit with mutations; independent recovery mirroring remains pending.

MongoDB-backed budgets cover global/IP/authenticated-user HTTP traffic, anonymous CSRF state, registration/login/recovery/resend and company/invitation creation. Login permits five attempts per normalized account per 15-minute window (including successes); most mail requests permit three/account/hour. IP/global caps and bounded hash concurrency are additional controls. Forwarded headers are not trusted by default. Reverse-proxy deployment needs an explicitly reviewed sanitized-header policy before changing that setting.

## Manual backend requests

Configure the database/key and provision indexes first. Use an HTTP client that supports the Secure cookie contract (or explicitly attach the cookie in a local backend test client). No frontend adapter is necessary.

```sh
# APP_ORIGIN must match the server configuration. Keep returned cookie/CSRF values private.
curl -i http://localhost:3000/api/auth/csrf \
  -H 'Origin: http://localhost:5173' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'X-Requested-With: XMLHttpRequest'

# Replace placeholders in your private API client; never commit real credentials/cookies.
curl http://localhost:3000/api/auth/register \
  -H 'Origin: http://localhost:5173' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: __Host-gather_session=<private-cookie>' \
  -H 'X-CSRF-Token: <private-csrf-token>' \
  --data '{"email":"person@example.com","displayName":"Example Person","password":"<your-long-unique-password>"}'
```

The mail worker requires real SMTP/queue configuration to deliver the verification code. Tests inspect encrypted fixture messages internally; there is no debug token HTTP endpoint.

## Verification and remaining release gates

The backend tests exercise real NestJS HTTP and a temporary MongoDB replica set, cookie/CSRF policy, pending-account takeover/recovery, token/session expiry, concurrent reset and stale login, role/tenant isolation, idempotent retries, owner/capacity races and encrypted outbox behavior. SMTP delivery is substituted with a fake sender; no actual external mail, queue service, frontend or Docker is run by the suite. Configuration is described in [API](../../apps/api/README.md) and [worker](../../apps/worker/README.md) setup guides.

Before pilot release: configure and verify real SMTP delivery and persistent queue behavior; establish the independent security recovery/audit mirror and restore drill; choose broader compromised-password screening; measure hash/HTTP budgets on target hardware; validate deployed HTTPS/CSRF/proxy behavior; and complete the separate media supervision/office authorization gates. Passing local backend tests does not establish those results.

The Argon2 configuration meets the referenced [OWASP minimum profile](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html); deployment costs still require measurement. Transaction ordering follows the [MongoDB transaction contract](https://www.mongodb.com/docs/manual/core/transactions/) and avoids [parallel operations within one Mongoose transaction](https://mongoosejs.com/docs/transactions.html).
