# Authentication tokens

Status: initial persistence implemented; remaining integration/lifecycle work planned · Updated: 2026-11-08 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Represent purpose-separated single-use email verification and password recovery capabilities.

- Owning module: Auth.
- State location: MongoDB: auth_tokens.
- Fields below describe the current stored model; interface additions and remaining work retain their stated planned status. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

Source: [owning model](../../../apps/api/src/modules/identity/identity.models.ts).

- `_id`
- `userId`
- `purpose (verify-email, reset-password)`
- `tokenDigest`
- `authVersion`
- `expiresAt`
- `consumedAt`
- `createdAt`

Supersession marks consumedAt rather than adding supersededAt. Worker emails contain codes/API instructions; browser token forms/routing and real delivery remain CP04 work.

## Relationships

- [Users](../users/README.md)
- [Credentials](../credentials/README.md)
- [Outbox](../outbox/README.md)
- [Sessions](../sessions/README.md)

## Invariants and lifecycle

- Digest is unique; token purpose and expiry are checked explicitly.
- Starting lifetimes: verification 24 hours, reset 15 minutes; resend supersedes older tokens.
- GET email links display forms; CSRF-protected POST performs redemption.
- Verification also proves pending password knowledge; alternatively mailbox recovery replaces it before activation.
- Recovery consumes token, replaces credentials and increments authVersion atomically; no automatic login.

## Interface outline

- POST /api/auth/verify-email, /resend-verification, /forgot-password, /reset-password.
- Return generic request responses to limit account enumeration.

## Planning question

Finalize recovery link routing and delivery provider while preserving no-store/no-referrer behavior.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
