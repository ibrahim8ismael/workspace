# Invitations

Status: API and account UI integration implemented; real provider/release checks remain · Updated: 2026-11-10 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Invite a specific verified mailbox to one workspace.

- Owning module: Invitations.
- State location: MongoDB: invitations.
- Fields below describe the current stored model; interface additions and remaining work retain their stated planned status. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

Source: [owning model](../../../apps/api/src/modules/tenancy/tenancy.models.ts).

- `_id`
- `workspaceId`
- `email`
- `tokenDigest`
- `createdBy`
- `expiresAt`
- `consumedAt`
- `acceptedBy`
- `revokedAt`
- `createdAt`

`email` and `consumedAt` implement the proposed intendedNormalizedEmail/acceptedAt concepts. Durable command idempotency is in operations, not an invitation operationId field. Current defaults are seven-day expiry, fifty pending invites and no slot reservation. The account UI supports member code acceptance. Owner invitation listing, creation and revocation were removed from the active UI by owner request on 2026-11-10; their API and unmounted component remain. Local browser evidence uses Mailpit; external-provider delivery and outage acceptance remain separate.

## Relationships

- [Workspaces](../workspaces/README.md)
- [Memberships](../memberships/README.md)
- [Users](../users/README.md)
- [Outbox](../outbox/README.md)

## Invariants and lifecycle

- Recipient-bound single-use random capability; persist only digest.
- Current expiry is seven days; pending quota is fifty/workspace; invitations do not reserve member slots.
- Accept only with matching verified active account and current workspace policy.
- Consume invite, create/reactivate membership and increment count in one transaction; idempotent retries return the same outcome.
- Secrets stay outside URLs in logs, queue bodies and workspace listings.

## Interface outline

- POST/GET /api/workspaces/:workspaceId/invitations; POST /api/invitations/accept; DELETE /api/workspaces/:workspaceId/invitations/:invitationId.
- Acceptance identifies the invite capability but resolves tenant and recipient on the server.

## Planning question

Current lifetime/quota/reservation behavior is recorded above. Member invitation acceptance is integrated; the owner panel is deliberately unmounted; verify real provider delivery and outage behavior under the remaining CP04 work.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
