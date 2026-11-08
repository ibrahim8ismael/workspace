# Avatars

Status: draft plan · Updated: 2026-11-05 · Target: M0–M2

## Responsibility

Describe basic avatar appearance independently of live position and account secrets.

- Owning module: Users / web world.
- State location: Allowlisted appearance in users; textures in static assets.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `userId`
- `appearanceVersion`
- `bodyId`
- `paletteId`
- `optional approved accessory IDs`
- `animation mapping`
- `foot anchor`

## Relationships

- [Users](../users/README.md)
- [Assets](../assets/README.md)
- [Participants](../participants/README.md)

## Invariants and lifecycle

- Appearance references approved static IDs; no user image upload in MVP.
- Persist appearance as a user subdocument by default, not a separate collection.
- Phaser owns animation; React owns accessible selection controls.
- Safe public appearance DTO excludes user email and credentials.

CP01 exports compact bodyId/paletteId shape validation and strict nonempty profile input. Approved IDs/catalog, persistence, endpoint and rendering remain CP02/CP06 work.

## Interface outline

- Proposed allowlisted profile appearance update.
- Participant snapshots carry display name and appearance IDs only.

## Planning question

Choose the smallest cleared appearance set for the first two-user slice.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
