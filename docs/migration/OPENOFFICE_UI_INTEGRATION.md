# OpenOfficeForAll UI integration

Status: owner-approved direction; account/company screens use the supplied OpenOfficeForAll visual system; the trusted Vivo map and upstream `VivoScene` now run inside the authenticated office screen through this project's APIs and Socket.IO. Final browser/accessibility review and remaining full-shell migration remain · Updated: 2026-11-10

## Product direction

Use the owner-supplied [OpenOfficeForAll](https://github.com/VictorSandovalDev/OpenOfficeForAll) React interface and styles as the product UI. Keep its visual system, navigation, layout and reusable controls. Replace its backend assumptions with this repository's authenticated HTTP APIs and Socket.IO client. Do not create another parallel account/company/office shell.

The source is pinned to commit `23d6b8999396f9e9d51291bf85bd7b72161f833f`; preserve its MIT and asset notices. This decision reuses the frontend, not its old server contract or map data. The separately approved original `commons` geometry and its versioned Phaser renderer remain the map and world source.

## Owner-requested UI simplification (2026-11-10)

Company selection opens the office shell directly after authorized detail loading. The intermediate company-details page, owner invitation panel and repeated sign-in status cards are removed from the active UI. The office Back action returns to the company directory. Session expiry checks run invisibly at the account root. Dedicated account-security session management remains available. Owner invitation APIs and their unmounted component are retained; this plan no longer requires their panel in the main journey. Historical test results below describe the UI before this simplification; current regression coverage asserts direct office navigation and absence of those panels.

## Owner direction: adopt the supplied map and UI (2026-11-10)

The owner has now directed the project to use the OpenOfficeForAll UI styles and its same Vivo map, while connecting only this project's APIs and Socket.IO. This supersedes the earlier Commons-only map choice recorded in CP02. The checked-in upstream `apps/shared/maps/vivo.js` header identifies its source as measurements of Gather 2.0's Vivo office; that provenance is retained here so the dependency is visible and must travel with the import notices.

The active app still mounts the secure authenticated route at `main.tsx`, but its office screen now renders the real upstream `VivoScene`, adapts server participants/seats, and sends movement, presence and seat commands through `OfficeClient`. The server has a versioned Vivo registry entry, map-specific collision/spawn/seats, and accepts both new Vivo offices and existing Commons offices. Account, membership and ticket APIs remain this project's. The larger legacy `App.tsx` is not mounted because its token storage and legacy service calls are not safe to restore; its reusable UI styles/components remain the source for future shell completion. Chat, calendar, editing and media stay unavailable until their current API contracts exist.

## Repository inventory

| UI area | Supplied frontend source | Current integration / incompatibility | Target |
| --- | --- | --- | --- |
| App shell and office workspace | `apps/web/App.tsx`, `styles.css`, `scene.css`, office panels/components | Rich visual shell is present, but `main.tsx` does not mount it. `App.tsx` is a large component with view state and service calls mixed together | Restore this UI as the default shell incrementally; extract service boundaries without redesigning its visual language |
| Workspace home and switcher | `WorkspaceHome.tsx`, `workspaces.ts` | Slug-addressed workspaces and recent-workspace `localStorage` conflict with company/workspace UUIDs and membership-derived lists | Keep the supplied cards and dialogs; back them with the company list/create/detail/invitation APIs |
| Login and identity | Login/register/guest controls in `App.tsx`; `config.ts` | Calls legacy `/api/login`, `/api/register`, `/api/me`, `/api/logout`, persists bearer tokens in `localStorage`, and permits anonymous guests | Retain the existing app's form/control styling while wiring the verified account/session flows in `src/lib/api.ts`; no guest or client-held credential session |
| Office admission | `App.tsx`, `useOffice.ts`, `config.ts` | `room` slug, access/admin keys, `/config`, and direct raw `/ws` are not the current admission contract | Resolve the authorized company, fetch office bootstrap, request a one-use ticket, and enter through `OfficeClient` |
| Map and participants | `VivoScene.tsx`, imported map helpers/assets | The active office now mounts VivoScene and adapts versioned server snapshots to its participant model | Review exact-source map alignment, browser viewport, keyboard/pointer movement and collision behavior; keep static map data client-rendered and all positions server-authoritative |
| Presence, seats and movement | Existing office controls and `useOffice.ts` events | Legacy event names and client mutation commands do not match server-authoritative Socket.IO envelopes | Use the existing typed `OfficeClient` commands and server snapshots/deltas; retain compatible controls and styling |
| Chat, calendar, activity, editor | `chat/ChatView.tsx`, `calendar/CalendarView.tsx`, activity/editor panels | Current APIs do not provide text chat, calendar, activity feed, or mutable office editing | Preserve the visual components where useful, but make unsupported actions honestly unavailable until a matching service exists |
| Audio/video | `useMedia.ts`, `useSfu.ts`, meeting components | Old P2P/raw signaling lifecycle conflicts with the accepted all-LiveKit architecture. CP07 enforcement evidence is a local proof, not product media integration | Remove old media transport calls; connect LiveKit controls only after CP08 authorization, proximity and browser flows exist |
| Preferences and identity | App/profile/avatar controls and multiple local stores | Local visual preferences may be suitable; names, identity, access keys and sessions must not become client authority | Classify each setting: server-owned identity/policy goes to an API; harmless presentation preferences may stay local after review |

Existing integration points include `apps/web/src/lib/api.ts`, `src/features/office/office-client.ts`, `src/features/office/world-state.ts`, `src/features/workspaces/CompanyOverview.tsx`, and `src/features/workspaces/CompanyOfficePreview.tsx`. The current authenticated journey reuses the supplied dashboard and office-shell visual structure while these project-owned components keep the current API and Socket.IO behavior. The upstream legacy services are not mounted.

## Ordered implementation steps

1. **Inventory and lock the boundary — complete.** Pin upstream source and notices; identify current and obsolete entry points, routes, storage, and service calls. Keep this audit current as screens move.
2. **Restore the supplied shell — complete for current screens.** Sign-in, verification and recovery use the upstream dashboard header, welcome modal, form, button and link styles. The company directory uses its dashboard, search, card grid and create/join dialogs. Security and the full-screen office use the supplied dashboard/office visual structures. Company selection now opens the office shell directly; company-detail and owner-invitation panels are unmounted. Keep the authenticated entry as the default while final visual/accessibility review and obsolete presentation cleanup proceed.
3. **Adapt identity and company data — complete for account/company/invitation flows.** The current cookie-authenticated account flows, UUID company list/create/detail, and member invitation-code acceptance use `ApiClient`; owner invitation methods remain available without a mounted panel; guest access and secret-bearing `localStorage` paths remain disconnected. Strict response validation and uncertain-result retries are covered.
4. **Adapt office admission and live world — first Vivo slice integrated.** New offices use the version-checked Vivo map; Commons remains registered for existing records. The authenticated office mounts upstream `VivoScene` and `OfficeClient`. Movement intent, availability, seat claims, snapshots/deltas, disconnect recovery, leave and fresh-ticket re-entry use this project's server-authoritative Socket.IO state.
5. **Gate unsupported features.** Keep supplied styling and recognizable controls where helpful, while disabling service actions that have no backend. Do not show mock chat, calendar, editing or P2P media as live features.
6. **Review and cut over — in progress.** The current authenticated app is already the default. Mocked E2E now covers direct office navigation, Vivo scene mounting, movement/seat/presence commands, reconnect, keyboard focus and control-key isolation. Earlier visual evidence predates Vivo mounting. Convert the live two-browser Socket.IO scenarios to Vivo, then review the active map and full-screen controls at Chrome/Edge sizes, screen-reader navigation, visual fit, collision/reconnect and obsolete Commons sample cleanup. The monolithic legacy `App.tsx` remains unmounted; the active authenticated screens use the supplied styles and map renderer with project-owned service boundaries.

## Completion checks

- The active authenticated office uses the supplied OpenOfficeForAll office styles and Vivo map for new offices; supported features connect to this project's APIs/Socket.IO. The legacy monolithic `App.tsx` is not mounted.
- Registration, verification, login, session security, company creation, invitations and membership use current cookie-authenticated APIs.
- Office discovery/admission uses the current workspace and office IDs, bootstrap and one-use tickets. No legacy `/ws` connection is opened.
- Two browsers must observe authoritative Vivo movement, presence, seat contention, company isolation, dropped-delta recovery and re-entry through Socket.IO; only the mocked Vivo browser flow is currently verified.
- Owner invitation management stays outside the active UI per the owner decision above; members can accept a valid invitation through the current API flow.
- No account/session/access secret is read from or written to `localStorage`; unsupported chat/calendar/editor/media features do not pretend to work.
- Existing licensing/provenance, accessibility, and English-first Chrome/Edge checks remain in the release evidence.

Ship each completed implementation step with its documentation, focused verification and a separate pushed commit. Full rollout and CP08 media acceptance remain separate gates.
