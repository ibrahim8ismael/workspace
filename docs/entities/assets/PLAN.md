# Assets and provenance implementation plan

Status: planned; no implementation or verification evidence · Target: M0–M2

## Implementation tasks

- [ ] Pin upstream commit and inventory every candidate reused path.
- [ ] Record source terms/notices and mark unresolved assets blocked.
- [ ] Build minimal real avatar/object rendering sample.
- [ ] Verify pixel sampling, anchor alignment, occlusion and lifecycle cleanup.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Each distributed asset resolves to a source and license record.
- [ ] Build excludes unresolved/private reference material.
- [ ] Rendering sample demonstrates correct standing/sitting and object layering.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Exact reuse set and export tooling remain open until inventory; no upstream files imported by this docs task.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
