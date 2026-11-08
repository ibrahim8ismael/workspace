# Workspaces

Status: initial persistence implemented; remaining integration/lifecycle work planned · Updated: 2026-11-08 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Define the customer-company tenant boundary for office configuration and collaboration. The recommended MVP mapping is one company per workspace, with one office. A parent organization owning multiple workspaces remains an open M0 decision; see the [B2B SaaS plan](../../product/B2B_SAAS.md).

- Owning module: Workspaces.
- State location: MongoDB: workspaces.
- Fields below describe the current stored model; interface additions and remaining work retain their stated planned status. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

Source: [owning model](../../../apps/api/src/modules/tenancy/tenancy.models.ts).

- `_id`
- `name`
- `slug`
- `ownerId`
- `status (active, suspended)`
- `policyVersion`
- `memberCount`
- `createdAt`

No updatedAt/closed/archive field or lifecycle endpoint exists. Three owned workspaces/user and thirty members/workspace are implemented starting quotas, not measured capacity or commercial entitlements. D12/D13 remain open; company UI/settings/lifecycle are CP04/CP09 work.

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
- Existing ownership transfer requires recent password proof and transactional policy checks. Additional settings/lifecycle routes remain planned and require their own contract.

## Planning question

Define archive/deletion lifecycle and slug reuse policy before adding destructive controls.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
