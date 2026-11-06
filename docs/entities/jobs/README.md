# Background jobs

Status: draft plan · Updated: 2026-11-05 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Execute bounded retryable delivery and maintenance work outside interactive paths.

- Owning module: Worker / Jobs.
- State location: Dedicated persistent noeviction BullMQ Redis.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `jobId`
- `outboxEventId`
- `jobType`
- `attempts`
- `backoff`
- `scheduledAt`
- `result status`
- `safe errorCode`

## Relationships

- [Outbox](../outbox/README.md)
- [Auth Tokens](../auth-tokens/README.md)
- [Invitations](../invitations/README.md)

## Invariants and lifecycle

- Production queue Redis is separate from evictable cache Redis.
- Stable IDs, idempotent processors and bounded retries; completed/failed retention is bounded.
- Worker checks business validity and expiry before external effects.
- No passwords, session secrets or reset links in queue payload.
- Queue failure must not become authoritative identity or block immediate media revocation.

## Interface outline

- Internal processors and restricted operations metrics; no browser job CRUD.

## Planning question

Select retry ceilings, retention and provider idempotency capabilities before M1 signoff.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
