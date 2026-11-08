# Users

Status: initial persistence implemented; remaining integration/lifecycle work planned · Updated: 2026-11-08 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Represent a person and account eligibility independently of workspace membership.

- Owning module: Users / Auth.
- State location: MongoDB: users.
- Fields below describe the current stored model; interface additions and remaining work retain their stated planned status. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

Source: [owning model](../../../apps/api/src/modules/identity/identity.models.ts).

- `_id`
- `normalizedEmail`
- `displayName`
- `status (pending, active, suspended)`
- `verifiedAt`
- `authVersion`
- `policyVersion`
- `ownedWorkspaceCount`
- `createdAt`

`updatedAt` and appearance are not stored. Registration display names are 2–80 characters; profile editing and deletion/retention remain planned under CP06/CP09.

## Relationships

- [Credentials](../credentials/README.md)
- [Sessions](../sessions/README.md)
- [Auth Tokens](../auth-tokens/README.md)
- [Memberships](../memberships/README.md)
- [Avatars](../avatars/README.md)
- [Workspaces](../workspaces/README.md)

## Invariants and lifecycle

- Unique normalized email; specify canonicalization without provider-specific dot/plus rewriting.
- Only verified active accounts may create workspaces, accept invitations or enter offices.
- Public participant projections expose display identity only; email and authVersion stay private.
- Suspension and credential recovery invalidate existing authorization; recovery cannot undo suspension.

## Interface outline

- GET /api/auth/me returns a safe private account DTO.
- Profile update contract is proposed; allow only display name and approved appearance fields.

## Planning question

Display-name limits are implemented; profile editing and account deletion/retention remain separate CP06/CP09 decisions before exposure.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
