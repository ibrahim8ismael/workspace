# Meeting zones

Status: trusted static zone authority and explicit group admission deployed in v3; live fixed-meeting audio/revocation acceptance pending · Updated: 2026-11-17

## Responsibility

Represent fixed meeting areas with explicit server-authorized group admission and media isolation.

- Owning module: Maps / Conversations.
- State location: Versioned trusted static map geometry; live meeting membership and generations in the single office runtime.
- The browser receives the trusted zone projection for display but cannot establish zone membership. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `zoneId`, `mapVersion`, tile rectangle and tile size
- `workspaceId`, `officeId`, office epoch
- transient conversation ID/version, member set, generation and lifecycle
- fixed capacity of twenty; office occupancy remains independently capped at twenty

## Relationships

- [Map Versions](../map-versions/README.md)
- [Offices](../offices/README.md)
- [Participants](../participants/README.md)
- [Conversations](../conversations/README.md)

## Invariants and lifecycle

- The API uses the trusted map version installed for the office; it derives zone bounds and does not trust client coordinates or zone claims.
- An explicit `meeting:join` requires an active live office participation, current availability, no conflicting conversation, physical presence inside the half-open zone rectangle and capacity below twenty. Invitation arrivals reserve capacity before travel begins.
- Walking into a room does not join or enable the microphone. Walking out or losing eligibility immediately removes the member.
- Each membership change rotates the LiveKit generation. The roster is delivered privately through `conversation:update`; the token and policy permit remain microphone-only.
- The web UI shows the current room, explicit Join/Leave actions, authoritative roster, capacity, invitation responses and mic controls. Camera and screen sharing are not part of this contract.

## Interface outline

- `meeting:join { zoneId }`, `meeting:leave { conversationId, conversationVersion }`, and the scoped invitation/accept/decline/cancel events.
- The server emits private authoritative roster and media readiness updates. Meeting geometry is read-only display state.

## Planning question

Room admission remains explicit. Fixed meetings support twenty participants; proximity groups remain capped at six. Issue #8 still needs a product decision on whether its twenty-person conversation limit applies to proximity groups as well.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
