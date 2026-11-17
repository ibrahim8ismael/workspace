# Issues #33 and #34: selected member actions

## Goal

Use one selected-member card for Wave and Go to. Keep the existing office map and palette. Selecting a live member by avatar or roster row opens the same top-right card with the real name, initials, availability and close control. Wave uses the current authenticated office command. Go to uses existing pathfinding and authoritative movement to stop at a reachable tile adjacent to the selected member.

## Plan

1. Add selected-member state in `CompanyOfficePreview`, synchronize it to the latest accepted snapshot, and clear it when the member or local office session disappears or the user leaves the office view. Selecting another member updates the same card. Capture the triggering element for close/Escape focus return.
2. Wire the existing SVG avatar selection and roster selection to one handler. Keep self-avatar seating behavior. Remove per-member Wave buttons from the roster.
3. Add a floating card inside the office map region: white rounded surface at the upper right, compact avatar/initial and status, member name, close button, Wave and prominent Go to actions only. Use a width capped at 360px and a narrow viewport width with safe-area padding; keep pointer actions isolated from the map.
4. Keep Wave's existing server cooldown, pending state and errors, but place feedback in the card. At action time, resolve the selected participation ID again from `client.getSnapshot()`; reject stale/disconnected targets.
5. Extend the Vivo scene's existing navigation target path to accept a selected participation ID. At request time, pick the shortest reachable adjacent tile while treating current live participants as occupied; a same-tile route means already nearby, while an empty path to a different tile means unreachable. Do not call `navigateTo`'s seat/stand fallback for Go to. Keep keyboard movement cancellation and same-office authoritative movement. Report unavailable when the participant disappears or is not reachable; do not mutate the target, seats, meetings or microphone state.
6. Add unit coverage for adjacent-tile selection and member-card state, then run focused checks. Exercise two real browser sessions through map selection, switching, bidirectional wave, close/Escape, disconnect, Go to and interruption. Capture desktop and mobile screenshots.

## UI and data constraints

- Reference: supplied screenshot of a top-right white member card; scale to a compact 320-360px card and use the existing Gather purple action style.
- `WorldSnapshot` provides display name, availability, appearance and position, but no timezone or image URL. Use an initial avatar with availability dot and label; omit local time and unsupported video/chat controls.
- Vivo provides avatar selection and navigation intents. The legacy Commons renderer has no selection/action or route support, so Go to is unavailable there with a clear explanation.

## Verification gaps to close

- Verify the action card at desktop and narrow/mobile widths in the running local office.
- Verify Go to against actual two-client movement, a blocked target tile, an occupied adjacent tile, disconnect, and manual movement interruption.
- Confirm the base checkout's unrelated changes remain untouched.

## Base

- Issues: [#33](https://github.com/ibrahim8ismael/workspace/issues/33), [#34](https://github.com/ibrahim8ismael/workspace/issues/34)
- Base: `origin/main` at `0fb323b3cf9db8b918f685ee882974755ea1ba9d`.
- Branch: `codex/member-action-card`.
- Worktree: `/private/tmp/gather-member-actions`.

## Follow-up: wave presentation and repetition

The user requested removal of the hand next to the avatar, an icon-only Wave button, and multiple consecutive greetings. The Vivo and Commons avatar overlays have been removed. The card uses a hand icon with an accessible name and no visible Wave/Sending/Waved text. There is no two-second UI cooldown; each acknowledged click can send another greeting. The server permits eight unique waves per second per sender while retaining replay deduplication and same-office authorization. Each new incoming wave refreshes the recipient notice with a distinct event ID.

Validation: 69 web tests and web/API typechecks passed. The focused Socket.IO integration test passes duplicate handling, consecutive/concurrent sends, burst limiting, recovery after the one-second window, disconnected targets and cross-workspace rejection. The live browser test verifies four consecutive greetings arrive with distinct IDs and that neither scene displays the removed hand overlay.


## Deployed verification — 2026-11-17

Ibrahim's #35 member-action and navigation commit 4ddabc92b1b7de341bddbf62c81607b252b67541 is
merged into deployed source 37888d02e851e3ad6e2771fb0b746f7a92fadeae. The live selected-member
browser test passed against https://gather.imtelak.com (1/1), covering the action card, repeated
Wave, recipient feedback, authoritative Go to movement and narrow/mobile layout. The regular
two-browser office smoke also passed movement, reconnection, company isolation and route
authorization. The legacy Commons renderer still has no Go to route. Blocked-tile/occupied-adjacent
behavior and Commons support remain follow-up gaps.
