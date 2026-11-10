# Chat messages implementation plan

Status: first company-wide office-channel slice implemented · CP06.11 · Updated: 2026-11-10

## Completed in CP06.11

- [x] Freeze bounded send/history/event schemas and 90-day retention.
- [x] Add MongoDB model, scoped history/send APIs, sender-scoped idempotency, abuse budget and TTL/history indexes.
- [x] Broadcast committed messages to admitted clients in the matching office room.
- [x] Connect the supplied OpenOfficeForAll chat view and navigation to the project-owned API and Socket.IO adapter.
- [x] Preserve the draft and its idempotency key after a failed send so the user can retry without duplicating a committed message.
- [x] Keep unsupported DMs, nearby chat, attachments, topic editing, calendar, activity and media unavailable rather than fabricating functionality.

## Evidence

The contract tests validate message lengths, IDs, page bounds and the 90-day constant. The API integration test covers persistence/expiry, repeat submission, body conflict, company isolation, history access and live Socket.IO delivery. The mocked Chromium E2E covers the supplied navigation/history UI, failed-send retry stability and history refresh after office reconnect. See the [implementation progress](../../planning/IMPLEMENTATION_PROGRESS.md) and [acceptance register](../../planning/ACCEPTANCE.md).

## Remaining work

- [ ] Add authorization, lifecycle and retention policy before direct messages, nearby chat, meetings, attachments, edits, deletion, moderation or search.
- [ ] Add unread state/pagination only after requirements and bounded behavior are specified.
- [ ] Verify live UI behavior against the composed local app and Chrome/Edge after the current Docker daemon is available.

No additional chat surface is implied by this first slice.
