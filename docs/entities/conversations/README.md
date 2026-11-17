# Conversations

Status: Issue #12/#3 runtime and UI are deployed to the pilot; proximity real-audio checks pass, fixed-meeting real-SFU acceptance remains open · Updated: 2026-11-17

## Responsibility

Own the current authorized set for proximity pairs and fixed-zone group calls.

- Owning module: Conversations / OfficeRuntime.
- State location: Office-owner memory; current permits are exported to the media policy service, then installed in guard-local expiring state.
- The office runtime owns ephemeral proximity and fixed-meeting state. The API issues short-lived grants only after an exact guard installation ACK; both conversation types use the same token and media-policy path. No durable conversation records are stored. The policy bridge is process-local and production replication/fencing is not implemented. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `conversationId`
- `workspaceId`
- `officeId`
- `kind (proximity, meeting)`
- `state`
- `version`
- `participantIds`
- `generation`
- `zoneId`
- `createdAtMonotonic`
- `retiredAtMonotonic`

## Relationships

- [Participants](../participants/README.md)
- [Meeting Zones](../meeting-zones/README.md)
- [Media Grants](../media-grants/README.md)
- [Media Permits](../media-permits/README.md)

## Invariants and lifecycle

- One conversation per participant. Proximity pairing is deterministic; meetings require explicit room admission.
- Proximity eligibility is Euclidean ≤2 tiles. The server fixes the center at the founding pair midpoint, starts radius at 2 tiles, grows one tile per accepted member to 6 tiles, and leaves immediately outside that same circle. Shrink one tile per departed member only when all retained members fit. Different circles never merge.
- Busy/away blocks proximity and meeting admission. A meeting membership blocks proximity membership. Microphone capture/publication starts off; authorized members may connect as listeners while muted.
- Fixed zones come from the trusted office map version. A meeting requires a live office participation physically inside the zone. Capacity is six. Leaving the zone, losing availability, disconnect or tenant authorization revocation removes membership; membership changes rotate the generation.
- `conversation:update` is private to members. `conversation:areas` carries only versioned public geometry to authorized office clients. New and resynchronized clients receive current area state.
- `mediaReady` becomes true only after exact, unexpired, single-use policy installation acknowledgement for the still-current generation. Both call types use microphone-only permits. Real-SFU boundary-departure cutoff for the new circle is pending.
- Signed SFU webhooks remain observation-only. Process-local policy state, persistent room-retirement records and restart recovery remain release gates.

## Interface outline

- `proximity:set-opt-in`, `conversation:leave`, `meeting:join`, `meeting:leave`, private `conversation:update`, and public `conversation:areas` are implemented in the current worktree.
- `POST /api/conversations/:conversationId/media-token` resolves either current proximity or meeting membership and issues only microphone-only grants.

## Planning question

D02 is accepted all-LiveKit. CP08.1–3c implement deterministic pairing, private state, exact install-ACK activation, scoped token grants, the nearby-voice UI and a separate guard process that pulls real API policy over HTTP. CP08.5 now verifies real local LiveKit audio and measured leave/revocation cutoffs; CP08.6 verifies signed webhook ingestion, duplicate handling and late-event ordering. Device/production deployment evidence, independent supervisor progress and durable generation retirement remain open.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
