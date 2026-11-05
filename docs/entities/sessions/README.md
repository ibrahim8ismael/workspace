# Sessions

Status: draft plan · Updated: 2026-11-05 · Target: M1

## Responsibility

Authenticate browser requests using an opaque cookie and authoritative server state.

- Owning module: Auth.
- State location: MongoDB: sessions.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `tokenDigest`
- `userId`
- `issuedAuthVersion`
- `csrfBinding`
- `createdAt`
- `lastActivityAt`
- `absoluteExpiresAt`
- `idleExpiresAt`
- `revokedAt`
- `reauthenticatedAt`
- `version`

## Relationships

- [Users](../users/README.md)
- [Credentials](../credentials/README.md)
- [Join Tickets](../join-tickets/README.md)
- [Media Grants](../media-grants/README.md)

## Invariants and lifecycle

- Generate random 32-byte session secrets; persist only SHA-256 digest with unique index.
- Cookie: __Host-gather_session; Secure; HttpOnly; SameSite=Lax; Path=/; no Domain.
- Check expiry, account state and authVersion on protected calls; TTL deletion is cleanup only.
- Provisional limits: 12-hour absolute and 60-minute idle; passive heartbeat cannot extend idle expiry.
- Rotate session and CSRF binding on login/reauthentication; never expose session secret to JavaScript.

## Interface outline

- GET /api/auth/sessions; POST /api/auth/login, /logout, /logout-all, /reauthenticate.
- Socket authentication uses a separate one-use join ticket.

## Planning question

Finalize session extension UX and measurable authorization read policy before M1 completes.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
