# Conversations

Status: CP08.1 pairing/state implemented; guarded media pending · Updated: 2026-11-10 · Target: M3–M4

## Responsibility

Own the current authorized set for proximity pairs and fixed-zone group calls.

- Owning module: Conversations / OfficeRuntime.
- State location: Office-owner memory; current authorization exported to media control.
- The office runtime currently owns ephemeral proximity-pair state; durable conversation records, grants and media authorization are not implemented. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

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

- One conversation per participant; deterministic one-to-one open-floor pairing after explicit opt-in.
- Busy/away prevents automatic pairing; microphone and camera start off.
- Implemented thresholds: join at 2 tiles, leave at 3 tiles, 500 ms exit debounce; availability loss/opt-out/disconnect is immediate and never debounced.
- Current proximity notices cover `joining` and `ended`; `mediaReady` is always false. Active/retiring media states and irreversible LiveKit generation retirement remain pending behind CP07 integration.
- Membership changes version and reconcile media; retired-room identities are never reused.

## Interface outline

- `proximity:set-opt-in`, private `conversation:update`, and versioned `conversation:leave` are implemented for proximity state.
- The protected media grant endpoint and meeting admission events remain unimplemented.

## Planning question

D02 is accepted all-LiveKit. CP08.1 implements deterministic two-person pairing, private event delivery, and the selected distance/debounce semantics. Guarded generation transitions, LiveKit authorization, and measured media behavior remain CP08/CP09 work.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
