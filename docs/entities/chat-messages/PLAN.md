# Chat messages implementation plan

Status: Issue #17 implemented · Updated: 2026-11-16

- [x] Preserve existing General history and legacy message contracts.
- [x] Add Social/DM storage with conversation-scoped idempotency, history indexes and 90-day TTL.
- [x] Add strict channel/DM HTTP contracts and private realtime projections.
- [x] Validate current actor, space/office and DM recipient in database transactions.
- [x] Recheck recipient socket policy and emit DMs only to the two participants.
- [x] Connect navigation, directory, history, realtime, per-conversation drafts and retry controls.

## Evidence

`apps/api/test/auth.integration.test.ts` verifies the legacy General transition, Social separation, bidirectional DM history, unauthorized third-party/cross-space access, forged payloads, invalid channels, self-DM rejection, idempotent retries/conflicts, expiry filtering and access/delivery after membership revocation against temporary MongoDB and real HTTP/Socket.IO servers.

`tests/e2e/company-office-preview.spec.ts` verifies the supplied browser UI using mocked HTTP/signaling: General/Social/DM navigation, saved history, failed-send retry IDs, per-conversation drafts, a delayed private send while editing General, a private realtime reply and reconnect history.

## Remaining work

Unread state, pagination, attachments, group DMs, custom channels and live deployment acceptance are separate work. Browser E2E mocks the API; the API integration suite supplies actual persistence/authorization/delivery evidence. No live deployment is implied by these checks.
