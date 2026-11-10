# Frontend data and placeholder audit

Updated: 2026-11-10

This record follows the production-facing frontend at `apps/web/main.tsx`. Values in old/unmounted UI, tests, and fixed map artwork are not live user or company records.

## Completed corrections

- Removed the active `office-preview` fake channel, empty demo message/user arrays, hard-coded preview user ID, and disabled composer. CP06.11 now renders the supplied OpenOfficeForAll chat view with company-member names, authenticated message history/send APIs and office-room `chat:message` broadcasts. The fixed office channel retains messages for 90 days. DMs, nearby text chat, attachments and channel editing remain unavailable. CP08.3b adds guarded microphone-only proximity voice controls; real audio remains unverified, while fixed-meeting camera and screen sharing await CP09. See [chat messages](../entities/chat-messages/README.md), [media contract](../contracts/MEDIA.md) and [completion plan](PROJECT_COMPLETION_PLAN.md).
- Corrected the browser-client README: the current authenticated shell mounts the versioned server-selected map, Vivo in the current environment, rather than Commons.
- Removed the client-side `vivo` map fallback. The renderer now requires the map ID from the validated office bootstrap and shows a recoverable navigation message if connected state is incomplete.
- Centralized the active app name as `Open Office` and removed the stale `Gather Lite` title/description from the active browser entry experience.
- The live-map adapter now maps the current server-approved `commons-worker:teal` appearance into the matching base sprite look. It no longer invents off-state microphone/camera/screen flags for participants when the office snapshot contains no media state.

## Confirmed live data

- Account, company, company membership, invitations, office bootstrap, participant names, positions, availability, seats, and map version are sourced from the authenticated HTTP API or office Socket.IO snapshot.
- Loading-time `null` values and empty form inputs are state/UX defaults, not sample accounts or sample companies.
- Map geometry and furniture are approved static world content. The active map editor is not mounted, so an empty movable-object list is not an empty server dataset.

## Remaining product/API boundaries

- All office participants currently receive the map's single approved `defaultAppearance` from the server. There is no user-profile appearance persistence or picker, and the approved art catalog contains only that appearance. The frontend renders that server value; it does not synthesize per-user looks. Adding customization requires an approved catalog and profile API work in the [completion plan](PROJECT_COMPLETION_PLAN.md).
- The office snapshot has no microphone, camera, or screen state. The live map no longer fabricates `false` flags. Product controls stay disabled until the guarded media path in CP08/CP09 supplies authorized state.
- Meetings, calendar, object editing, and area renaming have no active API/realtime implementation. Their empty values are feature defaults; corresponding controls must remain unavailable until those contracts are implemented.
- The active shell brand is `Open Office`, defined in one frontend constant. A different final product brand requires an owner-provided brand choice.
- Old localStorage office history and legacy demo workspace names remain in unmounted migration code. `main.tsx` does not import those screens. The Commons preview is available only in development through `?commons-preview=1`.

## Current implementation limits

This audit removes misleading active placeholders and records which requested data has no backend source yet. It does not claim personal avatar selection, meetings, calendar, editing, or product media as implemented. The release acceptance gates remain in [ACCEPTANCE.md](ACCEPTANCE.md).
