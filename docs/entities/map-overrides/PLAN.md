# Map overrides implementation plan

Status: planned; no implementation or verification evidence · Target: M0 design; implementation conditional after M2

## Implementation tasks

- [ ] Determine whether MVP needs any mutable decoration at all.
- [ ] Specify allowed properties and base-map conflict behavior.
- [ ] Design validated revision writes and rebuild of runtime geometry.
- [ ] Schedule implementation only after explicit scope selection.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Override cannot reference a foreign office or arbitrary asset URL.
- [ ] Conflicting revisions cannot silently overwrite one another.
- [ ] No override may trap avatars or bypass private-zone policy.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: MVP necessity is open; keep fixed geometry as the starting implementation.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
