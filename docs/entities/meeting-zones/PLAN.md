# Meeting zones implementation plan

Status: planned; no implementation or verification evidence · Target: M2 geometry; M4 interaction

## Implementation tasks

- [ ] Define zone boundaries, eligibility and join/leave UX.
- [ ] Implement serialized membership and capacity checks.
- [ ] Link zone transitions to conversation generation retirement.
- [ ] Add fixed meeting controls and explicit camera/share actions.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Foreign/private zone admission and over-capacity joins fail.
- [ ] Concurrent last-slot requests admit at most one.
- [ ] Leaving or removal invalidates old media permissions.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Define private-zone access UX and whether crossing a boundary prompts or joins; avoid implicit microphone activation.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
