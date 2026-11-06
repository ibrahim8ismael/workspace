# Invitations

Status: draft plan · Updated: 2026-11-05 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Invite a specific verified mailbox to one workspace.

- Owning module: Invitations.
- State location: MongoDB: invitations.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `workspaceId`
- `intendedNormalizedEmail`
- `tokenDigest`
- `createdBy`
- `expiresAt`
- `acceptedAt`
- `acceptedBy`
- `revokedAt`
- `operationId`

## Relationships

- [Workspaces](../workspaces/README.md)
- [Memberships](../memberships/README.md)
- [Users](../users/README.md)
- [Outbox](../outbox/README.md)

## Invariants and lifecycle

- Recipient-bound single-use random capability; persist only digest.
- Historical seven-day expiry is a proposed carry-forward default, subject to confirmation.
- Accept only with matching verified active account and current workspace policy.
- Consume invite, create/reactivate membership and increment count in one transaction; idempotent retries return the same outcome.
- Secrets stay outside URLs in logs, queue bodies and workspace listings.

## Interface outline

- Proposed POST/GET /api/workspaces/:workspaceId/invitations; POST invitation accept/revoke commands.
- Acceptance identifies the invite capability but resolves tenant and recipient on the server.

## Planning question

Finalize invite lifetime and pending-invite quotas; define whether capacity is reserved before acceptance.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
