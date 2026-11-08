# Sessions

Status: initial persistence implemented; remaining integration/lifecycle work planned · Updated: 2026-11-08 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Authenticate browser requests using an opaque cookie and authoritative server state.

- Owning module: Auth.
- State location: MongoDB: sessions.
- Fields below describe the current stored model; interface additions and remaining work retain their stated planned status. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

Source: [owning model](../../../apps/api/src/modules/identity/identity.models.ts).

- `_id`
- `tokenDigest (private projection)`
- `csrfSecret (private projection)`
- `kind (anonymous, authenticated)`
- `userId (nullable for anonymous)`
- `authVersion`
- `version`
- `createdAt`
- `absoluteExpiresAt`
- `idleExpiresAt`
- `revokedAt`
- `reauthenticatedAt`

`authVersion`/`csrfSecret` are the implemented equivalents of issuedAuthVersion/csrfBinding. There is no lastActivityAt; explicit extension changes idleExpiresAt. Recent proof lasts ten minutes. Browser session UX and live invalidation remain CP04/CP05 work.

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
