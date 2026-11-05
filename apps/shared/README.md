# Imported office helpers

`apps/shared` is the pnpm workspace `@gather/legacy-shared`. The imported web code resolves `../shared/*.js` from `apps/web`, and `../../shared/*.js` from its nested feature folders.

These are the original JavaScript helpers and adjacent TypeScript declarations, preserved as an intermediate migration layer. Upstream: OpenOfficeForAll commit `23d6b8999396f9e9d51291bf85bd7b72161f833f`. See `LICENSE.upstream` and [import provenance](../../docs/migration/UPSTREAM_IMPORT.json).

Run `pnpm test:shared` at the repository root to validate all web/shared runtime exports and independent initialization of the vivo, studio and campus maps. The helpers are not an authoritative multiplayer server. Reviewed pure rules can move into `packages/world` during the Phaser/NestJS migration.
