# Chat channels

Status: draft plan · Updated: 2026-11-05 · Target: Deferred

## Responsibility

Group future persistent messaging by workspace or office.

- Owning module: Unassigned until activated.
- State location: Proposed MongoDB collection; not scheduled.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `id`
- `workspaceId`
- `officeId optional`
- `kind`
- `name`
- `policyVersion`

## Relationships

- [Workspaces](../workspaces/README.md)
- [Offices](../offices/README.md)
- [Chat Messages](../chat-messages/README.md)

## Invariants and lifecycle

- Outside MVP; no model, API, queue or frontend feature is authorized by this planning entry.
- Must inherit tenant-scoped authorization and define privacy/retention before implementation.

## Interface outline

- No MVP endpoint or realtime event; upstream UI remains hidden until supported.

## Planning question

Choose visibility, membership and retention before designing endpoints.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
