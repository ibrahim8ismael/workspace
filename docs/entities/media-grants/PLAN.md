# Media grants implementation plan

Status: CP08.3a grant route, CP08.3b browser adapter and CP08.3c process-policy fixture implemented; real SFU acceptance pending · Target: M3 integration

## Implementation tasks

- [x] Define strict media-token request/response and source-specific LiveKit grants.
- [x] Build the isolated CP07 token/guard spike with private fixtures and measured local cutoff evidence.
- [x] Integrate current session/company/pair/permit checks and short-lived microphone-only SDK token issuance.
- [x] Connect the supplied office-shell mic action to the API and lazy LiveKit client; capture starts only on click.
- [x] Verify separate-process application policy pull/ACK and app-token signaling admission against a mock upstream; verify old-token denial after pair end and guard restart.
- [ ] Run app-issued grants through a real guarded LiveKit server with two browsers and record actual audio publication/subscription and cutoff evidence.
- [ ] Verify browser permission denial, disconnect/reconnect, refreshed-token replay, policy loss and company isolation through the real media path.
- [ ] Implement meeting camera/screen scopes and UI under CP09; implement signed webhook verification only with a defined reconciliation event model.

## Acceptance criteria

The following are future checks, not passing results.

- [x] Client-supplied room/identity cannot mint arbitrary permissions; API tests and the app-policy guard fixture check derived identity/room scope.
- [ ] Original and refreshed application grants cannot publish into a retired generation on the real SFU path.
- [x] Proximity grants contain no room-admin/data-publish capabilities and the API response is no-store.
- [ ] Verify token query parameters and media credentials are redacted from production ingress, SFU logs and telemetry.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: All-LiveKit is accepted; web/server SDK versions are pinned. CP07's isolated guard/SFU proof is separate from the current app-policy integration fixture and does not establish production deployment behavior.
- Next real-media fixture boundary: `apps/api/test/auth.integration.test.ts`, `spikes/media-enforcement/guard-process.mjs`, and the pinned LiveKit test fixture in `spikes/media-enforcement/media-cutoff.mjs`. Keep the fixture opt-in, use fake browser devices, route signaling only through the guard, and assert decoded audio progresses before retirement and stops by the agreed cutoff after it. Record denied capture, policy end, guard restart and cleanup separately.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
