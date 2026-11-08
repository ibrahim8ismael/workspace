# CP02 — pure world rules and immutable map

Started: 2026-11-08. Parent: [completion plan](PROJECT_COMPLETION_PLAN.md#cp02--establish-one-immutable-map-and-asset-catalog). Wire boundary: [office v1](../contracts/OFFICE_V1.md). CP02 remains in progress.

## Working arrangement

The owner requested OpenCode delegation: Codex plans, reviews the actual diff, independently runs verification, maintains documentation and commits/pushes completed batches. OpenCode writes the implementation. The selected catalog entry is `opencode/deepseek-v4.1-flash-free#max`, verified against the installed OpenCode v2.2.5 catalog: active, zero input/output/cache prices and an advertised `max` reasoning variant. No paid or alternative model is authorized by this choice.

The external `opencode-delegate` skill supplies the brief/review workflow. Its relay uses an older CLI variant flag; a temporary copy adapts that flag to v2.2.5's documented `provider/model#variant` syntax. The original skill and project tooling are unchanged. Temporary briefs, event streams and results are execution artifacts, not product dependencies. Delegated work is not accepted solely on the implementer's report.

## Bounded batches

1. **CP02.1 — discrete collision foundation:** pure TypeScript pixel-to-tile, bounds, furniture tile and wall-edge rules in `packages/world`; explicit map inputs, symmetric edges and both-path diagonal checks; synthetic fixtures and a root `test:world` gate. Reject invalid tile moves. No continuous movement, seat authority, actual map export or approved registry in this batch.
2. **CP02.2 — original map identity:** update and test the office v1 manifest and join-ticket contract for `commons-v1-<sha256>`. The shared schema rejects the former Vivo identity and `pending-m0`.
3. **CP02.3 — original geometry, seats and zones:** the owner accepted an original replacement after the source review; see the [CP02 decision](../decisions/2026-11-08_CP02.md). Design `commons` independently, without copying Vivo's layout. Inventory spawn, walls, object/seat IDs, exits and zones. Record source notices separately for code, geometry and artwork.
   Validate immutable definitions, unique IDs, bounds, reachability from spawn and deterministic valid exits with shared tests. Preserve the seat ID and pixel conventions.
4. **Immutable export/catalog:** deterministic UTF-8 geometry serialization and SHA-256, asset-manifest binding, approved registry and changed-content/new-version behavior. No hash is approved until the content and catalog checks pass.
5. **Phaser sample:** one reviewed avatar/object, foot origins, nearest-neighbor sampling, sitting/standing occlusion and React lifecycle evidence. This is partial renderer evidence; full office integration remains CP06.

Each completed batch updates [implementation progress](IMPLEMENTATION_PROGRESS.md), is independently checked, then committed and pushed. CP03 waits for an approved CP02 map/catalog; the collision foundation alone does not satisfy that dependency.

## Observed candidate inventory and unresolved provenance

Read-only inspection of `apps/shared/maps/vivo.js` reports 32-pixel tiles, a 52 × 50 grid (1664 × 1600 pixels), spawn tile `(20,39)` / center `(656,1264)`, 22 areas, 203 objects, five `MeetingRoom` areas, 58 seat entries and 94 object blocker entries before deduplication. These counts describe imported data; they do not prove reachability or approve it.

The map header says it was generated from `docs/references/vivo/vivo-map-spec.json` and measures the reference office “Vivo” in Gather 2.0. That reference source is not present in this checkout. The [import pin](../migration/UPSTREAM_IMPORT.json) and retained `apps/shared/LICENSE.upstream` establish copied-code provenance, but do not resolve the geometry's external-reference attribution. The [project brief](../../GATHER_LITE_PROJECT_KNOWLEDGE.md) explicitly excludes third-party Gather branding/maps/art and ignored private reference packs. The owner therefore accepted an original replacement; Vivo remains historical migration input, without an approved runtime hash.

The [asset inventory](../../packages/assets/manifests/provenance.json) pins public files. The avatar READMEs describe upstream-user PixelLab exports, 92 × 92 canvases and a shared `(46,69)` foot anchor; the pixel asset README separately identifies generated/procedural artwork. These are source declarations, not a newly completed clearance or measured Phaser demonstration. No new texture or approved appearance catalog has been produced in CP02.1.
