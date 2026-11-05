# Avatars implementation plan

Status: planned; no implementation or verification evidence · Target: M0–M2

## Implementation tasks

- [ ] Inventory upstream walking/sitting frames and appearance combinations.
- [ ] Define compact appearance schema and defaults.
- [ ] Implement Phaser textures/animation anchors and React picker.
- [ ] Validate appearance during profile update and snapshot projection.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Unsupported IDs are rejected rather than loaded as URLs.
- [ ] Walking/sitting frames preserve pixel scale, anchors and occlusion.
- [ ] Rerendering React UI does not recreate the Phaser game.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: Choose the smallest cleared appearance set for the first two-user slice.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
