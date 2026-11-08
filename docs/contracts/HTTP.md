# System HTTP API plan

Auth and company APIs are implemented in the initial backend. The [auth and roles reference](AUTH_AND_ROLES_API.md) defines their exact existing behavior. Proposed additions below belong to the [system backend implementation plan](../planning/BACKEND_SYSTEM_IMPLEMENTATION.md). Office events and media control have separate [Socket.IO](REALTIME.md) and [LiveKit](MEDIA.md) contracts.

## Shared contract

- Browser routes below have the `/api` prefix. Use same-origin HTTPS, the existing opaque host-only session cookie, private `no-store` responses, and session-bound CSRF, exact `APP_ORIGIN` and JSON for mutations. Anonymous auth bootstrap uses its existing bounded binding and required headers.
- Validate params, bodies and safe responses with strict Zod schemas from `packages/contracts`. Use opaque UUIDs, UTC ISO timestamps, explicit enum/range/size checks and allowlisted response fields. Resolve the actor from current server state and check the full resource parent chain before revealing tenant data.
- Preserve the existing `{ error: { code, message, requestId } }` response and status conventions. Use `400` for invalid input, `401` for invalid sessions, `403` for policy/Origin/CSRF denial, `404` for absent or mismatched scoped resources, `409` for state/version conflicts, `413` for oversized bodies, `415` for unsupported content type, `429` for throttling and `503` for unavailable authoritative dependencies. Keep enumeration-sensitive flows generic and use the existing `Retry-After` convention for throttling.
- Preserve existing idempotency requirements. For new durable commands, specify actor/tenant/operation key scope, request fingerprint and stable result on retry where required. Session/ticket/media secrets stay out of generic idempotency storage. Fresh ticket/grant retries are rate-limited and reauthorized. Audit security mutations with safe metadata.

## Existing response contracts

CP01 adds strict runtime schemas for the current auth/company projections in `packages/contracts/src/http/responses.ts` and safe current HTTP errors in `packages/contracts/src/errors.ts`. These are exported validation contracts exercised against real HTTP responses; the API has not gained an automatic response interceptor. Office routes/events below remain separate pending runtime work.

## Implemented routes

Paths are shown relative to `/api`. The linked reference supplies status codes, exact request shapes, CSRF bootstrap headers, token handling and idempotency rules. Implementation status describes available code. Hosted provider and deployed-origin checks remain in the [acceptance register](../planning/ACCEPTANCE.md).

| Method and path | Actor and operation |
| --- | --- |
| `GET /health/live` | Process liveness only |
| `GET /auth/csrf` | Safe anonymous or authenticated browser bootstrap |
| `POST /auth/register` | Pending account registration |
| `POST /auth/verify-email` | Single-use verification with pending password proof |
| `POST /auth/resend-verification` | Generic verification request and supersession |
| `POST /auth/forgot-password` | Generic recovery request |
| `POST /auth/reset-password` | One-use password reset and invalidation of old sessions |
| `POST /auth/login` | Verified active account, rotated session/CSRF |
| `GET /auth/me` | Current authenticated account |
| `GET /auth/sessions` | Current account's safe session list |
| `DELETE /auth/sessions/:sessionId` | Revoke one session owned by the actor |
| `POST /auth/logout` | Revoke current session |
| `POST /auth/logout-all` | Revoke account sessions and outstanding auth-token generations |
| `POST /auth/change-password` | Own account with recent proof |
| `POST /auth/reauthenticate` | Verify current password and rotate session/CSRF |
| `POST /auth/session/extend` | Explicit idle extension within absolute expiry |
| `POST /workspaces` | Verified active account creates a tenant, owner membership and office within quota |
| `GET /workspaces` | Current tenant memberships and independent roles |
| `GET /workspaces/:workspaceId` | Current member/owner reads selected company |
| `GET /workspaces/:workspaceId/members` | Current member/owner reads safe directory |
| `GET /workspaces/:workspaceId/invitations` | Current owner lists safe invitation metadata |
| `POST /workspaces/:workspaceId/invitations` | Current owner issues recipient-bound invitation through outbox |
| `DELETE /workspaces/:workspaceId/invitations/:invitationId` | Current owner revokes a scoped pending invitation |
| `POST /invitations/accept` | Matching verified recipient redeems an invitation once |
| `DELETE /workspaces/:workspaceId/members/:userId` | Current owner removes an active non-owner member |
| `POST /workspaces/:workspaceId/leave` | Current member leaves. Owner transfers first |
| `POST /workspaces/:workspaceId/transfer-ownership` | Current owner with recent proof transfers to an eligible existing member |

## Proposed MVP additions

| Stage | Method and path | Draft request/result | Authorization and behavior |
| --- | --- | --- | --- |
| M2 | `GET /workspaces/:workspaceId` | Add `officeId` to detail response | Current workspace member. Keep list/create contracts intact |
| M2 | `GET /workspaces/:workspaceId/offices/:officeId` | Return `{ officeId, workspaceId, mapVersion, protocolVersion, manifest }` | Scoped membership. Return `office_not_ready` for missing or unapproved map configuration |
| M2 | `POST /workspaces/:workspaceId/offices/:officeId/join-ticket` | `{ mapVersion, protocolVersion }` → `201 { ticket, expiresAt }` | Recheck current session and membership inside the write. 30-second maximum, one-use, bound to the office runtime epoch and active grant |
| M2 | `POST /workspaces/:workspaceId/offices/:officeId/join-ticket` takeover extension | Add explicit takeover intent and a short-lived server-issued reference identifying the participation to replace | Draft follow-on. Confirm the target is still the actor's current participation in this office and epoch at consume/reservation. Normal admission leaves an existing tab alone |
| M2 | `PATCH /auth/me/profile` | Strict nonempty subset of `{ displayName, appearance }`. Return updated safe profile | Actor updates only their account. Use a bounded display name and IDs from the approved appearance catalog. The office runtime publishes a safe projection to the actor's authorized office |
| M3 | `POST /conversations/:conversationId/media-token` | `{ participationId, conversationVersion }` → `200 { serverUrl, token, expiresAt, conversationVersion, generation }` | Check that the referenced live participation belongs to the same session and current conversation. Resolve tenant, generation, identity and publish sources server-side and install the exact current permit before signing. See [media contract](MEDIA.md) |
| M4 | `PATCH /workspaces/:workspaceId` | Proposed initial setting is `name`, with explicit revision and idempotency semantics | Current owner with recent proof and transaction-time policy check. Confirm settings scope under D13 before freezing this route |
| M5 | `GET /health/ready` | Minimal readiness status for ingress/operations | Restricted probing. Distinguish API/world readiness from media availability so a media outage does not create an unguarded route |

The [office admission plan](../planning/OFFICE_ADMISSION_IMPLEMENTATION.md) gives exact bootstrap and ticket implementation steps. The initial ticket schema stays small. Takeover extends it only when the realtime reservation and reauthorization behavior are ready. Session logout/rotation, password reset, account/workspace suspension and membership removal must feed the live revocation path once the runtime is active.

Company switching uses the existing workspace list and scoped requests, with the selected company explicit in the caller's context. D13 must define onboarding access, who can suspend/resume/close a company, export and retention before any operator or destructive endpoint is frozen. Account deletion and slug reuse also need a lifecycle decision. The customer owner role alone grants no operational access.

## Private interfaces and deferred surfaces

| Surface | Boundary |
| --- | --- |
| LiveKit webhook | Proposed private `POST /internal/media/livekit/webhook`. Validate the original raw body and LiveKit signature, deduplicate event IDs and use events for reconciliation only. Apply a dedicated machine-auth path and keep it outside the public Caddy routes |
| Guard and supervisor | Private machine-auth policy pull, installed-version acknowledgement and revoke/shutdown controls. Contract and failure behavior are in the [media plan](MEDIA.md) |
| Mail, jobs, audit | Transactional MongoDB outbox and restricted audit writes, stable BullMQ job IDs and private operational metrics/recovery. No generic browser CRUD for credentials, tokens, jobs, audit evidence or media permits |
| Static resources | Approved immutable map/asset versions are served through manifest references. Live presence, seats, meetings and conversations use [Socket.IO](REALTIME.md) |
| Deferred or conditional | Map override writes require D08. Asset uploads/editing, persistent chat/channels, calendars, desk assignment, billing, recording and enterprise identity have no MVP HTTP routes |

Before shipping a route, record owner, request/response schema, error and retry behavior, limit, applicable audit action and tests for success, invalid input, denied actor, crossed IDs and concurrent mutation where relevant. Use the [acceptance register](../planning/ACCEPTANCE.md) to record actual evidence.
