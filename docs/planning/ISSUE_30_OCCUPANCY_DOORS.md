# Issue #30: occupancy-driven room doors

Issue: <https://github.com/ibrahim8ismael/workspace/issues/30>

## Base and scope

Build on the reviewed, uncommitted issue #31 implementation, copied into `/private/tmp/gather-issue-30` on `codex/issue-30-room-doors`. The original issue #31 checkout remains preserved at `/private/tmp/gather-issue-31`. Both use main `73d3fec` as the committed base. Issue #31 already supplies scoped protocol-v4 room metadata with physical occupancy, separate admission and trusted entrance geometry.

Every meeting room must show an identifiable door, open with zero occupants and closed with one or more. The visual state must follow authoritative occupancy across all office clients, including newly admitted and reconnected sessions. Visual closure never locks a route, grants meeting admission, captures a microphone or changes audio policy.

## Implementation plan

1. Inventory the Vivo and live Commons renderers, trusted entrances, existing door artwork and issue #31 room-state lifecycle. Preserve the established pixel-art palette and geometry.
2. Render every Vivo meeting doorway with identifiable open/closed artwork in both horizontal and vertical orientations. Current small-room markers and omitted horizontal doors must be replaced with actual stateful doors. Keep existing focus-room behavior separate.
3. Feed visual state from protocol-v4 room occupancy, including supported live Commons rooms. Avoid client-counting guesses and separate door authority. Use accessible state labels and stable room identifiers without adding invisible interactive controls.
4. Ensure room metadata publication handles first entry, additional occupants, last exit, room changes, disconnect, concurrent changes and fresh/reconnected clients. Add any missing correctness checks to the existing authority rather than introducing new admission rules.
5. Add meaningful runtime/socket and browser regression tests for empty → occupied → empty, multiple occupants, room changes, disconnect and rejoin. Verify closed doors still permit valid crossing. Verify all meeting rooms have stateful visuals; inspect actual browser screenshots for horizontal/vertical open/closed states.
6. Luna implements the code. The parent independently reviews it, runs relevant checks and records results here.

## Validation evidence

Luna implemented the Vivo and Commons door renderers. Independent review connected the Commons renderer to server room metadata, opened the gap in the vertical open artwork, and added browser and Socket.IO regression coverage.

- Chromium office E2E verified six Vivo entrances across all five meeting rooms, horizontal and vertical artwork changes, and open/closed transitions as occupancy changed. The four door states were also inspected in a rendered component fixture.
- A Commons Chromium fixture confirmed a visible canvas pixel change at the entrance as server occupancy props changed. Both Commons meeting doors are drawn from the entrance metadata.
- The Socket.IO integration test observed empty, single and multiple occupancy on two clients, checked that a movement command crosses an occupied entrance, and verified a room change, last-occupant disconnect, new observer and reconnect. Non-crossing positions were arranged in the server fixture.
- Web typecheck, API test typecheck, ESLint, 80 web unit tests and `git diff --check` passed.

Issue #31 acceptance is recorded in [its implementation record](ISSUE_31_ROOM_AUDIO_ISOLATION.md). Issue #30 uses its existing protocol and room admission policy.
