# Media grants implementation plan

Status: planned; no implementation or verification evidence · Target: M0 spike; M3 integration

## Implementation tasks

- [ ] Define publish-source grants and admission error schema.
- [ ] Build isolated M0 token/guard spike with private fixtures.
- [ ] Integrate current-generation policy checks and SDK token issuance.
- [ ] Implement permission denial, source limits, reconnect and bounded recovery budgets.

## Acceptance criteria

The following are future checks, not passing results.

- [ ] Client-supplied room/identity cannot mint arbitrary permissions.
- [ ] Original and refreshed grants cannot enter retired generations.
- [ ] No recording/admin capabilities or raw secrets appear in public responses/logs.

## Dependencies and completion

- Follow the relationships and invariants in the [entity specification](README.md).
- Resolve: All-LiveKit is accepted. Pin SDK/server and prove guard/supervision behavior in CP07 before production grant implementation.
- Before starting, freeze relevant runtime DTOs and error behavior in [HTTP](../../contracts/HTTP.md) / [realtime](../../contracts/REALTIME.md) contracts.
- Completion requires code references, relevant check results and unresolved limitations in the [acceptance register](../../planning/ACCEPTANCE.md). No milestone is complete from documentation alone.
