# Chat messages

Status: draft plan · Updated: 2026-11-05 · Target: Deferred

## Responsibility

Store future channel messages with authorized history access.

- Owning module: Unassigned until activated.
- State location: Proposed MongoDB collection; not scheduled.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `workspaceId`
- `channelId`
- `senderId`
- `body`
- `createdAt`
- `editedAt`
- `deletedAt`

## Relationships

- [Channels](../channels/README.md)
- [Users](../users/README.md)
- [Workspaces](../workspaces/README.md)

## Invariants and lifecycle

- Outside MVP; no model, API, queue or frontend feature is authorized by this planning entry.
- Must inherit tenant-scoped authorization and define privacy/retention before implementation.

## Interface outline

- No MVP endpoint or realtime event; upstream UI remains hidden until supported.

## Planning question

Choose retention, moderation and deletion; DMs require a separate conversation authorization design.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
