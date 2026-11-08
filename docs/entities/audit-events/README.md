# Audit events

Status: initial persistence implemented; remaining integration/lifecycle work planned · Updated: 2026-11-08 · Target: M1–M5


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Record minimal security mutations and support safe restore reconciliation.

- Owning module: Audit / security operations.
- State location: MongoDB: audit_events plus independent restricted recovery evidence.
- Fields below describe the current stored model; interface additions and remaining work retain their stated planned status. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented data

Source: [owning model](../../../apps/api/src/modules/audit/audit.service.ts).

- `_id`
- `actorId`
- `workspaceId (nullable)`
- `action`
- `targetId`
- `createdAt`
- `expiresAt`

Thirty-day application retention is a TTL index. Proposed targetType/result/policyVersion/requestId/mirror acknowledgements and workspace/time lookup indexing are not implemented. Independent evidence/failure policy/reconciliation remain CP04/CP10 work; no browser query API exists.

## Relationships

- [Users](../users/README.md)
- [Sessions](../sessions/README.md)
- [Workspaces](../workspaces/README.md)
- [Memberships](../memberships/README.md)
- [Invitations](../invitations/README.md)

## Invariants and lifecycle

- No credentials, media content, raw tokens or sensitive payloads.
- Proposed application retention 30 days with restricted read access.
- Security changes requiring recovery reconciliation need evidence outside the application backup set.
- Missing/unacknowledged audit intervals require suspended restored access and manual reconciliation.
- Audit policy must define behavior when independent evidence delivery fails.

## Interface outline

- Internal append and mirror interfaces.
- Restricted operations query interface only after authorization and retention policy are specified.

## Planning question

Choose independent audit storage, retention and mutation failure policy during M0/M1.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
