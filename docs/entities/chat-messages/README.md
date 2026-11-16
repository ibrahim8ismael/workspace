# Space chat messages

Status: General, Social and private DMs implemented · Issue #17 · Updated: 2026-11-16

## Responsibility and storage

The conversations module persists and delivers text chat through the supplied OpenOfficeForAll chat UI.

- General reuses the original `office_messages` collection. Existing office history and legacy message routes retain their IDs, timestamps and retry semantics.
- Social and DMs use `space_messages`, adding a `conversationKey` to the same message fields.
- Fields: `id`, `workspaceId`, `officeId`, `senderId`, `senderName`, `clientMessageId`, `text`, `createdAt`, `expiresAt`.
- The server derives `channel:social` or `dm:<sorted-user-id>:<sorted-user-id>`; the browser cannot supply a trusted participant list.
- Both collections have history, unique idempotency and TTL indexes. Run `pnpm db:indexes` against an existing installation before serving the new routes. No destructive migration or General history backfill is required.

## Retention and retries

Text is trimmed and limited to 1–4000 characters. History returns the latest 100 messages in chronological order. All messages expire exactly 90 days after creation; queries filter expired messages before asynchronous MongoDB TTL deletion.

Idempotency is scoped to the sender, workspace, office and conversation. An unchanged retry returns the original message; changing the text for the same key returns `409 idempotency_conflict`. The browser preserves a failed draft and retry ID per conversation, prevents overlapping duplicate sends, and clears only the sent conversation's unchanged draft on success.

## Authorization and delivery

Reads and writes validate the authenticated verified actor, active workspace membership and exact office ownership. DMs additionally lock/check the peer's active membership and active verified account in the same transaction. Both participants use the same canonical pair history. Another member querying the same peer opens their own pair, never the original conversation.

Messages publish after transaction commit. `space:message` contains the safe message DTO plus `scope: { kind: 'channel', id: 'general' | 'social' }` or `{ kind: 'dm', userIds: [firstId, secondId] }`. Delivery targets only currently authorized admitted sockets for that workspace/office; DMs further restrict delivery to the pair. The publisher rechecks current socket authorization before emission and fails closed on policy-store errors. General also emits the legacy `chat:message` projection for compatibility.

Realtime uses the existing admitted `/office` connection. HTTP history/send remain available to authorized members outside the live map. Reconnect reloads history; failed history/member loads have explicit retry controls. Other space members cannot access DM content through history or realtime.

## Interfaces

All routes are under `/api/workspaces/:workspaceId/offices/:officeId`:

- `GET/POST /channels/:channelId/messages` (`general` or `social`).
- `GET/POST /direct-messages/:recipientId/messages` (another active space member).
- Legacy `GET/POST /messages` remains General's compatible alias.

POST bodies are strict `{ clientMessageId, text }`, protected by CSRF and a shared 60-per-minute actor/workspace budget across all conversation routes. New responses use `spaceMessageSchema` / `spaceMessagesResponseSchema`; legacy responses retain the old DTO. Contracts are in `packages/contracts/src/http/chat.ts`.

Attachments, reactions, edits/deletion, moderation, search, pagination, group DMs and custom channels remain outside this issue. See [implementation evidence](PLAN.md).
