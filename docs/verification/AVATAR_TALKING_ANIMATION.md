# Avatar talking animation verification

Verified on 2026-11-16 against the local OrbStack stack with two independent Chromium
browser contexts, separate authenticated users, and the mounted Vivo office.

The test replaces only microphone capture with a Web Audio oscillator whose gain can
switch between audio and digital silence. The stream passes through actual LiveKit
publication, the local media guard and SFU, and LiveKit active-speaker detection. No
speaker events, office API responses, or WebSocket traffic are mocked. This verifies
controlled audio activity; natural speech and background-noise behavior were not measured.

| Source client | Indicator visible on both clients | Hidden after silence on both | Hidden after mute on both |
| --- | --- | --- | --- |
| 1 | 995 ms | 1408 ms | 162 ms |
| 2 | 822 ms | 846 ms | 147 ms |

These are elapsed polling observations from one local run, including browser assertion
latency, rather than production latency guarantees. Active-speaker detection has a
short silence release delay. Mute events also refresh speaker state directly, so muted
participants are cleared without waiting for that release interval.

The silent partner stayed unmarked. The test verified running CSS animation on the
remote avatar, and `animation-name: none` with reduced motion enabled. Screenshots
were captured for both speaking directions. Session unit tests also verify clearing
speaker state on reconnect and stop and ignoring callbacks from an old session.

The initial run detected an outdated local API protocol. The API and guard were
updated from current main before the successful run. Compiled frontend/API outputs
were layered onto existing local runtime images; this was not a clean Dockerfile build.

Reproduce with a matching current-main API, frontend and guard using the local
media Compose profile described in `infra/README.md`:

```sh
LIVE_OFFICE_E2E=1 LIVE_OFFICE_MEDIA_E2E=1 \
  pnpm exec playwright test tests/e2e/live-office.spec.ts \
  -g 'talking animation' --workers=1
```

The test attaches JSON timings and saves `client-1-talking.png` and
`client-2-talking.png` in its Playwright output directory. It is opt-in and skipped
by the standard E2E run when the live-stack environment variables are absent.
