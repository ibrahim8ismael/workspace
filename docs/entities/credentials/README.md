# Credentials

Status: draft plan · Updated: 2026-11-05 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Store backend-only password material and credential concurrency versions.

- Owning module: Auth.
- State location: MongoDB: credentials.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `userId`
- `passwordHash`
- `hashAlgorithm`
- `hashParameters`
- `credentialVersion`
- `changedAt`

## Relationships

- [Users](../users/README.md)
- [Sessions](../sessions/README.md)
- [Auth Tokens](../auth-tokens/README.md)

## Invariants and lifecycle

- Unique userId; hashes never appear in API responses, sockets, logs or jobs.
- Use maintained Argon2id implementation; choose parameters by current guidance and deployment benchmark.
- Password change/reset and authVersion invalidation commit atomically.
- Session issuance must recheck the credential version used for password verification.

## Interface outline

- POST /api/auth/register, /login, /change-password, /reauthenticate.
- Credential records have no general CRUD endpoint.

## Planning question

Select library, exact hashing parameters and breached-password source during M0/M1.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
