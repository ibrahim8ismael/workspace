# Memberships

Status: draft plan · Updated: 2026-11-05 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Authorize a user inside one customer-company workspace with an owner or member role. The same global user may hold independent memberships in different companies; roles and access never carry between them.

- Owning module: Memberships.
- State location: MongoDB: memberships.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `workspaceId`
- `userId`
- `role (owner, member)`
- `status`
- `policyVersion`
- `joinedAt`
- `revokedAt`

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
- Proposed member removal, leave and owner-transfer commands are tenant scoped; role rules apply per operation.

## Planning question

Specify reinvitation/reactivation semantics and restricted member-directory fields.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
