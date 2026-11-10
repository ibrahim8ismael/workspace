# Imported web/shared integration

The owner supplied the original web and shared code and requested that shared live beside the client, with working pnpm checks before pushing. The imported helper directory is `apps/shared` (the existing repository uses the plural `apps/` root).

## Source and changes

All 64 supplied source/declaration/style files matched Git blob hashes from upstream commit `23d6b8999396f9e9d51291bf85bd7b72161f833f` before local integration changes. GitHub's main ref confirmed this value as a commit SHA; earlier planning notes had only recorded it as a tree identifier. See [full manifest](UPSTREAM_IMPORT.json).

- Moved root `shared/` to `apps/shared`, preserving all web-relative import paths.
- Registered `@gather/legacy-shared` as a private pnpm workspace and web dependency.
- Restored package, HTML, Vite and TypeScript configuration for the root-level imported `main.tsx`.
- Kept TypeScript strict and unused-code checks, with the upstream-compatible optional/indexed-access behavior scoped to the imported web client. Shared package/API strict configuration remains unchanged.
- Removed unused imports/variables, an unused music field, and a redundant assignment; formatted source using the repository convention.
- Restored 261 public files from the same revision after reading the upstream asset provenance notices; verified their blob hashes and retained MIT and asset notices. No private reference artwork was imported.
- Added regression checks that validate all web/shared runtime exports and the three map bootstraps in separate processes.

The web source currently retains its upstream flat structure; the earlier `apps/web/src` scaffold was replaced by the owner's import. It will be reorganized into feature modules during the actual renderer/backend migration. `packages/world` remains the eventual home for reviewed pure TypeScript rules.

## Verification scope

Local frozen/offline pnpm install succeeds. Browser smoke checks exercised the dashboard, navigation into the office entry screen, shared module resolution and public image requests: no uncaught page errors and no failed asset requests. Production build, lint, typecheck and all five shared regression checks passed locally before push. No Docker command is needed for these checks.

Current boundary (2026-11-08): NestJS now exposes account/session/company APIs in addition to liveness. `/api/workspaces` requires authentication and uses the new UUID-based DTOs; the imported client still expects the legacy contract. The liveness-only/404 behavior observed during the original import smoke test is historical. Legacy account, socket and media integration remains pending. The visual check did not authenticate a user, create a company, join multiplayer or verify calls. Those remain product implementation gates; no mock service or automatic legacy backend was introduced.

**Owner direction updated 2026-11-10:** OpenOfficeForAll's supplied app UI and styles are the product UI. The UI remains unreachable from the current default entry until its old API/storage/socket/media calls are adapted. See the [integration inventory and steps](OPENOFFICE_UI_INTEGRATION.md). The 2026-11-08 visual smoke summary above is historical; current local account/company/socket evidence is tracked in [implementation progress](../planning/IMPLEMENTATION_PROGRESS.md#cp0610e--local-live-ui-api-and-socketio-smoke-2026-11-10).

## Verified commands

- `pnpm install --offline --frozen-lockfile`: passed with the current lockfile.
- `pnpm check`: formatting, lint, TypeScript, shared regression checks and all workspace builds passed; the added fifth asset-integrity check also passed.
- `pnpm dev`: exercised directly under headless Chromium; dashboard, office entry view and same-origin API liveness proxy responded.
- `pnpm test:shared`: five checks pass, covering runtime exports, three maps and all 261 public files.
- Browser runtime: no uncaught page exceptions or failed public asset requests; temporary processes were stopped.

The production build retains a size warning for the separately lazy-loaded LiveKit SDK chunk (about 532 kB minified). It does not prevent building; further media bundle optimization belongs to the integration work. No Docker was run.
