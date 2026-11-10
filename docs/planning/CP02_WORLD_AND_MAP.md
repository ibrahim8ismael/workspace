# CP02 — pure world rules and immutable map

Started: 2026-11-08. Parent: [completion plan](PROJECT_COMPLETION_PLAN.md#cp02--establish-one-immutable-map-and-asset-catalog). Wire boundary: [office v1](../contracts/OFFICE_V1.md). Original Commons implementation completed; Vivo adoption was reopened by owner direction on 2026-11-10. See the [superseding map/UI decision](../decisions/2026-11-08_CP02.md#superseding-owner-direction--2026-11-10) and [UI migration plan](../migration/OPENOFFICE_UI_INTEGRATION.md#owner-direction-adopt-the-supplied-map-and-ui-2026-11-10).

The original CP02 rejection below is historical. The owner has since chosen the imported Vivo map from OpenOfficeForAll and this project's own APIs. On 2026-11-10 the Vivo map became the default for newly created offices; immutable Commons offices remain registered for compatibility. CP02.6a records the server version, geometry, collision/seats and backfill. CP02.6b connects upstream VivoScene to the office APIs and selects a compatible renderer from the authenticated map manifest.

## Working arrangement

The owner requested OpenCode delegation: Codex plans, reviews the actual diff, independently runs verification, maintains documentation and commits/pushes completed batches. OpenCode wrote the delegated batches through CP02.4. The owner authorized Codex to implement CP02.5 after the free model reached its usage limit. The selected catalog entry is `opencode/deepseek-v4.1-flash-free#max`, verified against the installed OpenCode v2.2.5 catalog: active, zero input/output/cache prices and an advertised `max` reasoning variant. No paid or alternative model is authorized by this choice.

The external `opencode-delegate` skill supplies the brief/review workflow. Its relay uses an older CLI variant flag; a temporary copy adapts that flag to v2.2.5's documented `provider/model#variant` syntax. The original skill and project tooling are unchanged. Temporary briefs, event streams and results are execution artifacts, not product dependencies. Delegated work is not accepted solely on the implementer's report.

## Bounded batches

1. **CP02.1 — discrete collision foundation:** pure TypeScript pixel-to-tile, bounds, furniture tile and wall-edge rules in `packages/world`; explicit map inputs, symmetric edges and both-path diagonal checks; synthetic fixtures and a root `test:world` gate. Reject invalid tile moves. No continuous movement, seat authority, actual map export or approved registry in this batch.
2. **CP02.2 — original map identity:** update and test the office v1 manifest and join-ticket contract for `commons-v1-<sha256>`. The shared schema rejects the former Vivo identity and `pending-m0`.
3. **CP02.3 — original geometry, seats and zones:** the owner accepted an original replacement after the source review; see the [CP02 decision](../decisions/2026-11-08_CP02.md). Design `commons` independently, without copying Vivo's layout. Inventory spawn, walls, object/seat IDs, exits and zones. Record source notices separately for code, geometry and artwork.
   Validate immutable definitions, unique IDs, bounds, reachability from spawn and deterministic valid exits with shared tests. Preserve the seat ID and pixel conventions.
4. **CP02.4 — immutable export and catalog:** deterministic UTF-8 geometry, catalog and sprite digests, one trusted manifest and read-only drift checks.
5. **CP02.5 — Phaser sample:** one reviewed avatar/object, foot origins, nearest-neighbor sampling, sitting/standing occlusion and React lifecycle evidence. This is partial renderer evidence; full office integration remains CP06.

Each completed batch updates [implementation progress](IMPLEMENTATION_PROGRESS.md), is independently checked, then committed and pushed. CP03 waits for an approved CP02 map/catalog; the collision foundation alone does not satisfy that dependency.

## Observed candidate inventory and unresolved provenance

Read-only inspection of `apps/shared/maps/vivo.js` reports 32-pixel tiles, a 52 × 50 grid (1664 × 1600 pixels), spawn tile `(20,39)` / center `(656,1264)`, 22 areas, 203 objects, five `MeetingRoom` areas, 58 seat entries and 94 object blocker entries before deduplication. These counts describe imported data; they do not prove reachability or approve it.

The map header says it was generated from `docs/references/vivo/vivo-map-spec.json` and measures the reference office “Vivo” in Gather 2.0. That reference source is not present in this checkout. The [import pin](../migration/UPSTREAM_IMPORT.json) and retained `apps/shared/LICENSE.upstream` establish copied-code provenance, but do not resolve the geometry's external-reference attribution. The [project brief](../../GATHER_LITE_PROJECT_KNOWLEDGE.md) explicitly excludes third-party Gather branding/maps/art and ignored private reference packs. The owner therefore accepted an original replacement; Vivo remains historical migration input, without an approved runtime hash.

The [asset inventory](../../packages/assets/manifests/provenance.json) pins public files. The avatar READMEs describe upstream-user PixelLab exports, 92 × 92 canvases and a shared `(46,69)` foot anchor; the pixel asset README separately identifies generated/procedural artwork. These are source declarations, not a newly completed clearance or measured Phaser demonstration. No new texture or approved appearance catalog has been produced in CP02.1.

## Original Commons floor plan

Codex designed the 24 × 16 tile floor plan for CP02.3. OpenCode implemented it from the coordinates below. The lobby spawn is at tile `(11,8)`, centered at pixel `(368,272)` in the 768 × 512 pixel world. Tile ranges include the start and exclude the end.

| Room | Columns | Rows | Open boundary |
| --- | --- | --- | --- |
| Northwest meeting room | `[1,9)` | `[1,6)` | South at column 4 |
| Southeast meeting room | `[15,23)` | `[10,15)` | North at column 18 |
| Southwest quiet room | `[1,8)` | `[10,15)` | East at row 12 |

Each meeting room contains a table and two chairs. The static geometry defines 73 wall edges, eight furniture tiles, four chairs and 12 ordered exit entries. An independent graph traversal reached all 376 walkable tiles from the lobby and verified the three door openings and every chair exit. The quiet room has its own zone kind for later policy integration.

The layout uses original dimensions, room boundaries, object positions, IDs and names. The deterministic export binds the source geometry to the versioned art catalog. Retain the upstream notice for the adapted collision rules, as recorded in the [world package](../../packages/world/README.md).

## Versioned output and adoption

`pnpm build:commons` generates the map and catalog from the validated Commons layout and the original project sprites. The catalog records one appearance pair, standing and sitting views in four directions, pixel dimensions, foot origins, and the drawing order for table, avatar and chair. Its frame list represents static poses. See the [Commons art sources](../../packages/assets/source/commons/README.md).

The catalog hashes the exact sprite bytes and refers to each sprite by its digest. Geometry and catalog use compact UTF-8 JSON with sorted object keys. Arrays retain their source order, including seat exit priority. A change in a sprite updates the catalog version, which also changes the geometry version because the geometry includes that catalog version.

The first version is `commons-v1-d980be0345e864c38446a3f4effeaf12534e4ae68c10926e3c190d69c1958364` and binds catalog `commons-art-v1-c8b015529d31999841c00e9b5962f226f694467b811540d5eb9c01740951770f`. Both identifiers contain the full SHA-256 of their files. `pnpm check:commons` recomputes and compares all current output bytes. See the [geometry](../../packages/assets/maps/commons-v1-d980be0345e864c38446a3f4effeaf12534e4ae68c10926e3c190d69c1958364.json) and [catalog](../../packages/assets/manifests/commons-art-v1-c8b015529d31999841c00e9b5962f226f694467b811540d5eb9c01740951770f.json).

CP03 reads the trusted manifest and matches it against the stored office version before admission. A map upgrade creates a new version and keeps the previous immutable files. At runtime, drain the office, retire its epoch, switch the configured map version, and require fresh bootstrap and admission. The browser sample uses this version. See the [Commons manifest](../../packages/assets/manifests/commons-map.json).

## CP02.5 renderer sample

Run `pnpm dev:web` and open `http://127.0.0.1:5173/?commons-preview=1` (or use the port Vite reports). The development entry loads the checked-in geometry, catalog and sprite URLs selected by the trusted manifest. The scene shows the first chair and table in a 320 × 224 pixel view of the northwest meeting room. React controls expose Sit, Stand, Close preview and Open preview. See the [sample source](../../apps/web/commons-preview/CommonsPreview.tsx).

On 2026-11-08, Codex tested Phaser 4.2.1 in Headless Chrome 152.0.7977.42 on macOS 26.6.1 arm64. The rendered avatar kept its `(80,80)` world anchor through keyboard Sit and Stand actions. Pixel comparison matched the pose sprites and 94 overlapping pixels drawn by the chair foreground. Sprite draw calls used nearest-neighbor sampling. Three keyboard close/reopen cycles removed each canvas, stopped drawing on it and created a single fresh canvas in standing pose. Blocking the standing SVG displayed an error and disabled Sit. Restoring the SVG and reopening recovered the scene. The normal sample run made no API or socket calls.

The full local `pnpm check` passed 92 tests. The production build contains neither the preview assets nor Phaser. The [acceptance register](ACCEPTANCE.md#a06-cp025-local-renderer-sample) records partial A06 evidence. CP03 can start office discovery and admission against this map version. Full office rendering and pilot browser coverage follow in CP06.

## Owner-directed Vivo runtime map (2026-11-10)

The owner directed the project to use the supplied OpenOfficeForAll Vivo map and visual system while
keeping this repository's API and Socket.IO authority. CP02.6 exports the imported map to an
immutable, hash-verified server geometry at
[`vivo-map.json`](../../packages/assets/manifests/vivo-map.json):
`vivo-v1-0208da25a5cdc4cbb4036ae04a5bb8796962752a3d84de24961ebc15d8038e7b`. It is a 52 × 50 tile
world (1664 × 1600 pixels), with 203 imported objects, 93 deduplicated terrain blockers, 58 seats,
five meeting rooms, wall edges and spawn `(656,1264)`. The implementation combines terrain blockers
with furniture blockers so the server collision agrees with the imported shared map helper.

`pnpm build:vivo` regenerates the manifest and immutable geometry from `VIVO_GEOMETRY`; `pnpm
check:vivo` verifies their bytes and hash. The API registry matches both collision geometry and
packaged geometry before accepting a map version. Workspace creation selects Vivo. Existing
Commons-version offices still bootstrap, receive tickets and run against their own map-specific
bounds, collision, seats and appearance. Pending `pending-m0` records backfill to Vivo. The upstream
map's measured-reference provenance and MIT notice remain attached in the repository. CP02.6b
mounts upstream VivoScene for Vivo offices, connects its movement, seat and presence controls to
server-authoritative snapshots and commands, and keeps the older Commons renderer for offices that
already carry an immutable Commons version.

The API unit/integration tests pass against both map versions. Two-browser Vivo collision, seat
contention and visual/accessibility acceptance remain follow-up checks; earlier two-browser office
evidence exercised Commons.
