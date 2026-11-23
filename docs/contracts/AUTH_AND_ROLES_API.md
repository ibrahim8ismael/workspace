# Authentication and company role APIs

Status: backend auth/company API with CP03 office admission · Updated: 2026-11-09. CP04.1 and CP04.2 connect browser onboarding, session security and current-company selection. Local/hosted verification results are recorded separately; this document is not production signoff.

## Runtime contract coverage (CP01, 2026-11-08)

Strict browser-safe response schemas for the existing account/workspace/member/invitation/session DTOs and response wrappers are exported from `packages/contracts/src/http/responses.ts`. Existing HTTP error codes and the exact safe envelope are exported from `packages/contracts/src/errors.ts`. Integration checks parse real responses; negative contract tests reject internal credentials/session/policy fields and raw exception content. This adds shared validation contracts without changing route behavior or installing a response interceptor.

## Browser/client contract

The prefix is `/api`. Authentication uses the opaque `__Host-gather_session` cookie (`Secure; HttpOnly; SameSite=Lax; Path=/`, no Domain). Registration also sets a separate seven-day `__Host-gather_pending_registration` proof cookie with the same attributes. Its server-side digest is tied to each pending user created by that browser; duplicate registration and resend keep generic responses and cannot claim another browser's pending account. Raw cookie secrets never appear in JSON. Non-browser test clients can maintain cookies explicitly; browser integration requires a suitable HTTPS/same-origin deployment. Loopback HTTPS onboarding/session flows are verified; public ingress/proxy and real delivery acceptance remain pending.

1. Request `GET /api/auth/csrf` with `Sec-Fetch-Site: same-origin` and `X-Requested-With: XMLHttpRequest`. An optional Origin must exactly match `APP_ORIGIN`. It returns `{ csrfToken }` and creates an anonymous cookie if needed. A valid existing session is preserved.
2. Every state-changing call sends `Content-Type: application/json`, exact `Origin: <APP_ORIGIN>`, the cookie, and `X-CSRF-Token: <csrfToken>`. Send `{}` for empty commands. Missing/wrong Origin or CSRF fails before domain changes.
3. Login and reauthentication rotate cookie and CSRF bindings. Use the returned CSRF token for subsequent mutations. GET `auth/csrf` can retrieve the binding of the current valid session without replacing its cookie.
4. Durable company commands (create workspace, invite/revoke, accept invitation, member removal/leave, owner transfer) require `Idempotency-Key`: 16–100 ASCII letters/digits/underscores/hyphens; UUIDs work. Reusing a key with different content fails with `idempotency_conflict`. Repeated results describe the original operation; they are never ongoing authorization evidence.

All private responses are no-store. Errors have `{ error: { code, message, requestId } }`; responses do not echo raw exception details or request payloads. Expect 400 for invalid DTOs/tokens, 401 for missing/stale authentication, 403 for CSRF/Origin/tenant denial, 404 for scoped absent resources, 409 for state/quota/idempotency conflicts, 413 for oversized bodies, 429 for budgets, and 503 for unavailable dependencies. JSON request bodies are limited to 4 KiB.

## Authentication routes

| Method/path | Input | Success |
|---|---|---|
| GET `/auth/csrf` | Safe bootstrap headers | 200 `{ csrfToken }` |
| POST `/auth/register` | `email`, `displayName`, `password` | 202 generic instructions; creates a pending account bound to this browser; no authenticated session |
| POST `/auth/verify-email` | `email`, six-digit `token` | 200 `{ account, csrfToken }`; consumes the code, verifies the bound account, and rotates to an authenticated session atomically |
| POST `/auth/resend-verification` | `email` | 202 generic instructions; only the browser holding that pending account's proof may resend after the 60-second cooldown |
| POST `/auth/forgot-password` | `email` | 202 generic instructions; unknown address indistinguishable in response |
| POST `/auth/reset-password` | `email`, six-digit `token`, `newPassword` | 200; all sessions invalidated, no automatic login |
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

Emails are trimmed/lowercased without provider-specific plus/dot rewriting. Newly issued verification and reset codes are six numeric digits generated by the system CSPRNG; leading zeroes are significant. Stored digests include account and purpose, so equal codes for different accounts or purposes do not collide. Verification expires after 30 minutes and reset codes after 15 minutes. A resend request inside the 60-second cooldown keeps the current code; accepted resends supersede it. Verification/reset attempts are limited per account and IP, in addition to existing request limits. Invitation codes are eight uppercase letters/digits from an alphabet that omits ambiguous characters; input ignores whitespace and letter case. Invites remain bound to the invited mailbox and workspace.

Rollout preserves already-issued 43-character verification, reset and invitation tokens until their original expiry. New issuance uses short codes only. Passwords are 15–128 characters with no trimming/truncation, limited byte size, known-common/repeated-value checks and Argon2id (19 MiB, two passes, one lane). The initial common-value list is not a comprehensive breached-password dataset; broader offline/provider-backed screening is a release gate. Tokens are purpose-bound digest records, explicitly expiring and transactionally consumed/superseded. Mailbox recovery can activate a pending account only by replacing its credential; suspension and revoked memberships are preserved.

Sessions start at 12 hours absolute/60 minutes idle. Passive heartbeat does not extend access. Explicit extension does not cross absolute expiry. Recent password proof lasts ten minutes for password change and owner transfer. Account status/authVersion, revocation and expiry are checked on protected requests; no authoritative Redis session cache exists.

## Company routes and permissions

A workspace is the current MVP company boundary. The owner accepted one company/workspace/office for MVP on 2026-11-08 (D12); a future organization hierarchy requires a separate scope/migration decision. Each membership has `owner`, `admin` or `member` and independent active/revoked status. Roles are scoped to one workspace; a customer owner has no platform operations privileges.

| Method/path | Input | Permission / success |
|---|---|---|
| POST `/workspaces` | `name`, `slug`, optional `roomCount` (1–100) | Verified active account; 201 `{ workspace }`, initial owner + selected office map. The current web form submits its five-room default; omitted values keep the existing Vivo layout for older clients. |
| GET `/workspaces` | — | Current memberships; 200 `{ workspaces }` (bounded list) |
| GET `/workspaces/:workspaceId` | UUID | Current member/owner; 200 `{ workspace }` including `officeId`, `revision`, and `roomCount` |
| PATCH `/workspaces/:workspaceId` | `name`, `expectedRevision` | Current owner; tenant-scoped rename with revision conflict and required idempotency key |
| PATCH `/workspaces/:workspaceId/offices/:officeId/rooms` | `roomCount`, `expectedRevision` | Current owner; revision-safe generated map update; rejects while office participants are connected |
| GET `/workspaces/:workspaceId/members` | UUID | Current member/owner; safe names, IDs and roles |
| PATCH `/workspaces/:workspaceId/members/:userId/role` | `role: admin\|member` | Current owner with recent password proof when granting Admin; audited, idempotent role transition |
| POST `/workspaces/:workspaceId/invitations` | `email` | Current owner or admin; 201 safe invitation metadata; code sent through outbox |
| GET `/workspaces/:workspaceId/invitations` | UUID | Current owner or admin; safe metadata/status, never token/digest |
| DELETE `/workspaces/:workspaceId/invitations/:invitationId` | JSON `{}` | Current owner or admin; revoke pending invite |
| POST `/invitations/accept` | `token` | Matching verified mailbox; atomically consume/create or reactivate membership |
| DELETE `/workspaces/:workspaceId/members/:userId` | JSON `{}` | Owner removes Admins or Members; Admin removes ordinary Members; Owner and other Admins are protected |
| POST `/workspaces/:workspaceId/leave` | `{}` | Current admin/member; Owner transfers first |
| POST `/workspaces/:workspaceId/transfer-ownership` | `userId` | Current owner, recent password proof, existing active verified Admin or Member target |

Both the HTTP guard and transactional service methods enforce roles. Owner-only workspace rename, office room configuration, role assignment and ownership transfer remain Owner-only. Admins cannot grant or manage Owner/Admin privileges. Ordinary Members can read workspace/member data, enter the office, use normal chat and leave; they cannot manage invitations or other memberships. Role changes rotate the target `membershipGrantId` and increment its policy version so previous office admission grants cannot be replayed.

Workspace create/list DTO remains `{ id, name, slug, role, memberCount }`. Detail adds `officeId`, `revision`, and `roomCount`. Workspace rename preserves its stable ID and slug. Each generated room has a stable index-based ID; the count and deterministic geometry hash form the workspace map version. Existing static workspaces keep their current map until an owner changes the room count. Member projection excludes email/credentials. Unknown fields—including role/status/ownerId overrides—are rejected. UUID path substitution does not bypass tenant policy.

Selected initial quotas: three owned companies per user, 30 members per company, 50 pending invites per company, seven-day invite expiry. Invitations do not reserve member slots. Counters and membership/owner changes share a transaction; retries do not increment twice. Role and ownership changes serialize on workspace policy; role transitions are idempotent and audit the before/after role. Ownership changes atomically update membership roles and ownership counters. Room-count updates fence office admission, require an empty office runtime, and persist the new generated map version transactionally. A room-count update changes only the selected workspace. Static Vivo/Commons workspaces are preserved until an owner explicitly selects a room count.

## Persistence, indexes and delivery

Collections: `users`, `credentials`, `sessions`, `auth_tokens`, `rate_limits`, `workspaces`, `memberships`, `invitations`, `offices`, `operations`, `audit_events`, `outbox`, `office_join_tickets`. Durable identities use opaque UUIDs. Unique indexes enforce email, credentials/user, session/token/invite digests, workspace slug, workspace/user membership and one office reference per workspace. Startup validates the exact unique key shapes and rejects sparse/partial or compound substitutes. Owner uniqueness is maintained by serialized transactional policy writes and verified after transfer; it is not a uniqueness-index swap between role records.

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
