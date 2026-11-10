# Chat channels implementation plan

Status: fixed office channel implemented; customer-managed channels remain deferred · CP06.11 · Updated: 2026-11-10

## Implementation tasks

- [x] Record scope: one built-in company-wide `office` channel; no channel CRUD or customer-managed channel records.
- [x] Define workspace/office-scoped authorization, 90-day message retention and the request/event contracts.
- [x] Connect channel projection and message history/send to the fixed office UI.

## Acceptance criteria

- [x] MVP exposes only the fixed office channel; unsupported DMs, nearby chat, meeting chat and channel management stay absent.
- [x] Message endpoints resolve active workspace membership and exact office scope; detailed evidence is in [chat messages](../chat-messages/PLAN.md).

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Additional channels still require visibility, membership and retention decisions.
- Message DTOs and errors are frozen in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- The fixed-channel slice is implemented; full composed-browser verification remains pending because Docker is currently unavailable. See the [acceptance register](../../planning/ACCEPTANCE.md).
