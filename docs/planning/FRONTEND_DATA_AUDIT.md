# Frontend data and placeholder audit

Updated: 2026-11-10

This record follows the production-facing frontend at `apps/web/main.tsx`. Values in old/unmounted UI, tests, and fixed map artwork are not live user or company records.

## Completed corrections

- Removed the active `office-preview` fake channel, empty demo message/user arrays, hard-coded preview user ID, and disabled composer. The active office sidebar now renders an explicit unavailable state and, while connected, only the live participant roster from the validated office snapshot. No message API or message event exists yet; chat stays a separately scoped backend feature. See [chat messages](../entities/chat-messages/README.md) and the [completion plan](PROJECT_COMPLETION_PLAN.md#cp06-connect-the-approved-web-ui-to-the-existing-api).
- Corrected the browser-client README: the current authenticated shell mounts the versioned server-selected map, Vivo in the current environment, rather than Commons.

## Confirmed live data

- Account, company, company membership, invitations, office bootstrap, participant names, positions, availability, seats, and map version are sourced from the authenticated HTTP API or office Socket.IO snapshot.
- Loading-time `null` values and empty form inputs are state/UX defaults, not sample accounts or sample companies.
- Map geometry and furniture are approved static world content. The active map editor is not mounted, so an empty movable-object list is not an empty server dataset.

## Remaining product/API boundaries

- All office participants currently receive the map's single approved `defaultAppearance` from the server. There is no user-profile appearance persistence or picker, and the approved art catalog contains only that appearance. The frontend must not synthesize per-user looks; adding customization requires an approved catalog and the profile API work listed in [CP06](PROJECT_COMPLETION_PLAN.md#cp06-connect-the-approved-web-ui-to-the-existing-api).
- Microphone, camera, and screen indicators remain off because product media controls are disabled and the browser has no active media session. Do not infer these flags from local UI state; connect them only with the guarded media path in CP08/CP09.
- Meetings, calendar, object editing, and area renaming have no active API/realtime implementation. Their empty values are feature defaults; corresponding controls must remain unavailable until those contracts are implemented.
- The active shell brand is `Open Office`. `Gather Lite` was a stale HTML/document title and is being removed from the active entry experience. A different final product brand requires an owner-provided brand choice.
- Old localStorage office history and legacy demo workspace names remain in unmounted migration code. `main.tsx` does not import those screens. The Commons preview is available only in development through `?commons-preview=1`.

## Current implementation limits

This audit removes misleading active placeholders and records which requested data has no backend source yet. It does not claim text chat, personal avatar selection, meetings, calendar, editing, or media as implemented. The release acceptance gates remain in [ACCEPTANCE.md](ACCEPTANCE.md).
