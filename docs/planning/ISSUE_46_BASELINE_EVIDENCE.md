# Issue #46 room-count baseline

2026-11-19 · [Issue #46](https://github.com/ibrahim8ismael/workspace/issues/46) · [PR #52](https://github.com/ibrahim8ismael/workspace/pull/52)

The baseline is GitHub main at commit `1b35b825ded3327bc3e2ca210a91172946b726aa`. The verification branch adds tests against that behavior. Production behavior was not changed or deployed.

## Acceptance evidence

| Issue criterion | Evidence and remaining gap |
| --- | --- |
| Choose the room count when creating a workspace | The live browser scenario selects four rooms through the Create company form, checks the persisted count and counts the door labels on the mounted map canvas. |
| Authorized settings changes persist | The existing API integration covers owner authorization, stale revision and an idempotent update. The new integration reads settings and bootstrap again after `20 → 25 → 5`. The live scenario reconnects after `4 → 3` and checks the smaller layout. |
| Workspaces can use 5, 20 and more than 20 rooms independently | The new API integration creates separate owners and workspaces with 5 and 20 rooms, changes the second to 25 and then 5, and checks the other workspace's version and geometry after both saves. |
| Reusable room design, no overlap and walkable entrances | The existing world tests pass shared validation and check reachability from spawn to every meeting-room center at 1, 5, 20, 25, 60 and 100 rooms. The live scenario walks through a generated door into room 4 and observes the door closing on occupancy. |
| Preview and live agree with server geometry | Live rendering receives generated bootstrap geometry, and the browser scenario checks the canvas ARIA door labels and live movement against server occupancy. The browser check does not compare individual rendered pixels. The app's entry screen renders the join form, with the map mounted after joining. There is no generated map shown in that entry flow to compare with live rendering. |
| Keep retained IDs and explain removals blocked by occupancy or meetings | All retained IDs and bounds are compared across growth and shrink. A live shrink is attempted first with the only participant in a corridor, then with that participant inside a room being removed. Both receive the same `409 office_in_use` and preserve the active map. The runtime blocks every change while anyone is connected and Settings tells everyone to leave. It does not identify the affected room or distinguish occupancy from an active meeting. An active generated-room meeting was not started in this baseline. |
| Existing workspaces keep their original map until an owner changes the count | The new API case reads the legacy Vivo settings and bootstrap before changing from 5 to 6 rooms. The update switches to generated version and geometry. The registry inspection shows all five legacy meeting-room IDs are replaced by generated IDs, and the 58 Vivo seat IDs have no generated counterparts. |

The current legacy switch has no identity mapping. The five meeting-room IDs are `vivo-094907c0`, `vivo-52ca736f`, `vivo-b5d28fd7`, `vivo-77ef5c78` and `vivo-1d86cb31`. A six-room generated layout has `workspace-room-001` through `workspace-room-006` and zero seats.

## Map versions

| Layout | Version |
| --- | --- |
| Legacy Vivo | `vivo-v1-0208da25a5cdc4cbb4036ae04a5bb8796962752a3d84de24961ebc15d8038e7b` |
| Generated, 3 rooms | `workspace-v1-3-b9cc8b50fe6f6ad6436fcbc22b9ebd433052978457a3e41795b19c6a5033dbba` |
| Generated, 4 rooms | `workspace-v1-4-1a6839982792d201a8b06a627bd61335c8d77b1a2ae7f19bed83a15a2b28859e` |
| Generated, 5 rooms | `workspace-v1-5-b3af13888eddcc7eeebaa0ee603c89d596df08cfd117d9cf8e2ecd3f51bf2718` |
| Generated, 6 rooms | `workspace-v1-6-dc7de452fcbb198737fd7d1f3d58bc02b8a31a1c53397cc3764efa34ccd6400a` |
| Generated, 20 rooms | `workspace-v1-20-0af4c786988c5c083452ae69a984e7d4c59f98eda8d727a444f8fa15e0eb58de` |
| Generated, 25 rooms | `workspace-v1-25-142410433a2d1ade190313179d28040ee50b4bb6c3d5811ff9b348fc4a246313` |

These versions were read from the compiled map registry. The generated browser test also attaches the bootstrap versions returned before and after save.

## Verification commands

- `pnpm test:world` passed all 42 tests.
- The focused API run passed all three room-count integration cases using the disposable MongoDB replica set. The full `pnpm test:api` run passed 139 tests across seven files, with two tests skipped.
- The focused live test passed on the exact baseline Docker build, with one Chromium scenario completing in 25.9 seconds. Re-run it with `LIVE_OFFICE_E2E=1 pnpm exec playwright test tests/e2e/live-office.spec.ts -g 'generated office renders' --workers=1`. It requires the local stack and the appropriate Mailpit URL.
