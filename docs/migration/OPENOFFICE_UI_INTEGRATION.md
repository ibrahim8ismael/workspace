# OpenOfficeForAll UI integration

Status: owner-approved direction; account/company/office screens use the supplied OpenOfficeForAll visual system. The office-message view uses this project's API and Socket.IO room event with 90-day retention. Nearby voice uses the guarded token route and lazy LiveKit client. Local real audio and measured cutoff pass in Chrome and Chrome↔Firefox on the owner-authorized LAN media fixture with private SFU candidates; browser-blocked speaker playback has a verified retry control. Deployment acceptance remains open. Calendar/activity and fixed-meeting media remain unconnected; final browser/accessibility review and obsolete presentation cleanup remain · Updated: 2026-11-11

## Product direction

Use the owner-supplied [OpenOfficeForAll](https://github.com/VictorSandovalDev/OpenOfficeForAll) React interface and styles as the product UI. Keep its visual system, navigation, layout and reusable controls. Replace its backend assumptions with this repository's authenticated HTTP APIs and Socket.IO client. Do not create another parallel account/company/office shell.

The source is pinned to commit `23d6b8999396f9e9d51291bf85bd7b72161f833f`; preserve its MIT and asset notices. This decision reuses the frontend, not its old server contract. Map selection stays server-owned and versioned. The owner has directed existing offices to move from the original Commons map to Vivo as well; the migration is bounded to the exact trusted Commons manifest version.

## Owner-requested UI simplification (2026-11-10)

Company selection opens the office shell directly after authorized detail loading. The intermediate company-details page, owner invitation panel and repeated sign-in status cards are removed from the active UI. The office Back action returns to the company directory. Session expiry checks run invisibly at the account root. Dedicated account-security session management remains available. Owner invitation APIs and their unmounted component are retained; this plan no longer requires their panel in the main journey. Historical test results below describe the UI before this simplification; current regression coverage asserts direct office navigation and absence of those panels.

## Office invitation management restored (2026-11-11)

The owner's latest request supersedes the invitation portion of the UI simplification above.
After joining the office, owners can select **Invite people** (person-plus icon near the bottom
of the navigation rail). The invitation view reuses the OpenOffice dashboard forms, buttons,
colors and office navigation. Members do not see this owner action. The intermediate company-details
page stays removed.

The mounted `CompanyInvitationManager` uses this project's cookie-authenticated invitation
list/create/revoke APIs through `ApiClient`, the account-level mutation lock, CSRF handling,
idempotency keys and unauthorized-session cleanup. It shows pending/accepted/revoked/expired
states, refresh, errors and confirmation before revocation. Switching back to the map preserves
the admitted office connection. Recipients use **Join with invitation** in the company directory
with a verified account matching the invitation email. Locally, invitation emails are captured
at `http://localhost:8025`; an external email provider is still deferred.

Verification: web TypeScript checks, 25 focused web/API-client unit tests and the mocked-API
office browser E2E pass. The browser scenario creates, refreshes and revokes an invitation
through the scoped routes, checks idempotency headers and returns to the same office connection.
This browser run uses mocked API responses; manual delivery/acceptance can be exercised on Docker.

## Owner direction: adopt the supplied map and UI (2026-11-10)

The owner has now directed the project to use the OpenOfficeForAll UI styles and its same Vivo map, while connecting only this project's APIs and Socket.IO. This supersedes the earlier Commons-only map choice recorded in CP02. The checked-in upstream `apps/shared/maps/vivo.js` header identifies its source as measurements of Gather 2.0's Vivo office; that provenance is retained here so the dependency is visible and must travel with the import notices.

The active app still mounts the secure authenticated route at `main.tsx`, but its office screen renders the real upstream `VivoScene`, adapts server participants/seats, and sends movement, presence and seat commands through `OfficeClient`. New workspaces already use Vivo. The repeatable migration `db:migrate-legacy-office-maps-to-vivo` updates records on the exact trusted Commons version while preserving office/workspace IDs; unknown versions are left untouched. Run it with the API stopped, after a database backup, then restart the API to close old Socket.IO sessions. Account, membership and ticket APIs remain this project's. The larger legacy `App.tsx` is not mounted because its token storage and legacy service calls are not safe to restore; its reusable UI styles/components remain the source for future shell completion. CP06.11 restores its supplied chat view and connects one office-wide channel to this project's 90-day message API and admitted-room Socket.IO broadcast. CP08.3b adds nearby-voice opt-in and a microphone control to the active shell, using this project's proximity Socket.IO state, session-bound token API and lazy LiveKit client. Capture stays off until an explicit microphone action; an automated E2E asserts signaling is attempted against a deliberately closed mock endpoint. CP08.3c separately runs the API and guard processes: an app-issued grant is authorized against the installed current pair and forwarded to a mock SFU endpoint, then denied after pair end and guard restart. This does not prove actual LiveKit audio or deployment connectivity. Calendar/activity and fixed-meeting camera/screen media remain unavailable.

The office opens to a pre-join lobby styled after the owner-provided reference: workspace and account identity, a camera-off preview, the authenticated display name and a Join action. The map is not loaded or shown in this stage. Join starts the current API bootstrap, one-use ticket and Socket.IO flow; the server-selected map appears only after a valid office-ready event. Lobby microphone and camera controls remain disabled. After joining, the microphone icon records explicit voice intent and starts capture only for an active, media-ready pair; proximity camera and screen sharing are not offered.

## Repository inventory

| UI area | Supplied frontend source | Current integration / incompatibility | Target |
| --- | --- | --- | --- |
| App shell and office workspace | `apps/web/App.tsx`, `styles.css`, `scene.css`, office panels/components | The secure authenticated entry in `main.tsx` is active and uses the supplied dashboard/office visual system, `VivoScene`, and `ChatView`; the legacy monolithic `App.tsx` is not mounted because its view state is coupled to obsolete services and credential storage | Continue adapting individual supplied components and styles through current service boundaries; keep the authenticated entry as default |
| Workspace home and switcher | `WorkspaceHome.tsx`, `workspaces.ts` | Slug-addressed workspaces and recent-workspace `localStorage` conflict with company/workspace UUIDs and membership-derived lists | Keep the supplied cards and dialogs; back them with the company list/create/detail/invitation APIs |
| Login and identity | Login/register/guest controls in `App.tsx`; `config.ts` | Calls legacy `/api/login`, `/api/register`, `/api/me`, `/api/logout`, persists bearer tokens in `localStorage`, and permits anonymous guests | Retain the existing app's form/control styling while wiring the verified account/session flows in `src/lib/api.ts`; no guest or client-held credential session |
| Office admission | `App.tsx`, `useOffice.ts`, `config.ts` | `room` slug, access/admin keys, `/config`, and direct raw `/ws` are not the current admission contract | Resolve the authorized company, fetch office bootstrap, request a one-use ticket, and enter through `OfficeClient` |
| Map and participants | `VivoScene.tsx`, imported map helpers/assets | The active office now mounts VivoScene and adapts versioned server snapshots to its participant model | Review exact-source map alignment, browser viewport, keyboard/pointer movement and collision behavior; keep static map data client-rendered and all positions server-authoritative |
| Presence, seats and movement | Existing office controls and `useOffice.ts` events | Legacy event names and client mutation commands do not match server-authoritative Socket.IO envelopes | Use the existing typed `OfficeClient` commands and server snapshots/deltas; retain compatible controls and styling |
| Messages, calendar, activity, editor | `chat/ChatView.tsx`, `calendar/CalendarView.tsx`, activity/editor panels | CP06.11 connects one fixed office channel to scoped history/send APIs and the admitted office Socket.IO room. No calendar, activity feed, channel management, DMs, nearby chat, or mutable editing API exists | Keep the supplied message navigation/view. Show precise unavailable states for the remaining surfaces until their services exist |
| Audio/video | `useMedia.ts`, `useSfu.ts`, meeting components | The active shell's proximity voice now calls the authenticated token API and lazy LiveKit client. E2E exercises signaling against a closed mock; CP07 evidence is a local proof, and neither real audio nor production guard connectivity has been proven | Keep the microphone-only proximity control; complete live API↔guard and two-browser media/cutoff proof in CP08. Fixed meetings, camera and screen sharing remain CP09 |
| Preferences and identity | App/profile/avatar controls and multiple local stores | Local visual preferences may be suitable; names, identity, access keys and sessions must not become client authority | Classify each setting: server-owned identity/policy goes to an API; harmless presentation preferences may stay local after review |

Existing integration points include `apps/web/src/lib/api.ts`, `src/features/office/office-client.ts`, `src/features/office/world-state.ts`, `src/features/workspaces/CompanyOverview.tsx`, and `src/features/workspaces/CompanyOfficePreview.tsx`. The current authenticated journey reuses the supplied dashboard and office-shell visual structure while these project-owned components keep the current API and Socket.IO behavior. The upstream legacy services are not mounted.

## Ordered implementation steps

1. **Inventory and lock the boundary — complete.** Pin upstream source and notices; identify current and obsolete entry points, routes, storage, and service calls. Keep this audit current as screens move.
2. **Restore the supplied shell — complete for current screens.** Sign-in, verification and recovery use the upstream dashboard header, welcome modal, form, button and link styles. The company directory uses its dashboard, search, card grid and create/join dialogs. Security and the full-screen office use the supplied dashboard/office visual structures. Company selection now opens the office shell directly; the company-detail panel is unmounted; invitation management is available as an owner-only office view. Keep the authenticated entry as the default while final visual/accessibility review and obsolete presentation cleanup proceed.
3. **Adapt identity and company data — complete for account/company/invitation flows.** The current cookie-authenticated account flows, UUID company list/create/detail, and member invitation-code acceptance use `ApiClient`; owner invitation methods are mounted in the owner-only office invitation view; guest access and secret-bearing `localStorage` paths remain disconnected. Strict response validation and uncertain-result retries are covered.
4. **Adapt office admission and live world — integrated.** The pre-join lobby hides the map and connects its Join action to the current bootstrap, one-use ticket and Socket.IO admission flow. New offices use the version-checked Vivo map; the migration moves existing Commons offices to Vivo. The authenticated office mounts upstream `VivoScene` and `OfficeClient`. Movement intent, availability, seat claims, snapshots/deltas, disconnect recovery, leave and fresh-ticket re-entry use this project's server-authoritative Socket.IO state.
5. **Connect supported features, gate the rest.** The supplied OpenOfficeForAll `ChatView` now uses the project-owned office-message API and `chat:message` Socket.IO room event, with history retained for 90 days. CP08.3b connects nearby-voice opt-in and microphone controls through the project conversation events, session-bound token API and lazy LiveKit client; real media and guard connectivity remain unverified. The company directory supplies real member names. Only the fixed office channel is enabled; DMs, nearby chat, files, calendar, activity and editing have no matching API. Fixed-meeting camera and screen media remain CP09. Do not mount the upstream P2P signaling adapter.
6. **Review and cut over — in progress.** The current authenticated app is already the default. Mocked E2E covers direct office navigation, Vivo scene mounting, keyboard focus and control-key isolation. After the database migration, a live Docker two-browser run confirmed the Vivo renderer and authoritative movement, then failed at the seat-claim assertion; do not treat the complete live scenario as passing until that separate seating failure is fixed and the test is rerun. The earlier passing live run predates the migration. Vivo wall-collision and concurrent seat-contention still need live coverage. Formal visual anchor/occlusion review, screen-reader navigation, Chrome/Edge review and obsolete Commons sample cleanup remain. The monolithic legacy `App.tsx` remains unmounted; the active authenticated screens use the supplied styles and map renderer with project-owned service boundaries.

## Completion checks

- The active authenticated office uses the supplied OpenOfficeForAll office styles and Vivo map for new offices; office messages use this project's scoped HTTP APIs and Socket.IO. The legacy monolithic `App.tsx` is not mounted.
- Registration, verification, login, session security, company creation, invitations and membership use current cookie-authenticated APIs.
- Office discovery/admission uses the current workspace and office IDs, bootstrap and one-use tickets. No legacy `/ws` connection is opened.
- Two browsers must observe authoritative Vivo movement, presence, seat contention, company isolation, dropped-delta recovery and re-entry through Socket.IO. The latest post-migration run confirms the Vivo map and movement, but is not fully green because seat claiming failed.
- Owners manage invitations from the office navigation; recipients accept a valid invitation through the company directory and current API flow.
- No account/session/access secret is read from or written to `localStorage`; the single office channel is real; nearby voice is guarded and integrated in the UI but remains pending real-media acceptance; unsupported DMs/calendar/activity/editor and fixed-meeting media do not pretend to work.
- Existing licensing/provenance, accessibility, and English-first Chrome/Edge checks remain in the release evidence.

Ship each completed implementation step with its documentation, focused verification and a separate pushed commit. Full rollout and CP08 media acceptance remain separate gates.


## Single microphone control (2026-11-11)

The owner's follow-up supersedes the separate **Enable nearby voice** control. The compact
OpenOffice controlbar has one microphone icon: click to enable voice and click again to mute
or cancel a pending attempt. An unslashed icon means voice is enabled; when alone, its tooltip
and accessible help explicitly say no microphone audio is being captured. The status explanation
is visually hidden and available through the icon tooltip and `aria-describedby`, keeping the
controlbar compact. Errors remain visible in the nearby-voice sidebar.

Enabling the icon records explicit microphone intent for the current office participation and
opts in through the current API/socket flow. When the server reports a media-ready nearby pair,
the client starts the guarded session once for that context; error retries require another click.
The browser still controls capture permission. Muting disables capture, cancellation stops pending
signaling, and opt-out or Leave conversation clears microphone intent. A new office participation
requires fresh consent. There is no token request or capture while waiting alone. The sidebar
opt-in remains available; opting in there alone does not enable the microphone.

Manual test: refresh `https://localhost:8443`, join with two verified accounts, keep both Available,
click the microphone on each and move close together. Allow microphone access when prompted.
Click again to mute. While alone, the icon can be enabled/disabled without acquiring a media grant.
Web typecheck, focused ESLint and the mocked-API office browser E2E pass (1/1); the browser scenario
checks enable/cancel while alone with no token, then a single icon click followed by automatic
signaling after an authorized pair. This does not establish physical-device audio quality.
