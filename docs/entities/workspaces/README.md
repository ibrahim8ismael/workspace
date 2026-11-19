# Workspaces

Status: owner/member settings and configurable room-count maps implemented; archive/offboarding lifecycle remains separate · Updated: 2026-11-19 · Target: pilot


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Define the customer-company tenant boundary for office configuration and collaboration. The owner accepted one company/workspace/office for MVP on 2026-11-08. A future parent organization/multiple-workspace hierarchy requires a separate decision; see the [B2B SaaS plan](../../product/B2B_SAAS.md).

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
- `revision` (monotonic settings revision; defaults to 0 for existing records)
- `memberCount`
- `createdAt`

No updatedAt/closed/archive field or lifecycle endpoint exists. Three owned workspaces/user and thirty members/workspace are implemented starting quotas, not measured capacity or commercial entitlements. The office record stores its immutable `mapVersion`; generated workspace map versions encode the selected 1–100 room count and deterministic geometry hash. The detail API projects the current count without storing duplicate room-count state.

## Relationships

- [Users](../users/README.md)
- [Memberships](../memberships/README.md)
- [Invitations](../invitations/README.md)
- [Offices](../offices/README.md)
- [Audit Events](../audit-events/README.md)

## Invariants and lifecycle

- One owner per workspace; ownerId and owner membership must agree transactionally.
- Creation establishes workspace, owner membership, selected office map, office reference and ownedWorkspaceCount atomically. The current web form submits five rooms by default; legacy API clients that omit `roomCount` retain the established Vivo layout.
- Renaming keeps the workspace ID and slug stable. Owner mutations compare an expected settings revision and use scoped idempotency records.
- Room-count changes are owner-only, preserve index-based IDs for retained rooms, fence office admission, and require an empty runtime so every client uses the same collision and rendered geometry. Existing static layouts remain until an owner changes the count.
- Member views show only the safe member projection and can leave after confirmation. Owners use existing invite/revoke/remove/transfer operations from Space settings; transfer retains the recent-password proof requirement.
- Provisional limits: 30 members/workspace and 3 owned workspaces/user; conditional counters enforce concurrency.
- Resource lookups include tenant scope; slug alone is never authorization.
- Customer ownership is separate from platform operations privileges. A user may have independent memberships in several customer tenants.
- Capacity quotas are provisional engineering limits, not commercial subscription entitlements.

## Interface outline

- POST /api/workspaces; GET /api/workspaces and /api/workspaces/:workspaceId; PATCH `/api/workspaces/:workspaceId` for revision-safe name updates.
- PATCH `/api/workspaces/:workspaceId/offices/:officeId/rooms` updates generated room count for the selected workspace only.
- `/companies/:workspaceId/settings` is the member and owner settings surface; Account security remains separate.

## Planning question

Define archive/deletion lifecycle and slug reuse policy before adding destructive controls.

## Next work

See [implementation plan](PLAN.md), [API contract](../../contracts/AUTH_AND_ROLES_API.md), [HTTP routes](../../contracts/HTTP.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
