# HTTP contract outline

Status: auth/company routes implemented; office/media routes remain proposed · Updated: 2026-11-05

The [implemented authentication and company roles guide](AUTH_AND_ROLES_API.md) is authoritative for the current backend route shapes, headers, validation and verification limits. The outline below retains future office/media work.

## Common behavior

One app origin via Caddy; JSON under `/api`. Shared TypeScript contracts include runtime validation (Zod recommended), allowlisted DTOs, explicit versioning and typed errors. Protected requests validate current session/account/tenant policy. State-changing requests require session-bound CSRF, exact Origin and JSON content type; anonymous auth flows use a bounded safe bootstrap. Private responses are `no-store`. Use configured trusted origins in recovery links.

Proposed error body: `{ error: { code, message, requestId, retryAfterMs? } }`. Do not expose account existence or internal exceptions. Map to appropriate HTTP statuses (401 missing/invalid session, 403 denied policy, 409 state/version conflict, 429 throttling); finalize exact semantics with runtime schemas. Durable commands accept a scoped idempotency key and return a stable result after unknown-commit reconciliation.

## Routes to specify

| Route family | Proposed operations | Authorization and behavior |
|---|---|---|
| `/api/auth/csrf` | GET bootstrap | Short-lived anonymous binding without authenticated access; preserve valid session; validate same-origin Fetch Metadata/custom header before setting cookie |
| `/api/auth/register` | POST email/password/display name | Pending account only; generic outcome policy, bounded hashing; transactional verification delivery |
| `/api/auth/verify-email` | POST verification proof | Single-use token plus pending-password knowledge; CSRF; no GET mutation |
| `/api/auth/resend-verification` | POST | Generic response; supersede old token; delivery rate budget |
| `/api/auth/login` | POST | Rotate cookie and CSRF; recheck credential/authVersion after verification |
| `/api/auth/me`, `/api/auth/sessions` | GET | Safe private account/session DTO; never return session digest or secret |
| `/api/auth/logout`, `/logout-all` | POST | Revoke current/all sessions and clear matching cookie scope |
| `/api/auth/forgot-password`, `/reset-password` | POST | Generic request; atomic credential replacement/token consume/version invalidation |
| `/api/auth/change-password`, `/reauthenticate` | POST | Recent password proof and rotation; concurrent credential guard |
| `/api/workspaces` | POST create; GET list | Verified active account; transactional quotas; return authorized tenants only |
| `/api/workspaces/:workspaceId` | GET; proposed owner update | Membership on read; owner policy/version check on mutation |
| `/api/workspaces/:workspaceId/members` | GET; proposed scoped leave/remove/transfer commands | Explicit permission matrix; atomic counters and one-owner invariant |
| `/api/workspaces/:workspaceId/invitations` | POST create; GET list; scoped revoke/accept commands TBD | Recipient binding; owner issuance; matching verified account accepts; no raw secrets in list |
| `/api/workspaces/:workspaceId/offices/:officeId` | GET bootstrap/map manifest | Validate full parent chain; map/protocol version, safe configuration only |
| `/api/workspaces/:workspaceId/offices/:officeId/join-ticket` | POST | Session/CSRF, membership, office epoch/version; 30-second single-use memory-only capability |
| `/api/conversations/:conversationId/media-token` | POST | Revalidate current participant/conversation generation; install permit first; no arbitrary room/identity |

Auth paths abbreviated in the table remain under `/api/auth`. Invitation acceptance URL/body shape, member commands, profile editing and session extension are still draft: freeze exact method/path/schema, error mapping and idempotency scope before implementing the corresponding slice.

## B2B company scope

The current workspace routes represent customer-company tenants under the recommended MVP mapping. A global user can list/switch among authorized companies, with independent roles. Client-selected company IDs never prove membership. Resolve D12 before freezing paths if an organization hierarchy is required; resolve D13 before implementing full customer onboarding. Customer roles do not authorize platform operations.

## Schema completion checklist

- Request shape, max sizes and allowed fields; no Mongo operators or arbitrary property spreads.
- Safe response fields; optional/nullable distinctions; opaque ID and UTC timestamp encodings.
- Current actor and tenant policy; conditional-write conflict records for sensitive mutation.
- CSRF bootstrap/rotation behavior, idempotency scope/retention and retry semantics.
- Rate/size budgets and anonymous enumeration behavior.
- Explicit error codes and frontend loading/denial/retry UX.

See [security](../security/README.md), [data model](../architecture/DATA_MODEL.md) and [realtime contracts](REALTIME.md).
