# Users

Status: draft plan · Updated: 2026-11-05 · Target: M1

## Responsibility

Represent a person and account eligibility independently of workspace membership.

- Owning module: Users / Auth.
- State location: MongoDB: users.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `normalizedEmail`
- `displayName`
- `verifiedAt`
- `status (pending, active, suspended)`
- `authVersion`
- `policyVersion`
- `ownedWorkspaceCount`
- `createdAt`
- `updatedAt`

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

Choose display-name limits and account deletion/retention behavior before exposing deletion.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
