# Browser client

Run `pnpm dev:web` at the repository root, then open http://localhost:5173. Use `pnpm dev` to start the web client and existing NestJS starter together. No Docker service starts automatically.

The entrypoint is `main.tsx`. It currently loads the authenticated account/company integration under `src/features/{auth,workspaces}`. Account entry and the company directory now reuse OpenOfficeForAll's dashboard header, card grid, search, dialogs, and form/button styles while calling the existing API. Company details and the live office shell are still on the integration UI; the original React/SVG renderer remains unreachable until its legacy services are replaced. The owner-approved migration steps are in the [UI integration plan](../../docs/migration/OPENOFFICE_UI_INTEGRATION.md).

## Current integration boundary

The browser API adapter uses the existing NestJS `/api/auth/*`, `/api/workspaces` and invitation-acceptance contracts. It validates public schemas, uses same-origin cookies, keeps CSRF in memory, and sends JSON mutations without automatic command retries. Company creation and invitation acceptance retain an in-memory idempotency key for an explicit retry of an uncertain result. Account changes discard prior client state.

Available account screens cover registration, email verification and resend, login, forgotten/reset password and logout. The company screen lists owner/member roles, creates a company and accepts an invitation code. Opening company details provides office entry through authenticated bootstrap, a one-use join ticket and Socket.IO; the current integrated screen renders the versioned Commons map and supports movement, availability, seats and reconnect flows. The owner-approved UI migration will move these supported flows into the supplied OpenOfficeForAll layout. Text chat and product LiveKit voice remain unavailable. Account security lists/revokes sessions, signs out all sessions, verifies the password, changes it and offers explicit idle extension. A shared expiry notice uses the earlier idle/absolute deadline. The browser refreshes company details against the API and clears selection when you switch views, sign out or lose access.

Secure cookie authentication requires same-origin HTTPS with `APP_ORIGIN` matching the browser origin and `/api` forwarded to the private API. The plain HTTP Vite URL is for UI development; it does not establish production cookie behavior. Local browser verification uses disposable HTTPS/Mongo fixtures and reads test codes privately from the encrypted outbox. Real SMTP, persistent queue and ingress/proxy acceptance remain separate CP04 work; see [delivery batches](../../docs/planning/CP04_BROWSER_AND_DELIVERY.md).

The old `/config`, slug-based APIs, localStorage identity, raw `/ws`, P2P signaling and React/SVG office code remain migration material. They are not connected product features. Preserve upstream licensing/provenance when those files are later retired.

## Checks and compatibility

`pnpm check` covers formatting, lint, TypeScript, browser API regressions, shared import/map tests and production builds. TypeScript `strict` and unused-code checks remain enabled. This imported client uses the upstream settings for `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (both false); the stricter package/API defaults are unchanged. Re-enable these extra checks as modules are migrated. Browser/server import restrictions and Rules of Hooks apply to the imported files; the full React compiler lint preset applies to the migrated `src/` feature code.

The public files were restored from the same pinned upstream commit and checked against its Git blob hashes. Preserve `LICENSE.upstream` and the asset README notices. Local-only private reference packs are excluded from Git. The complete source/asset provenance is recorded in [UPSTREAM_IMPORT.json](../../docs/migration/UPSTREAM_IMPORT.json).
