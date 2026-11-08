# Credentials

Status: initial persistence implemented; remaining integration/lifecycle work planned · Updated: 2026-11-08 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Store backend-only password material and credential concurrency versions.

- Owning module: Auth.
- State location: MongoDB: credentials.
- Fields below describe the current stored model; interface additions and remaining work retain their stated planned status. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

Source: [owning model](../../../apps/api/src/modules/identity/identity.models.ts).

- `_id`
- `userId`
- `passwordHash (private projection)`
- `version`
- `accessFence`
- `changedAt`

Argon2id algorithm/parameters are encoded in passwordHash, not separate fields. Current hashing uses 19 MiB, two iterations and one lane with bounded concurrency; comprehensive compromised-password screening and host measurements remain CP04 work.

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

Library/parameters are implemented as recorded above. Complete compromised-password screening, target-host benchmarks and deployment verification under CP04.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
