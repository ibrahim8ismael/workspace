# Media grants

Status: proximity grant route/client implemented; real SFU acceptance pending · Updated: 2026-11-10 · Target: M3 integration

## Responsibility

Authorize a currently eligible participation to join a server-selected LiveKit generation.

- Owning module: Media.
- State location: Short-lived JWT in browser memory; no durable raw-token store.
- Proximity grants are implemented by `apps/api/src/modules/media/media-token.service.ts`; the browser flow lives in `apps/web/src/features/office/proximity-audio-session.ts`. Meeting-source grants are not implemented. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `participation-scoped identity`
- `conversationId`
- `generation`
- `permitVersion`
- `roomName`
- `publishSources`
- `subscribe capability`
- `expiresAt`
- `requestId`

## Relationships

- [Sessions](../sessions/README.md)
- [Participants](../participants/README.md)
- [Conversations](../conversations/README.md)
- [Media Permits](../media-permits/README.md)

## Invariants and lifecycle

- NestJS verifies session/current world policy and grants no admin capabilities.
- Proximity JWT admission lifetime is at most 60 seconds and further bounded by session expiry; expiry alone cannot terminate existing calls or prevent refreshed-token replay.
- Issue only for the exact current session/company/pair after its microphone permit is installed; recheck the current pair and permit after signing.
- The server derives the participation identity and generation room. The first implemented source is microphone only; camera/screen scopes are reserved for CP09 meetings.
- The HTTP response is `Cache-Control: no-store`; the active browser retains the token only in memory. LiveKit signing keys are not sent to the frontend.
- The separate-process integration test uses an app-issued token with the application-policy guard and a mock upstream; it verifies current-token forwarding and denial after pair end and guard restart, but does not establish real SFU media.

## Interface outline

- Implemented `POST /api/conversations/:conversationId/media-token`; CSRF and session protected. Request: `{ participationId, conversationVersion }`. Response: `{ serverUrl, token, expiresAt, conversationVersion, generation }`.
- LiveKit SDK handles SDP/ICE; Socket.IO carries application state only under all-LiveKit planning default.

## Planning question

All-LiveKit is accepted (2026-11-08). SDK versions are pinned and CP07 proves a local guard/SFU cutoff profile. Production signaling/forwarding and the application-issued grant path still need a real-SFU two-browser proof.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
