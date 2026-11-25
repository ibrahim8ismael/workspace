# Meeting screen-sharing MVP operations

Screen sharing is controlled by `SCREEN_SHARE_ENABLED`. The API defaults it to `false`; only the exact value `true` enables reservations and screen-video publish permits. The server sends the value in `office:ready`, so clients hide presenter controls while disabled. A disabled runtime rejects both reservation and confirmation commands and only issues microphone permits. Viewers can still receive a share if one is already represented in their current session.

## Pilot browser support

| Client | Start a share | View a share |
| --- | --- | --- |
| Desktop Chrome / Chromium | Supported, 1280×720 at 15 fps maximum | Supported |
| Desktop Microsoft Edge | Supported, 1280×720 at 15 fps maximum | Supported |
| Desktop Firefox | View-only for the pilot | Supported when the browser can receive the LiveKit video track |
| Safari | View-only for the pilot | Supported when the browser can receive the LiveKit video track |
| Mobile browsers | View-only; native capture controls are hidden | Supported, including fullscreen where the browser exposes it |

Publishing is allowlisted to desktop Chrome/Chromium and Edge with `getDisplayMedia`. The allowlist excludes mobile Chromium variants, Opera, and iPad desktop mode. Firefox and Safari publishing remain disabled until real browser capture and LiveKit publication tests pass on supported desktop operating systems. The automated Chromium real-media scenario exercises video capture, publication over the existing meeting connection, and viewer rendering. Playwright WebKit is not a substitute for macOS Safari certification.

Capture requests cap the display track at 1280×720 and 15 fps, with audio disabled. The ticket's pilot load target is one 20-participant meeting or several smaller simultaneous meetings. This target is separate from the office's registered-user ceiling; it is not a claim of tested production capacity.

## Operational measurements

The media guard can scrape aggregate measurements with `POST /api/media/internal/metrics/meeting-screen-share` and an HMAC-SHA256 `X-CP07-Signature` over the exact request body `{}` using the configured `MEDIA_MACHINE_KEY`. The route uses the same machine authentication guard as policy pull/ack and returns no user, room, participation, or share identifiers.

The response includes start attempts, successful confirmations, bounded failure reasons, active and starting share counts, viewer time-to-first-frame sample count/average/maximum, unexpected presenter disconnects, API process RSS/heap and CPU since the prior scrape, and LiveKit room/participant counts from the authenticated RoomService API. First-frame latency is reported by a subscribed viewer after its first decoded video frame; treat it as an aggregate product signal rather than a trusted authorization or billing measurement. A missing/unreachable LiveKit API is marked in the snapshot.

## Disable and rollback

1. Set `SCREEN_SHARE_ENABLED=false` on every API instance; an unset value is already disabled.
2. Restart all API instances so each instance sends `features.screenSharing=false` and refuses both start and confirmation commands.
3. Confirm the media guard's next signed policy snapshot contains microphone-only permits for meeting participants. Existing screen credentials must not restore screen-video publishing after the new policy is acknowledged.
4. Confirm the Share Screen control is absent after clients reconnect and that meeting microphone audio remains available.
5. Confirm the aggregate metrics endpoint reports `screenSharingEnabled=false` and zero active shares after the old API runtime and LiveKit presenter sessions have been retired.

Because this flag is read at API startup, a mixed rollout with enabled and disabled API instances is not a completed rollback. Do not re-enable the flag until the browser, policy, room continuity, revocation, lifecycle, and feature-gate checks pass together.
