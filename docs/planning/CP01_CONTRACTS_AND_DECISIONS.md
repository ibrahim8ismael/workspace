# CP01 — decisions and first contracts

Started: 2026-11-08. Implementer: Codex. Status: in progress. Parent: [completion plan](PROJECT_COMPLETION_PLAN.md). Push each completed reviewable batch as requested by the owner; record prior commit IDs in [progress](IMPLEMENTATION_PROGRESS.md).

## Owner choices and freeze boundary

[Owner decision record](../decisions/2026-11-08_CP01.md): D12 one company/workspace/office, D13 verified-user self-service creation, D02 all-LiveKit are accepted. Full company lifecycle, map/renderer validation and media enforcement acceptance remain separate gates. Initial map candidate, language and browser matrix are awaiting explicit answers.

## Batches

| Batch | Deliverable | Dependencies / completion |
| --- | --- | --- |
| CP01.0 | Record explicit owner choices and open follow-ups across current docs | First three choices received; remaining scope questions pending |
| CP01.1 | Strict runtime response/error contracts for the existing auth/company API with leak/compatibility tests | Independent of map geometry and new runtime decisions; preserve current endpoints and response shapes |
| CP01.2 | First office/event/version contracts, declared budgets and ownership/retry matrix | Wait for relevant choices; map-specific geometry/catalog freeze belongs to CP02. No gateway/ticket endpoint is implemented in CP01 |
| CP01.3 | Reconcile contracts/docs, run checks and record remaining prerequisites | Do not mark the entire packet complete while an affected contract still requires an unrecorded decision |

## Current boundary that can be implemented now

The existing API has strict input schemas and TypeScript response interfaces. Add strict runtime schemas for safe account/workspace/member/invitation/session projections, auth response wrappers and the existing error envelope. Reject unexpected credential/policy/token fields rather than silently accepting a Mongo model as a public DTO. Keep actual authorization in the API; schemas are validation contracts, not access control.

Validate compatibility using real existing HTTP responses in backend integration checks and focused negative contract tests. Do not add production response interceptors, modify business policy, add Office endpoints or select map coordinates as side effects of this foundation work.

## Subsequent contract checklist

- Define safe identifiers, compatible protocol version, map-version reference and strict HTTP bootstrap/ticket request/response schemas.
- Define bounded movement/event/version/acknowledgement envelopes and public participant projections; exclude identity/session/policy secrets and private call membership.
- Document transport Origin and namespace admission, single office authority, consume/reserve/ready order, spent-ticket retry, fresh reconnect, event deduplication and explicit takeover semantics.
- Declare provisional ticket/input/lease/snapshot budgets with measurement status and exact failure behavior; no timing/capacity guarantee before execution evidence.
- Keep profile/catalog and conversation/source details at their owning phase until fields have a justified implementation contract; empty placeholder schemas are not a completed interface.

## Validation and limits

Contract tests must reject overposting, invalid IDs/timestamps/versions/ranges, stale epoch/base-version application where specified, and secret-bearing projections. Full `pnpm check` and hosted CI run on implementation checkpoints. Local schemas/tests do not establish browser support, real media cutoff, provider delivery or A01–A11 release acceptance.
