# Media permits and generations implementation plan

Status: planned; no implementation or verification evidence · Target: M0 spike; M3 integration

## Implementation tasks

- [ ] Choose a container-aware independent shutdown design with bounded authority.
- [ ] Build private two-person and three-person removal spike.
- [ ] Inject guard freeze, controller loss, delayed snapshots, failed room deletion and bypass attempts.
- [ ] Record measured cutoff and node-wide interruption costs before expanding media.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Expired permits independently terminate protected forwarding within the chosen measured target.
- [ ] Frozen guard cannot leave a healthy SFU forwarding indefinitely.
- [ ] Original/refreshed-token replay and cold restart cannot resurrect a retired room.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: M0 gate: choose/prove Docker supervision. A failed spike requires an explicit architecture/guarantee decision.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
