# Conversations

Status: CP08.1–CP08.6 proximity pairing, guarded token issuance, UI control, real-SFU local tests and signed webhook observation implemented; release acceptance pending · Updated: 2026-11-11 · Target: M3–M4

## Responsibility

Own the current authorized set for proximity pairs and fixed-zone group calls.

- Owning module: Conversations / OfficeRuntime.
- State location: Office-owner memory; current permits are exported to the media policy service, then installed in guard-local expiring state.
- The office runtime owns ephemeral proximity-pair state. The API issues short-lived grants only after an exact guard installation ACK; no durable conversation records are stored. The policy bridge is process-local and production replication/fencing is not implemented. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

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
- Proximity notices cover `joining`, `active`, and `ended`. `mediaReady` becomes true only after an exact, unexpired, single-use policy installation ACK for the still-current generation.
- Pair end removes its members from subsequent policy snapshots. The process-level integration test confirms the guard rejects the prior token after installing the empty snapshot and after a fresh-epoch guard restart. CP08.5 measures real local LiveKit audio cutoff for leave and membership revocation. CP08.6 records signed SFU observations with event-ID dedupe and a monotonic per-room cursor; webhooks never authorize admission or alter permits.
- Each conversation receives a random generation and a new pair receives a new generation. Membership/session changes reconcile through current runtime permits; persistent room-retirement records and restart recovery remain open.

## Interface outline

- `proximity:set-opt-in`, private `conversation:update`, and versioned `conversation:leave` are implemented for proximity state.
- `POST /api/conversations/:conversationId/media-token` is implemented for current session/company/pair permits and microphone-only grants. Meeting admission remains unimplemented.

## Planning question

D02 is accepted all-LiveKit. CP08.1–3c implement deterministic pairing, private state, exact install-ACK activation, scoped token grants, the nearby-voice UI and a separate guard process that pulls real API policy over HTTP. CP08.5 now verifies real local LiveKit audio and measured leave/revocation cutoffs; CP08.6 verifies signed webhook ingestion, duplicate handling and late-event ordering. Device/production deployment evidence, independent supervisor progress and durable generation retirement remain open.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
