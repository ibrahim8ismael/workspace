# Meeting zones

Status: draft plan · Updated: 2026-11-05 · Target: M2 geometry; M4 interaction

## Responsibility

Represent fixed meeting areas with explicit admission and group media isolation.

- Owning module: Maps / Conversations.
- State location: Static map definitions; office policy if configurable; live membership in memory.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `zoneId`
- `mapVersionId`
- `bounds`
- `capacity`
- `accessPolicy`
- `officeId`
- `activeConversationId (transient)`

## Relationships

- [Map Versions](../map-versions/README.md)
- [Offices](../offices/README.md)
- [Participants](../participants/README.md)
- [Conversations](../conversations/README.md)

## Invariants and lifecycle

- Resolve zone→office→workspace relationships server-side.
- Provisional maximum six media participants per zone; serialized admission enforces capacity.
- Zone geometry alone never authorizes media membership.
- Private-zone conversation has isolated room generation; capacity edits cannot bypass admission.
- No custom zone editor in initial MVP.

## Interface outline

- meeting:join and meeting:leave.
- Server emits authoritative zone/conversation membership changes.

## Planning question

Define private-zone access UX and whether crossing a boundary prompts or joins; avoid implicit microphone activation.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
