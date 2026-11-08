# Media grants

Status: draft plan · Updated: 2026-11-05 · Target: M0 spike; M3 integration

## Responsibility

Authorize a currently eligible participation to join a server-selected LiveKit generation.

- Owning module: Media.
- State location: Short-lived JWT in browser memory; no durable raw-token store.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

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
- Recommended JWT admission lifetime is 60 seconds; expiry alone cannot terminate existing calls or prevent refreshed-token replay.
- Issue only after intended permit version is installed and policy is rechecked.
- Limit to microphone, camera and explicit screen sources; scoped identities and room names are server resolved.
- Tokens are no-store, memory-only and redacted; LiveKit keys never enter frontend env.

## Interface outline

- Proposed POST /api/conversations/:conversationId/media-token; CSRF and session protected.
- LiveKit SDK handles SDP/ICE; Socket.IO carries application state only under all-LiveKit planning default.

## Planning question

All-LiveKit is accepted (2026-11-08). Pin SDK/server compatibility and prove D03 enforcement before freezing production grants/permits under CP07/CP08.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
