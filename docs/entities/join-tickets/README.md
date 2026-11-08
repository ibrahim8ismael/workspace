# Office join tickets

Status: HTTP issuance and atomic consumption implemented · Updated: 2026-11-09 · Target: M2

## Responsibility

Bridge authenticated HTTP policy into one fresh Socket.IO admission.

- Owning module: Auth / Realtime.
- State location: MongoDB: office_join_tickets.
- The fields below describe the implemented ticket model. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

- `_id`
- `ticketDigest`
- `userId`
- `sessionId`
- `workspaceId`
- `officeId`
- `membershipGrantId`
- `officeEpoch`
- `mapVersion`
- `protocolVersion`
- `expiresAt`
- `consumedAt`
- `createdAt`

## Relationships

- [Sessions](../sessions/README.md)
- [Memberships](../memberships/README.md)
- [Offices](../offices/README.md)
- [Participants](../participants/README.md)

## Invariants and lifecycle

- Random single-use ticket; 30-second starting expiry; digest unique.
- Keep raw ticket only in browser memory and Socket.IO auth payload, never URL.
- Atomically consume, recheck current policy, then serialize runtime capacity admission.
- Exact Origin allowlist protects transport; CORS alone is insufficient.
- Reconnect cannot skip admission via Socket.IO connection-state recovery.

CP03 implements the [digest model](../../../apps/api/src/modules/office/join-ticket.models.ts), exact unique and TTL indexes, [HTTP issuance and internal consumption](../../../apps/api/src/modules/office/office-admission.service.ts). CP05 connects consumption to Socket.IO reservation and continuing authorization. [Office v1](../../contracts/OFFICE_V1.md) defines lifetime/budgets, spent-ticket retry and same-session takeover boundaries.

## Interface outline

- POST /api/workspaces/:workspaceId/offices/:officeId/join-ticket.
- Socket.IO namespace middleware authenticates ticket; office:ready confirms completed admission.

## Planning question

CP01 office v1 defines ordering and fresh-ticket retry after consumption/runtime failure. Actual admission/reservation still needs CP03/CP05 implementation and evidence.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
