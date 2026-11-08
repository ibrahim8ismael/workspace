# Assets and provenance implementation plan

Status: initial subset implemented; release and integration work remain open · Updated: 2026-11-08 · Target: M0–M2

Implementation boundary: [current API and limitations](../../contracts/AUTH_AND_ROLES_API.md), [completion plan](../../planning/PROJECT_COMPLETION_PLAN.md) and [CP00 progress](../../planning/IMPLEMENTATION_PROGRESS.md). Checked implementation tasks describe existing code, not production acceptance.

## Implementation tasks

- [x] Pin the imported code/public assets and inventory copied paths/blob hashes.
- [ ] Review any new candidate reused/derived files before adding them to the approved catalog.
- [x] Preserve imported notices and exclude private reference packs.
- [ ] Complete the selected runtime catalog and block any newly unresolved asset under CP02.
- [ ] Build minimal real avatar/object rendering sample.
- [ ] Verify pixel sampling, anchor alignment, occlusion and lifecycle cleanup.

## Acceptance criteria

These are full acceptance checks. Local backend subsets are recorded in [auth evidence](../../planning/AUTH_IMPLEMENTATION_EVIDENCE.md); unchecked items do not imply a full release pass.

- [ ] Each distributed asset resolves to a source and license record.
- [ ] Build excludes unresolved/private reference material.
- [ ] Rendering sample demonstrates correct standing/sitting and object layering.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Imported paths are inventoried; CP02 selects the MVP map/appearance subset and any derived-art export tooling.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
