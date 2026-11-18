# Issue #43 — current room lighting

[GitHub issue #43](https://github.com/ibrahim8ismael/workspace/issues/43)

1. Start on updated main `c0d0c9c` and carry over the local #31 room authority and #30 door visuals. Preserve both existing worktrees.
2. From the current participation ID and authoritative room occupancy, derive the active room's bounds. Use physical presence, independent of meeting admission. Clear the bounds in shared areas and when leaving the office.
3. Draw a moderate dimming layer outside those bounds on the live Vivo and Commons maps. Keep the room at its existing brightness. Use the renderer's map coordinates and camera alignment. The overlay is decorative and must leave interaction, layout, movement, and door behavior intact.
4. Verify shared area → room, room → room, room → shared area, other people's occupancy, and fresh snapshots after reconnect. Inspect Chromium output and check that dimmed map interactions still work. Test supported live renderers.
5. Luna implements the code. Independently review the change and record checks here.

Luna implemented the dimming layer in both live maps. Review extended Vivo's dimming to the visible scenery beyond the map edge when panning or zooming and verified the room cutout against map coordinates. The 28% shade keeps the map readable, with a small margin around the current room for its door art. The highlight applies to meeting rooms supplied by #31. Shared areas and map regions without a room occupancy record use even lighting.

- The mounted Vivo Chromium test passed with mocked office snapshots. It covered entering, changing and leaving rooms, teammate occupancy, keyboard movement, and a fresh projection after reload.
- An independent Commons Chromium check measured canvas pixels. The current room retained its original brightness, the surrounding map darkened, and the original pixels returned on exit.
- Web typecheck, 80 web unit tests, focused ESLint and 30 API tests for the underlying room behavior passed on the updated main base.
