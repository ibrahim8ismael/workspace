# Workspaces

Status: draft plan · Updated: 2026-11-05 · Target: M1

## Responsibility

Define the customer-company tenant boundary for office configuration and collaboration. The recommended MVP mapping is one company per workspace, with one office. A parent organization owning multiple workspaces remains an open M0 decision; see the [B2B SaaS plan](../../product/B2B_SAAS.md).

- Owning module: Workspaces.
- State location: MongoDB: workspaces.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `name`
- `slug`
- `ownerId`
- `status`
- `policyVersion`
- `memberCount`
- `createdAt`
- `updatedAt`

## Relationships

- [Users](../users/README.md)
- [Memberships](../memberships/README.md)
- [Invitations](../invitations/README.md)
- [Offices](../offices/README.md)
- [Audit Events](../audit-events/README.md)

## Invariants and lifecycle

- One owner per workspace; ownerId and owner membership must agree transactionally.
- Creation establishes workspace, owner membership, office reference and ownedWorkspaceCount atomically.
- Provisional limits: 30 members/workspace and 3 owned workspaces/user; conditional counters enforce concurrency.
- Resource lookups include tenant scope; slug alone is never authorization.
- Customer ownership is separate from platform operations privileges. A user may have independent memberships in several customer tenants.
- Capacity quotas are provisional engineering limits, not commercial subscription entitlements.

## Interface outline

- POST /api/workspaces; GET /api/workspaces and /api/workspaces/:workspaceId.
- Proposed owner mutation routes require recent reauthentication and policy conflict checks.

## Planning question

Define archive/deletion lifecycle and slug reuse policy before adding destructive controls.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
