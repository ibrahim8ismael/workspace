# Chat channels

Status: one built-in office channel only · Updated: 2026-11-10 · Target: CP06

## Responsibility

Provide the fixed company-wide `office` channel for the first messaging slice. Channel identity is resolved from the workspace and office route; there is no customer-managed channel collection or CRUD.

- Owning UI: supplied OpenOfficeForAll chat view.
- State location: one built-in channel projection; messages are persisted in `office_messages`.
- Direct messages, nearby chat, meeting channels and channel administration remain unimplemented.

## Runtime representation

The built-in channel is a UI projection (`id: office`, `name: office`), not a persisted channel record. Workspace and office IDs are resolved from the authorized route. Durable message rows own `workspaceId`, `officeId`, sender identity and retention timestamps.

## Relationships

- [Workspaces](../workspaces/README.md)
- [Offices](../offices/README.md)
- [Chat Messages](../chat-messages/README.md)

## Invariants and lifecycle

- Channel messages inherit active workspace membership and exact office scope.
- History retention is 90 days. See [chat messages](../chat-messages/README.md).

## Interface outline

- No channel CRUD endpoint exists. Message history/send routes use the scoped office API, and `chat:message` broadcasts to that admitted office room.

## Planning question

Additional channels require product rules for visibility, membership, permissions and retention before API work.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
