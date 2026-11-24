# Meeting zones implementation plan

Status: implementation and gated actual media acceptance complete in this checkout; production rollout remains separate · Target: M2 geometry; M4 interaction

## Implemented

- [x] Use trusted map meeting-zone rectangles as the authoritative room identity and geometry.
- [x] Publish a protocol v4 room projection scoped to workspace, office and epoch with bounded occupancy, admitted roster, explicit-admission policy, current conversation ID/version/state, and walkable entrances.
- [x] Keep occupancy independent from explicit membership. Occupancy alone does not grant a meeting permit or media token.
- [x] Prevent proximity pairing from forming or expanding across room domains; retire the old generation and retain eligible same-domain survivors after a boundary crossing.
- [x] Revalidate room/proximity membership when media permits and token participation are read so a stale generation stops authorizing new media.
- [x] Cache room entrance geometry per trusted map, including bounds, blocked tiles and collision edges. Occupancy status is descriptive and does not lock exits.
- [x] Keep one ephemeral, server-authoritative screen-share reservation per explicit meeting, with authenticated start/confirm/stop commands, replay-safe share IDs, private versioned updates, join/resync snapshots, and bounded expiry for abandoned starts.
- [x] Clear presenter ownership on meeting departure or office authorization loss without changing proximity conversations or microphone-only permits.

## Verification recorded

- `@gather/contracts`: 29 tests passed, including bounded room projection validation.
- Full API suite: 131 tests passed, with two opt-in actual-media cases skipped by the default run. The room-specific actual-media case was executed separately and passed.
- World suite: 31 passed; web suite: 80 passed; media enforcement spike: 33 passed; asset and legacy-shared checks: 5 passed each.
- `pnpm check` passed, including formatting, lint, typechecking, generated map checks and production builds. The mounted-office Chromium UI E2E also passed.

## Remaining acceptance criteria

- [x] Pass a real LiveKit + guard + browser media test for audio between explicitly admitted members, denial to physical outsiders, isolation between simultaneous rooms, and decoded-audio cutoff after exit or revocation.
- [x] Run the full relevant suites and generated artifact checks; record exact results.
- [x] Independently review admission, room-domain group expansion, generation retirement, synchronization and client occupancy use. Audio evidence includes actual decoded samples, not just token-mint or UI assertions.

## Actual media evidence

Command from `apps/api` (Node 24.22.3, with loopback access and the installed Chromium cache):

```sh
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/gather-issue31-browsers CP08_REAL_MEDIA=1 pnpm exec vitest run --config vitest.config.ts test/auth.integration.test.ts -t "isolates adjacent room meetings from doorway and wall outsiders and cuts off exited or revoked receivers" --reporter=verbose
```

Result: 1 test passed; 79 unrelated tests skipped. Two adjacent trusted Vivo meeting rooms and a separate proximity pair were live simultaneously. Participants decoded audio only from their own partner; doorway and wall outsiders were denied room tokens. Existing media receivers reached verified decoded-audio cutoff in 39 ms after room exit and 1,604 ms after company-membership revocation. The other meeting and the outsiders' proximity audio continued independently. Retired tokens were rejected, and reconnect did not restore room admission. These are local fixture measurements, not production rollout evidence or a measured latency percentile.
