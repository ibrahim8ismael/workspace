# Outbox events

Status: draft plan · Updated: 2026-11-05 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Commit required asynchronous delivery with its business mutation.

- Owning module: Jobs / domain services.
- State location: MongoDB: outbox.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `eventId`
- `operationId`
- `eventType`
- `aggregateId`
- `workspaceId if scoped`
- `state`
- `attempts`
- `availableAt`
- `expiresAt`
- `encryptedSecretPayload`
- `encryptionKeyVersion`
- `deliveredAt`

## Relationships

- [Auth Tokens](../auth-tokens/README.md)
- [Invitations](../invitations/README.md)
- [Jobs](../jobs/README.md)
- [Audit Events](../audit-events/README.md)

## Invariants and lifecycle

- Business mutation and outbox insert share one transaction.
- Dispatcher uses stable job IDs; unknown commit outcomes reconcile by operation/event ID.
- Queue contains IDs only; email secrets are encrypted with restricted keys and purged on delivery/expiry.
- Duplicate external email is possible after ambiguous delivery; token redemption remains single-use.
- Urgent revocation and world movement never wait on outbox.

## Interface outline

- Internal dispatcher/worker interfaces only.
- Owner-facing delivery status must use safe fields and avoid secret payloads.

## Planning question

Choose encryption-key storage and email provider; define retention for delivery metadata.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
