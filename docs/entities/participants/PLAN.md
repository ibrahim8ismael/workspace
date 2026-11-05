# Office participants and presence implementation plan

Status: planned; no implementation or verification evidence · Target: M2

## Implementation tasks

- [ ] Define safe participant projection and typed movement schema.
- [ ] Implement input sequencing, collisions, interpolation/reconciliation adapters.
- [ ] Implement lease version/epoch checks and deterministic teardown.
- [ ] Add snapshot-gap recovery, tab conflict/takeover and availability UX.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Flooding messages cannot increase speed or bypass walls.
- [ ] Late lease replies cannot revive expired participation.
- [ ] Disconnect/revocation releases seats and conversation access; snapshot excludes private fields.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Finalize availability states, takeover UX and tick/broadcast rates after measurement.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
