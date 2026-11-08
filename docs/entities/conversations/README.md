# Conversations

Status: draft plan · Updated: 2026-11-05 · Target: M3–M4

## Responsibility

Own the current authorized set for proximity pairs and fixed-zone group calls.

- Owning module: Conversations / OfficeRuntime.
- State location: Office-owner memory; current authorization exported to media control.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

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
- Proposed thresholds: join at 2 tiles, leave at 3 tiles, 500 ms exit debounce; revocation is never debounced.
- States: idle/eligible participant → joining → active → retiring → ended; generation retirement is irreversible.
- Membership changes version and reconcile media; retired-room identities are never reused.

## Interface outline

- conversation:update and conversation:leave; meeting events request admission.
- Grant endpoint resolves current conversation and generation server-side.

## Planning question

D02 is accepted all-LiveKit. CP01 defines private event/member/end-notice shapes; actual deterministic matching, generation transitions and measured thresholds remain CP08/CP09 work.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
