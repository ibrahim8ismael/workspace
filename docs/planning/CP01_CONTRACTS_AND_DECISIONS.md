# CP01 — decisions and first contracts

Started: 2026-11-08. Implementer: Codex. Status: in progress. Parent: [completion plan](PROJECT_COMPLETION_PLAN.md). Push each completed reviewable batch as requested by the owner; record prior commit IDs in [progress](IMPLEMENTATION_PROGRESS.md).

## Owner choices and freeze boundary

[Owner decision record](../decisions/2026-11-08_CP01.md): D12 one company/workspace/office, D13 verified-user self-service creation, D02 all-LiveKit are accepted. Full company lifecycle, map/renderer validation and media enforcement acceptance remain separate gates. The owner also selected Vivo as the initial map candidate, English-first UI and desktop Chrome/Edge validation. Map geometry/art and actual browser compatibility still require CP02/CP06 evidence.

## Batches

| Batch | Deliverable | Dependencies / completion |
| --- | --- | --- |
| CP01.0 | Record explicit owner choices and open follow-ups across current docs | Six owner choices received; technical validation/operational decisions remain scoped separately |
| CP01.1 | Strict runtime response/error contracts for the existing auth/company API with leak/compatibility tests | Independent of map geometry and new runtime decisions; preserve current endpoints and response shapes |
| CP01.2 | First office/event/version contracts, declared budgets and ownership/retry matrix | Implemented and documented in OFFICE_V1.md; map-specific geometry/catalog approval remains CP02. No gateway/ticket endpoint is implemented in CP01 |
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

## CP01.1 evidence

On 2026-11-08, full `pnpm check` passed with five contracts tests, five shared tests and 33 backend tests, plus formatting, lint, typechecking and builds. A real HTTP/Mongo projection scenario covers account/company/invitation/session responses; existing error/auth helper checks now parse their strict envelopes. The SMTP/queue boundaries remain faked. No business endpoint, production response interceptor, office or media runtime was added. The lazy LiveKit bundle warning remains.

## CP01.2 interface checkpoint

[OFFICE_V1.md](../contracts/OFFICE_V1.md) is the concrete technical contract checkpoint. Public manifest/bootstrap/ticket/handshake, strict command and event-name allowlists, world snapshots/deltas/ready/acks, locally bound delta validation, profile input and private conversation shapes are exported. Ownership, retries, takeover-reference extension, deterministic blocked-seat exits and provisional budgets are explicit. Unknown actual maps/catalog IDs must still fail server registry checks when CP03/CP06 are implemented.

No owner scope answer needed for these first interfaces remains pending. Future lifecycle/operational decisions stay at their owning gates; a pinned media grant/permit/webhook protocol is deliberately deferred until the CP07 experiment rather than invented without a tested server. CP02 geometry/export/catalog and CP03 persistence/authorization/expiry remain the next implementation prerequisites.

## CP01.2 validation baseline

The final contract suite contains 18 tests across HTTP, office and conversation files. It covers the imported object:index seat identity format in addition to protocol/leak/state/size cases. Full `pnpm check` passed on 2026-11-08 with 18 contracts, 33 backend and five shared tests, plus formatting, lint, typechecks and all builds. The known lazy LiveKit chunk warning remains; no Docker/real mail/media/browser deployment check was run.

The map header/provenance review is an explicit CP02 prerequisite. No test fixture content hash or body/palette ID is registered as approved map/catalog data by this work.
