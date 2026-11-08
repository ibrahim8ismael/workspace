# Memberships

Status: initial persistence implemented; remaining integration/lifecycle work planned · Updated: 2026-11-08 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Authorize a user inside one customer-company workspace with an owner or member role. The same global user may hold independent memberships in different companies; roles and access never carry between them.

- Owning module: Memberships.
- State location: MongoDB: memberships.
- Fields below describe the current stored model; interface additions and remaining work retain their stated planned status. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

Source: [owning model](../../../apps/api/src/modules/tenancy/tenancy.models.ts).

- `_id`
- `workspaceId`
- `userId`
- `role (owner, member)`
- `status (active, revoked)`
- `policyVersion`
- `joinedAt`

No revokedAt field is stored. Reactivation preserves _id and resets role/status/joinedAt; a rotating activation grant is planned under CP03 before ticket issuance. HTTP removal does not yet signal a live runtime; CP05 adds hints/leases.

## Relationships

- [Users](../users/README.md)
- [Workspaces](../workspaces/README.md)
- [Invitations](../invitations/README.md)
- [Participants](../participants/README.md)

## Invariants and lifecycle

- Unique (workspaceId, userId); role is server-assigned.
- Revocation and privileged mutation must contend through real conditional policy writes, including across awaits.
- Owner removal requires atomic transfer to an existing verified member.
- Removal updates counters once and invalidates office/conversation/media access.

## Interface outline

- GET /api/workspaces/:workspaceId/members.
- DELETE /api/workspaces/:workspaceId/members/:userId, POST .../leave and POST .../transfer-ownership are implemented with per-operation tenant/role rules.

## Planning question

Current recipient-bound reinvitation reactivates membership; directory exposes userId, displayName, role and joinedAt without email. Add stable activation-grant rotation in CP03 and live revocation in CP05.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
