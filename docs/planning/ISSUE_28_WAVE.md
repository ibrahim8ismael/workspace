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
- Base: `origin/main` at `b166f3d70008a37b0e4ddafcf539f4ae24bf71b5` (verified remote default branch).
- Feature branch: `codex/issue-28-wave`.
- Worktree: `/private/tmp/gather-space-issue-28`.
- Related behavior: avatar speaking animation (#2) remains intact and visually independent from wave state.
