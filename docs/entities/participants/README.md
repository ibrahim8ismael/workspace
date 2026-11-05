# Office participants and presence

Status: draft plan · Updated: 2026-11-05 · Target: M2

## Responsibility

Represent one currently admitted user participation and live movement state.

- Owning module: OfficeRuntime / Realtime.
- State location: Authoritative office-owner memory.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `participationId`
- `userId (internal)`
- `workspaceId`
- `officeId`
- `sessionId (internal)`
- `epoch`
- `position`
- `direction`
- `availability`
- `inputSequence`
- `seatId`
- `zoneId`
- `conversationId`
- `leaseDeadline`

## Relationships

- [Users](../users/README.md)
- [Sessions](../sessions/README.md)
- [Memberships](../memberships/README.md)
- [Offices](../offices/README.md)
- [Join Tickets](../join-tickets/README.md)
- [Conversations](../conversations/README.md)

## Invariants and lifecycle

- One active participation per user/workspace; explicit reauthorized takeover.
- Server assigns identity and advances motion from intent using server time.
- Coalesce stale movement; do not persist per-tick position to MongoDB/Redis.
- Recommended 20 Hz simulation / up to 10 Hz broadcast; provisional 30 inputs/sec and 4 KiB payload ceiling.
- Authorization checks run independently of client traffic; proposed 1-second checks and maximum 5-second leases use monotonic request-start deadlines.

## Interface outline

- world:input, world:snapshot, world:delta, world:resync, presence:update.
- Every update carries relevant epoch/version/sequence; reconnect gets fresh ticket and snapshot.

## Planning question

Finalize availability states, takeover UX and tick/broadcast rates after measurement.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
