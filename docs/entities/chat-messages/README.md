# Office chat messages

Status: implemented for one company-wide office channel · CP06.11 · Updated: 2026-11-10

## Responsibility

Store and deliver text messages for the fixed office-wide channel. The current slice does not implement direct messages, nearby chat, meeting chat, attachments, channel creation, edits, deletion, moderation, or search.

- Owning module: `apps/api/src/modules/conversations/`.
- Durable state: MongoDB collection `office_messages`.
- Realtime delivery: `chat:message` to the current office's admitted Socket.IO room.
- UI: the supplied OpenOfficeForAll `ChatView` and chat styles, connected through this repository's `ApiClient` and `OfficeClient`.

## Data

- `id`, `workspaceId`, `officeId`
- `senderId`, `senderName`
- `clientMessageId` (sender-scoped idempotency key)
- `text` (trimmed, 1–4000 characters)
- `createdAt`, `expiresAt`

Messages expire exactly 90 days after creation. Queries filter `expiresAt > now` because MongoDB TTL cleanup is asynchronous. A TTL index provides physical deletion. History returns at most the latest 100 unexpired messages in chronological order.

## Authorization and delivery

- Both reads and writes resolve the authenticated verified actor and validate active membership plus the exact office/workspace relationship.
- Message insertion locks current session/account/workspace membership in the same MongoDB transaction as the write.
- A retry with the same sender, workspace, office and client message ID returns the original message; changing the body under that key returns `409 idempotency_conflict`. The UI retains the client message ID across retries of an unchanged draft and creates a new one if the draft text changes.
- New messages are emitted only after the database transaction commits and only to `office:<workspaceId>:<officeId>`. The office gateway admits sockets using the existing one-use ticket flow. The history HTTP API remains available to authorized members who are not currently connected to the map.
- The POST route is CSRF protected and limited to 60 requests per minute per actor/workspace.

## Interface

- `GET /api/workspaces/:workspaceId/offices/:officeId/messages` → `{ messages }`
- `POST /api/workspaces/:workspaceId/offices/:officeId/messages` with `{ clientMessageId, text }` → `{ message }`
- Socket.IO server event: `chat:message` with the same strict, secret-free message DTO.

Shared request, response and event schemas are in `packages/contracts/src/http/chat.ts`. Only the built-in `office` channel is exposed; its scope comes from the route's workspace and office IDs, not a caller-selected channel ID.

## Remaining work

Extend this feature only after deciding the matching authorization and retention rules for additional surfaces. CP08/CP09 cover private conversation/meeting media, while calendar and activity require separate data/API work. See [PLAN.md](PLAN.md), the [OpenOfficeForAll UI integration](../../migration/OPENOFFICE_UI_INTEGRATION.md), and [implementation progress](../../planning/IMPLEMENTATION_PROGRESS.md).
