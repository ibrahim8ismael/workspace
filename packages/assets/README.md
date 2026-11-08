# Assets

The provenance manifest records 261 imported public files currently stored under `apps/web/public`, pinned to upstream commit `23d6b8999396f9e9d51291bf85bd7b72161f833f`. Source paths/blob hashes and retained notices are documented in `docs/migration/UPSTREAM_IMPORT.json`. Private reference artwork remains excluded.

The original Commons sprites and their provenance are recorded under [source/commons](source/commons/README.md). The [trusted manifest](manifests/commons-map.json) selects the current immutable geometry and catalog. The catalog describes one appearance, eight static poses, table and chair sprites, foot origins and draw order.

Run `pnpm build:commons` to generate the current artifacts. Run `pnpm check:commons` to compare the checked-in artifacts with a fresh calculation. Changing sprite bytes changes the catalog version and the geometry version. Keep previously committed immutable files available for a version transition. The browser sample will consume these files in CP02.5.
