# Background jobs

Status: initial queue dispatcher/processor implemented; real service gates pending · Updated: 2026-11-08 · Target: M1


Initial backend scope is now described by the [implemented auth/company API guide](../../contracts/AUTH_AND_ROLES_API.md). Existing plan fields below retain their draft status where not covered by that implementation; production/provider/recovery acceptance remains separate.

## Responsibility

Execute bounded retryable delivery and maintenance work outside interactive paths.

- Owning module: Worker / Jobs.
- State location: Dedicated persistent noeviction BullMQ Redis.
- The implemented payload/metadata section reflects current code; future interfaces remain planned. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Implemented payload and queue metadata

Source: [ID-only job schema](../../../packages/delivery/src/index.ts), [dispatcher](../../../apps/worker/src/outbox/dispatcher.ts) and [worker](../../../apps/worker/src/main.ts).

The application payload contains only `outboxEventId`. BullMQ metadata carries the stable job ID, name, five-attempt ceiling and exponential backoff starting at one second. Completed retention is bounded to one day/1000 jobs; failed retention to seven days/1000 jobs. Worker concurrency is two. Outbox stores attempts and final delivery state; payloads do not carry tokens, email or private policy.

Real persistent Redis/SMTP, crash/ambiguous-acknowledgement recovery and operational alerts remain CP04/CP10 work. Existing tests fake the queue/sender boundary.

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

Retry ceilings and retention are implemented above; verify real provider idempotency/duplicate behavior and persistent queue recovery before M1 signoff.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
