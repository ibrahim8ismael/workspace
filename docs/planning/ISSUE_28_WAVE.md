# Issue #28: Wave action

## Goal

Allow a connected office member to greet another live participant with a short, visible wave. The server is authoritative for sender identity, current-office membership, recipient liveness, duplicate delivery and cooldown. A wave is ephemeral and never changes world state, meeting membership or media state.

## Implementation plan

1. Add strict shared Socket.IO schemas for a wave command and ephemeral wave event. The command carries only the target participation ID; the server derives sender identity from the authenticated socket ticket and current reservation. The event carries a fresh event ID, epoch, sender/recipient participation IDs and display names, and a bounded lifetime.
2. Handle waves in the `/office` gateway after the common office-command rate limit. Validate the event ID/epoch/payload, deduplicate event IDs before cooldown accounting, and verify both reservations and current runtime participation belong to the same workspace, office, and epoch. Deliver only to sockets currently joined to that room after policy authorization. Reject absent/disconnected/self/cross-space targets. Apply a per-user cooldown shared across that user's connections, with bounded state and cleanup.
3. Add client parsing and an ephemeral wave collection keyed by event ID. Accept only the active epoch and live sender/recipient IDs in the current snapshot; ignore replayed IDs and clear on timer, reconnect/close/access end, participant removal, or epoch change. Expose a typed action and event state through `OfficeClient`.
4. Add a Wave action to each other online person in the live office roster. Disable controls while disconnected and during local cooldown; display acknowledgement errors without affecting movement or other office controls. Include an accessible recipient notice identifying the sender.
5. Animate the sender avatar independently of its movement/facing/seated image and existing speaking indicator. Use a temporary waving arm/hand cue and a recipient-side name/message cue, with automatic clearing; do not modify microphone or meeting state.
6. Add shared-contract and client tests plus real Socket.IO integration coverage with multiple clients for sender/recipient/observer behavior, repeats, replay/deduplication, disconnect cleanup, cooldown and current-office isolation. Update relevant progress documentation only with evidence actually obtained.

## Verification

- Contract tests reject malformed IDs, epochs, names and durations.
- API integration tests exercise two participants plus an observer, cooldown and retry/replay behavior, target disconnect, and a participant in a different office.
- Web tests verify current-epoch event handling, duplicate rejection, expiration, cleanup, and action availability.
- Run focused tests and relevant type/lint/build checks; report any unavailable environmental or multi-client evidence explicitly.

## Base and scope

- Issue: [#28](https://github.com/ibrahim8ismael/workspace/issues/28)
- Upstream implementation: Ibrahim's `origin/main` commit `0fb323b3cf9db8b918f685ee882974755ea1ba9d`.
- Deployment merge: `d14bea5275ddfc847f256ad6f919c6914135f407` (includes issue #12/#3 implementation).
- Deployed protocol: office protocol version 3.
- Related behavior: avatar speaking animation (#2) remains intact and visually independent from wave state.

## Implementation and deployment evidence — 2026-11-17

The scoped command/event, server authorization, replay/cooldown handling, client lifecycle, roster
action, sender animation and recipient notice are deployed at `https://gather.imtelak.com`. The
complete API suite passed 110 tests with 1 skipped; the web suite passed 69 tests. The live
two-browser deployed smoke sent a wave from the invited member to the owner and observed the
recipient notice while movement, reconnect, office isolation and SPA routing checks passed. A prior
full browser smoke had a locator ambiguity because several independent status regions use
`role=status`; the assertion now targets the unique notice text and passes.


## Current UI after Ibrahim's #35 merge — 2026-11-17

The repeated Wave action is now in the selected-member card alongside Go to. The deployed source
merge is 37888d02e851e3ad6e2771fb0b746f7a92fadeae, with Ibrahim's
4ddabc92b1b7de341bddbf62c81607b252b67541 as its upstream parent. The live selected-member test
passed against the deployed URL; the deployed office smoke also observed the recipient notice.
