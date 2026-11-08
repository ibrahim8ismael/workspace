# Office bootstrap and join-ticket implementation plan

This proposal covers the first backend slice of M2, including B003 and B004 prerequisites and the ticket foundation for B015. Full Socket.IO admission and continuing authorization follow under B015 and B017.

## Scope and prerequisites

- Use the current model of one company workspace with one office. The owner accepted D12 one company/workspace/office and D13 self-service verified-user creation on 2026-11-08. D13 lifecycle/offboarding remains open. The office slice uses the existing workspace status policy.
- Before enabling ticket issuance, validate one fixed map from the cleared asset inventory. Agree on its immutable version, spawn and coordinate convention under D04/B004. A test fixture can unblock contract and policy work while the map is being selected.
- Implement the HTTP bootstrap, ticket issuance and an internal atomic consume operation in `apps/api`. Cover both `owner` and `member`. Keep the first checkpoint backend-only. Schedule the Socket.IO consumer, React/Phaser integration, movement, seats and media as separate work. Use the existing non-Docker test setup.

CP01 supplies [first office schemas and technical semantics](../contracts/OFFICE_V1.md). CP02 still must generate/approve actual Vivo map data and catalog; CP03 still must implement the routes/model/indexes/consume logic below. Schema fixtures are not approved maps or admission evidence.

## Stage 1 — Implement the frozen first HTTP contract

Define strict schemas in `packages/contracts/src/http/office.ts`, reusing the existing UUID, opaque secret and validation conventions. Keep the HTTP exception envelope and `Cache-Control: no-store` behavior.

| Route | Proposed request and response | Policy |
| --- | --- | --- |
| `GET /api/workspaces/:workspaceId` | Add `officeId` to the workspace detail response so callers can discover the existing office | Return it only to an authorized member of that workspace. Keep the list and create response shapes intact |
| `GET /api/workspaces/:workspaceId/offices/:officeId` | `200` with `{ officeId, workspaceId, mapVersion, protocolVersion, manifest }`. The manifest references approved immutable map data and a validated spawn | Resolve the office by both IDs after authenticating the account and checking workspace access |
| `POST /api/workspaces/:workspaceId/offices/:officeId/join-ticket` | Strict `{ mapVersion, protocolVersion }` from bootstrap. `201` with `{ ticket, expiresAt }`, where `expiresAt` is a UTC ISO timestamp | Require an active authenticated session, active membership and workspace, session CSRF, exact `APP_ORIGIN` and JSON |

Use existing `401`, `403`, `415`, `429` and `503` behavior. Return `400 validation_failed` for malformed IDs or body fields, `404 not_found` for a missing or mismatched office within an authorized workspace, and `409` with `office_not_ready`, `map_version_mismatch` or `protocol_mismatch` for the respective office/version conflicts. Version conflicts require a fresh bootstrap. Run the tenant check before exposing office state.

## Stage 2 — Prepare the office and map

1. Reuse the `offices` collection and its unique `workspaceId` index. Keep transactional office creation in tenancy. Put bootstrap and admission logic in `apps/api/src/modules/office`, reusing tenancy policy and session guards across modules.
2. Put the first reviewed map manifest and spawn validation in `packages/world`, with no browser or NestJS dependency. The server chooses the map and spawn from the office's configured version. An unknown version, missing map or `pending-m0` returns `office_not_ready` from bootstrap and ticket issuance.
3. Once the map is approved, use its version for new offices and provide an explicit, repeatable backfill that updates only `mapVersion: pending-m0` on existing offices. Preserve office IDs and the workspace relationship. Verify that rerunning the backfill leaves configured offices intact.

## Stage 3 — Issue and consume a scoped ticket

1. Add `office_join_tickets` with `ticketDigest`, `userId`, `sessionId`, `workspaceId`, `officeId`, `membershipGrantId`, `officeEpoch`, `mapVersion`, `protocolVersion`, `expiresAt` and `consumedAt`. Require an exact unique digest index at startup and use an `expiresAt` TTL index for cleanup. Include both indexes in `pnpm db:indexes` and the existing local test provisioning.
2. Use the existing random-secret and digest helpers. In a MongoDB transaction, reuse the session and tenancy policy locks to check current access before inserting the digest. Bind it to the current office epoch and configured versions. Set a 30-second maximum lifetime, capped by the session's remaining lifetime. Apply dedicated ticket budgets per actor, per authorized workspace and globally. Pick the starting limits before implementing the endpoint and exercise each limit in tests.
3. Use a fresh in-memory epoch per office runtime under one authoritative API process for this slice. The internal consumer checks the requested versions and current server epoch, then conditionally consumes the matching unexpired ticket and rechecks current session, account, workspace and membership within one transaction. Reuse real policy-record writes so issuance and consumption contend with revocation. Only the committed winner can proceed. Check the current epoch again before any future in-memory reservation.
4. Bind tickets to a membership grant identifier that stays stable during ordinary policy reads/writes and changes on reactivation. Reuse the existing membership ID as the initial grant identifier for legacy rows until the first reactivation. This keeps old tickets invalid if a removed member is invited back. The existing `policyVersion` is incremented by ordinary authorization paths and is unsuitable as a grant identifier.
5. Return the raw ticket only in the successful issue response. Keep it out of URLs, logs, telemetry and persistent client storage. A client retry requests a fresh ticket. An unreturned or unused ticket expires, and any ticket consumed before a failed runtime reservation stays spent.

## Verification for this checkpoint

Use real NestJS HTTP and a temporary MongoDB replica set following `apps/api/test/auth.integration.test.ts`. Test the consume service directly until the Socket.IO adapter exists.

- [ ] An active owner and member can discover their office, read a safe manifest and issue a ticket. A dual-company account can access each workspace independently. Mismatched workspace/office IDs and suspended workspaces fail without exposing office state.
- [ ] Bad session, Origin, CSRF, content type, malformed IDs, extra fields and incompatible versions are rejected. A missing, unknown or `pending-m0` map never produces a ticket. The repeatable backfill preserves existing office IDs and configured maps.
- [ ] Raw tickets appear only in the issue response. MongoDB stores the digest, startup rejects an invalid uniqueness index, and limits return `429` without granting additional tickets.
- [ ] Concurrent consumption has one winner. Expired tickets fail before TTL cleanup. Consumed, cross-office, stale-map, stale-protocol and old-epoch tickets fail. Simulate a fresh runtime with the same MongoDB data to verify restart behavior.
- [ ] Logout, account suspension, membership removal and workspace suspension committed before consumption deny access. Concurrent consume and revoke operations contend on current policy. Removing and re-adding a member does not reactivate a previously issued ticket.
- [ ] Run `pnpm test:api` and `pnpm check`. Record the build, environment and observed results against A03/A04/A11 without marking the full realtime or pilot gates passed.

## Follow-on — Open Socket.IO admission

Wire the internal consumer into namespace middleware and enforce exact `APP_ORIGIN` on the transport handshake, including WebSocket upgrades. Accept the ticket and protocol version in the Socket.IO auth payload. Serialize capacity reservation after consumption. Only then join the server-derived office room and emit `office:ready` with a safe initial snapshot. Release reservations on disconnect or failed admission and require a fresh ticket on retry. Disable recovery that can bypass admission. Complete bounded authorization leases and explicit takeover behavior under B017 before accepting live office traffic.

Demonstrate rejection of direct or wrong-Origin connections, single admission under concurrent final-slot requests, fresh snapshots after reconnect, and removal from an open socket after access is revoked. These scenarios are required to close A04 and the applicable parts of A11.

See the [decision register](../decisions/README.md), [backlog](BACKLOG.md), [HTTP outline](../contracts/HTTP.md), [realtime outline](../contracts/REALTIME.md), [office entity](../entities/offices/PLAN.md), [join-ticket entity](../entities/join-tickets/PLAN.md), [map-version entity](../entities/map-versions/PLAN.md) and [acceptance register](ACCEPTANCE.md).
