# Authentication tokens

Status: draft plan · Updated: 2026-11-05 · Target: M1

## Responsibility

Represent purpose-separated single-use email verification and password recovery capabilities.

- Owning module: Auth.
- State location: MongoDB: auth_tokens.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `userId`
- `purpose`
- `tokenDigest`
- `issuedAuthVersion`
- `expiresAt`
- `consumedAt`
- `supersededAt`
- `createdAt`

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
