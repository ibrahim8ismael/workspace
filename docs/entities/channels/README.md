# Chat channels

Status: General, Social and private direct messages implemented · Issue #17 · Updated: 2026-11-16

## Responsibility

Provide two built-in channels for each space's office: **General** and **Social**. Active space members can read and send in both. The member directory also opens private one-to-one conversations with another active member of that same space.

- Owning UI: supplied OpenOfficeForAll chat view, connected through `CompanyOfficePreview` and the space-chat adapter.
- No channel collection or channel administration API is needed for these fixed channels.
- Nearby chat, meeting chat and custom channels remain deferred.

## General transition

General is the display name and explicit channel route for the existing `office` channel. It reads and writes the same `office_messages` rows, preserving message IDs, original timestamps, expiry and idempotency keys. The legacy `/messages` endpoints remain compatible aliases; there is no copy/backfill, duplicate channel or history reset.

Social uses `space_messages` with `conversationKey: channel:social`. DMs use that collection with a server-derived key containing the two sorted user IDs, scoped by workspace and office. Opening the same peer from either side returns the same history without creating duplicate conversation records.

## Authorization and lifecycle

- Channel reads/writes require an authenticated verified actor, active workspace membership and an office belonging to that workspace.
- DMs require both members to remain active in the same workspace. Self-DMs and recipients outside the space are rejected. A removed or suspended recipient cannot be used to open/send a DM; an active member who rejoins can access the retained pair history again.
- Only those two users receive DM events. Each realtime recipient's current session, account, membership grant and office binding is rechecked before delivery.
- History is limited to the latest 100 unexpired messages, retained for 90 days. See [chat messages](../chat-messages/README.md).

## Relationships

- [Workspaces](../workspaces/README.md)
- [Offices](../offices/README.md)
- [Chat Messages](../chat-messages/README.md)
- [Implementation evidence](PLAN.md)
