# Imported web client

Run `pnpm dev:web` at the repository root, then open http://localhost:5173. Use `pnpm dev` to start the web client and existing NestJS starter together. No Docker service starts automatically.

The entrypoint is `main.tsx` at this directory's root. The user-imported React/SVG client is preserved in its upstream layout while migration is in progress. It resolves map and office helpers from `../shared/`; `@gather/legacy-shared` is also an explicit workspace dependency. Vite and TypeScript configuration are restored and included in root pnpm checks.

## Current integration boundary

The dashboard, map rendering, entry dialog and public artwork load locally. The imported client still expects the upstream workspace/account APIs, `/config`, and raw `/ws` protocol. Those are not implemented by the NestJS starter, which only exposes `/api/health/live`. Workspace creation, authenticated multiplayer and calls do not work against the new backend yet. No legacy backend or mock business API was added to disguise that gap.

This is a migration client, not an approved production SaaS implementation. LocalStorage session/admin keys, P2P signaling, recorder/chat/calendar features and React/SVG rendering remain upstream code to replace, remove or adapt under the existing project scope. Socket.IO, cookie sessions, Phaser and current-generation media enforcement remain planned.

## Checks and compatibility

`pnpm check` covers formatting, lint, TypeScript, shared import/map regression tests and production builds. TypeScript `strict` and unused-code checks remain enabled. This imported client uses the upstream settings for `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (both false); the stricter package/API defaults are unchanged. Re-enable these extra checks as modules are migrated. Browser/server import restrictions and Rules of Hooks apply to the imported files; the full React compiler lint preset remains on future `src/` feature code.

The public files were restored from the same pinned upstream commit and checked against its Git blob hashes. Preserve `LICENSE.upstream` and the asset README notices. Local-only private reference packs are excluded from Git. The complete source/asset provenance is recorded in [UPSTREAM_IMPORT.json](../../docs/migration/UPSTREAM_IMPORT.json).
