# Chat channels implementation plan

Status: Issue #17 implemented · Updated: 2026-11-16

- [x] Expose General and Social as built-in channels with active space membership and exact office scope.
- [x] Preserve the original office history as General without migrating or duplicating records.
- [x] Open private DMs from the space member directory using a server-derived participant pair.
- [x] Keep channel/DM selection, messages, drafts and retry IDs separate.
- [x] Check both DM participants and each realtime recipient against current authorization.
- [x] Verify persistence, retention, retry conflicts, channel isolation, DM privacy, cross-space denial and membership revocation through the real API/MongoDB/Socket.IO integration harness.
- [x] Verify channel/DM navigation, draft isolation, delayed-send switching, private realtime reply, failed-send retry and reconnect history through mocked-API Chromium E2E.

Custom channels, group DMs, nearby/meeting text chat and channel administration remain outside this issue. See the [entity specification](README.md) and [message implementation](../chat-messages/PLAN.md).
