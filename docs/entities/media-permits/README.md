# Media permits and generations

Status: draft plan · Updated: 2026-11-05 · Target: M0 spike; M3 integration

## Responsibility

Enforce current application authorization at signaling admission and bound forwarding after revocation.

- Owning module: Media control / Guard / independent supervisor.
- State location: Guard-local expiring state; process epochs; no reusable durable allow cache.
- These are proposed contracts and fields, not implemented models. Apply the [baseline](../../README.md#source-precedence) and [cross-cutting rules](../../architecture/README.md#shared-invariants).

## Proposed data

- `guardBootEpoch`
- `officeEpoch`
- `conversationId`
- `generation`
- `permitVersion`
- `authorized identities`
- `nonce`
- `responseSequence`
- `requestStartedAtMonotonic`
- `permitDeadline`
- `retired flag`

## Relationships

- [Conversations](../conversations/README.md)
- [Media Grants](../media-grants/README.md)
- [Participants](../participants/README.md)

## Invariants and lifecycle

- Custom enforcement is proposed and unproven; it is not a standard LiveKit revocation feature.
- Guard initiates scoped policy pulls; pushes may revoke but cannot independently extend a permit.
- Late/superseded replies cannot extend request-start deadlines or revive retired generations.
- Deny signaling first; retire/delete rooms; independent supervision stops SFU forwarding if control/guard fails.
- No public signaling/admin bypass; cold restart defaults to deny.
- Proposed total cutoff target is eight seconds; measure forwarding cessation. Docker-compatible independent supervision is open.

## Interface outline

- Internal authenticated policy pull/install/revoke interface; inaccessible to browsers.
- Inventory all pinned LiveKit join/reconnect/refresh signaling paths without rewriting protocol.

## Planning question

M0 gate: choose/prove Docker supervision. A failed spike requires an explicit architecture/guarantee decision.

## Next work

See [implementation plan](PLAN.md), [milestones](../../planning/ROADMAP.md) and [decision register](../../decisions/README.md).
