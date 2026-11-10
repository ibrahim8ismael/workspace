# OpenOfficeForAll UI integration

Status: owner-approved direction; repository inventory complete; UI integration not started · Updated: 2026-11-10

## Product direction

Use the owner-supplied [OpenOfficeForAll](https://github.com/VictorSandovalDev/OpenOfficeForAll) React interface and styles as the product UI. Keep its visual system, navigation, layout and reusable controls. Replace its backend assumptions with this repository's authenticated HTTP APIs and Socket.IO client. Do not create another parallel account/company/office shell.

The source is pinned to commit `23d6b8999396f9e9d51291bf85bd7b72161f833f`; preserve its MIT and asset notices. This decision reuses the frontend, not its old server contract or map data. The separately approved original `commons` geometry and its versioned Phaser renderer remain the map and world source.

## Repository inventory

| UI area | Supplied frontend source | Current integration / incompatibility | Target |
| --- | --- | --- | --- |
| App shell and office workspace | `apps/web/App.tsx`, `styles.css`, `scene.css`, office panels/components | Rich visual shell is present, but `main.tsx` does not mount it. `App.tsx` is a large component with view state and service calls mixed together | Restore this UI as the default shell incrementally; extract service boundaries without redesigning its visual language |
| Workspace home and switcher | `WorkspaceHome.tsx`, `workspaces.ts` | Slug-addressed workspaces and recent-workspace `localStorage` conflict with company/workspace UUIDs and membership-derived lists | Keep the supplied cards and dialogs; back them with the company list/create/detail/invitation APIs |
| Login and identity | Login/register/guest controls in `App.tsx`; `config.ts` | Calls legacy `/api/login`, `/api/register`, `/api/me`, `/api/logout`, persists bearer tokens in `localStorage`, and permits anonymous guests | Retain the existing app's form/control styling while wiring the verified account/session flows in `src/lib/api.ts`; no guest or client-held credential session |
| Office admission | `App.tsx`, `useOffice.ts`, `config.ts` | `room` slug, access/admin keys, `/config`, and direct raw `/ws` are not the current admission contract | Resolve the authorized company, fetch office bootstrap, request a one-use ticket, and enter through `OfficeClient` |
| Map and participants | `VivoScene.tsx`, imported map helpers/assets | These draw the legacy map family and expect legacy participant/object models. Current office authority serves versioned Commons snapshots | Preserve the supplied shell and controls; mount the current Commons Phaser renderer and adapt its approved snapshot/state types |
| Presence, seats and movement | Existing office controls and `useOffice.ts` events | Legacy event names and client mutation commands do not match server-authoritative Socket.IO envelopes | Use the existing typed `OfficeClient` commands and server snapshots/deltas; retain compatible controls and styling |
| Chat, calendar, activity, editor | `chat/ChatView.tsx`, `calendar/CalendarView.tsx`, activity/editor panels | Current APIs do not provide text chat, calendar, activity feed, or mutable office editing | Preserve the visual components where useful, but make unsupported actions honestly unavailable until a matching service exists |
| Audio/video | `useMedia.ts`, `useSfu.ts`, meeting components | Old P2P/raw signaling lifecycle conflicts with the accepted all-LiveKit architecture. CP07 enforcement evidence is a local proof, not product media integration | Remove old media transport calls; connect LiveKit controls only after CP08 authorization, proximity and browser flows exist |
| Preferences and identity | App/profile/avatar controls and multiple local stores | Local visual preferences may be suitable; names, identity, access keys and sessions must not become client authority | Classify each setting: server-owned identity/policy goes to an API; harmless presentation preferences may stay local after review |

Existing new-side integration points include `apps/web/src/lib/api.ts`, `src/features/office/office-client.ts`, `src/features/office/world-state.ts`, `src/features/workspaces/CompanyOverview.tsx`, and `src/features/workspaces/CompanyOfficePreview.tsx`. These already prove real local API and Socket.IO behavior; their current account/preview layout is not the target product shell.

## Ordered implementation steps

1. **Inventory and lock the boundary — complete.** Pin upstream source and notices; identify current and obsolete entry points, routes, storage, and service calls. Keep this audit current as screens move.
2. **Restore the supplied shell — next.** Mount the upstream app/dashboard as the target visual shell and move the existing authenticated account/company behavior into its navigation and styling. Keep a migration route until the new default can complete login and company selection.
3. **Adapt identity and company data.** Replace legacy account/workspace service calls with `ApiClient`; map UUID workspace DTOs and role-based membership into the supplied views. Add owner invitations and member acceptance using current APIs. Remove guest login and secret-bearing `localStorage` paths.
4. **Adapt office admission and live world.** Replace `useOffice` raw WebSocket with `OfficeClient`; embed the version-checked Commons renderer in the supplied office layout. Connect movement, availability, seats, deltas, resync, leave and fresh-ticket re-entry to server state.
5. **Gate unsupported features.** Keep supplied styling and recognizable controls where helpful, while disabling service actions that have no backend. Do not show mock chat, calendar, editing or P2P media as live features.
6. **Review and cut over.** Run unit/API/two-browser Socket.IO checks and visual/accessibility review in Chrome and Edge. Make the upstream-styled app the default only when login, company selection and office entry work. Remove the duplicate account/preview shell after its needed API/client logic is relocated and covered.

## Completion checks

- The default app uses the supplied OpenOfficeForAll layout, styles and reusable UI; changes are limited to adapting screens and connecting supported features.
- Registration, verification, login, session security, company creation, invitations and membership use current cookie-authenticated APIs.
- Office discovery/admission uses the current workspace and office IDs, bootstrap and one-use tickets. No legacy `/ws` connection is opened.
- Two browsers observe authoritative movement, presence, seat contention, company isolation, dropped-delta recovery and re-entry through Socket.IO.
- No account/session/access secret is read from or written to `localStorage`; unsupported chat/calendar/editor/media features do not pretend to work.
- Existing licensing/provenance, accessibility, and English-first Chrome/Edge checks remain in the release evidence.

Ship each completed implementation step with its documentation, focused verification and a separate pushed commit. Full rollout and CP08 media acceptance remain separate gates.
