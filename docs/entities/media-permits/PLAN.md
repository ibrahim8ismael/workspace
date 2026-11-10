# Media permits and generations implementation plan

Status: local isolated CP07 spike and CP08.3c application-policy process fixture verified; real SFU/deployment integration pending CP08/CP10 · Updated: 2026-11-10

## Implementation tasks

- [x] Choose a container-aware independent shutdown design with bounded authority.
- [x] Build a private four-browser/two-room enforcement spike.
- [x] Inject guard freeze, controller loss, delayed snapshots, failed room deletion and bypass attempts.
- [x] Record measured cutoff and node-wide interruption costs before expanding media.

## Acceptance criteria

Checked criteria apply only to the measured local ICE/TCP profile in [the evidence report](../../planning/MEDIA_ENFORCEMENT_EVIDENCE.md), not production A07 acceptance.

- [x] Expired permits independently terminate protected forwarding within the chosen measured target.
- [x] Frozen guard cannot leave a healthy SFU forwarding indefinitely.
- [x] Original/refreshed-token replay and cold restart cannot resurrect a retired room.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: M0 gate: choose/prove Docker supervision. A failed spike requires an explicit architecture/guarantee decision.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
