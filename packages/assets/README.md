# Assets

The provenance manifest records 261 imported public files currently stored under `apps/web/public`, pinned to upstream commit `23d6b8999396f9e9d51291bf85bd7b72161f833f`. Source paths/blob hashes and retained notices are documented in `docs/migration/UPSTREAM_IMPORT.json`. Private reference artwork remains excluded.

The original Commons sprites and their provenance are recorded under [source/commons](source/commons/README.md). The [trusted manifest](manifests/commons-map.json) selects the current immutable geometry and catalog. The catalog describes one appearance, eight static poses, table and chair sprites, foot origins and draw order.

The owner selected the imported OpenOfficeForAll Vivo floor plan and renderer for active offices. Its
server geometry is exported at [vivo-map.json](manifests/vivo-map.json), with an immutable compact
geometry file and a small server appearance manifest. The map manifest records the pinned source
commit; retain `apps/shared/LICENSE.upstream` and the detailed import record. The renderer uses the
pinned upstream map and public artwork already under `apps/web/public`.

Run `pnpm build:commons` to generate the Commons compatibility artifacts. Run `pnpm check:commons` to compare them with a fresh calculation. Changing sprite bytes changes the catalog version and geometry version; keep previously committed immutable files available for existing office versions. The original Commons renderer sample is documented in CP02.5.

Run `pnpm build:vivo` to export the current server geometry and `pnpm check:vivo` to verify its
immutable manifest and hash. Keep old versioned map files when publishing a later map revision.
