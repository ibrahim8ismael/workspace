# Character position consistency and proximity audio recovery

Date: 2026-11-15. Status: client position/input fixes and local OrbStack API/media acceptance completed; production-device and external-network acceptance remain pending.

## Objective and definition of correctness

Every participant must have one authoritative world position, owned by the office runtime. Clients receiving the same office epoch and state version must store identical authoritative coordinates. Rendering may intentionally lag for smoothing, but must converge after movement stops and must never become a second source of position authority.

Proximity pairing must continue to use server positions exclusively. Fix the discrepancy between what users see and what the server evaluates, and separately establish why each reported audio interruption occurs. Exact agreement at the same wall-clock instant across a network is not a realistic acceptance criterion; exact agreement for the same authoritative version is.

## Findings from the current code

| Finding | Evidence | Consequence / confidence |
| --- | --- | --- |
| The server already owns motion and proximity decisions. | `office-runtime.service.ts`: `setMovementIntent`, `tick`, `proximityCandidates`; `proximity-pairing.ts`: `distanceTiles`. | Confirmed. Clients submit direction, not coordinates. Replacing the architecture with server authority is unnecessary. |
| Vivo renders its own independent local tile simulation. | `VivoScene.tsx`: `tile`, `step`, `local`, animation-frame `tick`, local avatar layer. `CompanyOfficePreview.tsx` passes `onMove={() => {}}` and sends only movement intent. | Confirmed. Local completion does not establish that the server reached the displayed point. |
| Ordinary authoritative position updates do not reconcile the local avatar. | Vivo initializes from `self` when identity changes and resets on seat transitions; remote updates explicitly skip `selfId`. | Confirmed. Normal walking and resync position changes cannot reliably eliminate local drift. |
| Local initialization and seat rendering quantize coordinates to tile centers. | `tileOf` followed by `tileCenter` in Vivo initialization, seat effects and the seated local avatar layer. | Confirmed. Fractional server positions are lost locally, while remote targets retain their received coordinates. |
| Keyboard release can stop the server before the local tile animation finishes. | Vivo `up` emits `(0,0)` immediately; an existing `step.current` continues to completion. | Confirmed control-flow mismatch. Size depends on input timing and server/network scheduling. |
| Refresh of held intent depends on completing a rendered tile step. | Vivo sends nonzero intent when starting `next`; server expires it after 250 ms. | Confirmed coupling. Low FPS, long frames or background suspension can interrupt server motion while local animation advances. |
| Diagonal path steps use cardinal duration locally. | `navigation.ts` allows diagonal neighbours; Vivo applies the same `STEP_MS` for any step. Server normalizes `dx,dy` with `Math.hypot`. | Confirmed mismatch on diagonal click routes. A 32-by-32 local diagonal covers about 45.25 px while the server covers 32 px over the nominal step interval. |
| Step completion discards extra frame time. | Local `progress` is clamped and a subsequent step starts at the current frame time. | Confirmed mechanism for FPS-dependent pace. Impact must be measured in the actual scene. |
| Remote smoothing uses receipt time and a fixed tile duration. | Vivo `remotes` effect and frame loop interpolate over `STEP_MS`; the adapter does not pass snapshot version/time to the scene. | Confirmed. During motion different packet arrival times can yield different rendered positions without inconsistent authoritative state. |
| Existing proximity already has hysteresis. | Join at <=2 tiles, leave beyond 3 tiles continuously for 500 ms, evaluated server-side. | Confirmed: 64/96 px for a 32 px tile. A small fluctuation around the join threshold alone cannot explain an established call ending. |
| World delta application checks epoch/base version, but full snapshot handling lacks an explicit monotonic version guard. | `world-state.ts`; `OfficeClient` `world:snapshot` handler. | Confirmed defensive gap, not a demonstrated incident. Exercise in recovery tests before changing behavior. |

Existing live E2E checks prove an observer sees movement, but do not assert that the mover's own rendered coordinates converge to the observer's and the server's. World-state tests cover deltas/gaps; runtime tests cover speed/diagonals; pairing tests cover exit debounce. They do not jointly prove cross-device positional consistency.

The timing arithmetic was checked with a small Node calculation: with a nominal 166.67 ms step, frame-boundary completion can produce a 200 ms step at 15 FPS (160 px/s rather than 192 px/s). This illustrates the inspected algorithm; it is not a browser reproduction or production measurement.

## What is not yet established

- Whether reported devices disagree only in rendered coordinates or also in the accepted authoritative version/state.
- Which of the confirmed mismatches contributes most in the affected sessions.
- Whether each audio drop follows a server `ended` transition, availability/opt-out change, authorization expiry, media transport failure, token/generation change or browser playback failure.
- Whether deployed clients/API are the same revision as this checkout, with the same map and protocol versions.
- Whether latency, CPU stalls, collisions or diagonal navigation are the dominant trigger.

Do not label every audio failure a coordinate bug. A server pair that remains active while media becomes silent needs media-path investigation even after position consistency is fixed.

## Proposed design

### 1. One world-space model and explicit render state

Keep pixel coordinates, top-left world origin, x right and y down. Preserve the exact server `position` values; do not round them, center them on a tile, or convert through screen coordinates. Treat `footOf`, seat art offsets, camera transforms, SVG rounding, zoom and DPR as presentation only. Document map-specific sprite anchors so tests compare logical world points rather than artwork transforms.

Maintain authoritative state separately from rendered state. Pass epoch, state version and snapshot timing through the Vivo adapter. Reset render buffers on identity/epoch/map changes, disconnect, and explicit seat/teleport transitions. A sprite change must not modify authoritative coordinates.

### 2. First repair: render server motion for both self and others

For the connected office, remove the independent tile-step position simulation from the local avatar path. Drive local and remote targets from accepted world snapshots, with the same time-based rendering component. Retain the standalone scene's behavior behind its existing non-networked mode.

Use a bounded snapshot buffer and interpolate between authoritative samples on a monotonic render timeline. Start with a proposed 100–150 ms presentation buffer, then tune against measured arrival jitter. Define a stable mapping to the server timeline; do not subtract wall clocks from `performance.now()`. Preserve stationary participant samples correctly when deltas only update other participants. Freeze at the newest authoritative point when samples run out; do not extrapolate indefinitely.

After the buffer drains, self and remote render positions must equal the latest accepted position. Snap on discontinuities such as seats, epoch replacement and recovery corrections that cannot safely be interpolated. Cosmetic animation and camera smoothing may run every frame without changing world state.

This baseline prioritizes convergence and makes causal testing straightforward. Measure local input-to-visible-motion latency before shipping: if the additional network/render delay is unacceptable, add prediction as a separate gated phase below. Do not quietly retain the existing unreconciled simulation to disguise latency.

### 3. Decouple input from rendering and tile completion

Create a movement controller that represents current desired direction and sends direction changes immediately, a held-input heartbeat initially every 100 ms, and one immediate stop on release/cancellation. Keep aggregate traffic below the 30/s budget, including rapid direction changes; reserve capacity for stop rather than queueing stale movement. Use latest-state semantics while rate limited. Observe rejected inputs in diagnostics.

No input cadence may depend on sprite completion. On blur, hidden tab, lost focus into controls, disconnect, away/editing transitions or teardown, clear held state/routes and send a best-effort stop. Background suspension must never be compensated by replaying elapsed movement on return. The existing 250 ms server intent timeout remains the safety fallback; do not increase it to conceal drift.

### 4. Make click navigation follow actual server progress

Keep pathfinding as a planner. Compute the next desired direction from the current authoritative position and waypoint; advance a waypoint only after actual progress reaches its acceptance region. Stop/replan if the server blocks movement, the seat becomes occupied, or progress stalls. Avoid oscillation around a waypoint by using a proposed tolerance based on maximum travel per server tick (currently up to 9.6 px), validated near walls and seat entry points.

Use actual pixel deltas toward the waypoint, including partial-tile starting positions. Never consume a path step just because a local animation completed. Preserve the server's existing normalized diagonal speed, collision and seat authority. Verify exact target behavior with the direction-only protocol; if precise arrival requires a server-owned navigation target, define and version that command separately rather than sending client-owned coordinates as authoritative movement.

### 5. Harden recovery and assess server timing separately

Require monotonic accepted versions within an epoch for full snapshots, retain contiguous delta validation, and test old socket callbacks/reconnect generations. Introduce a bounded resync watchdog/retry only where tests demonstrate a lost acknowledgement or snapshot can otherwise strand recovery; respect the existing resync rate budget. Clear old render/input state on successful replacement.

Current server ticks cap elapsed motion to one 50 ms interval and discard excess elapsed time. All clients still share that server result, so this is not independent client authority. Instrument tick gaps first. If real stalls impair motion materially, use a bounded fixed-step accumulator with explicit overload behavior and tests for input expiry and collision substeps. Do not bundle a server timing rewrite into the initial renderer repair without evidence.

### 6. Optional prediction, only if the latency gate requires it

The current input sequence acknowledges the latest direction intent; it does not describe how long every command was simulated. Replaying these intents as fixed movement steps would be incorrect.

If prediction is required, first define a versioned fixed-tick input/ack contract, input history bounds, tick duration, collision parity, timeout semantics and correction policy. Use shared deterministic movement integration, restore the authoritative acknowledged state and replay only unacknowledged simulation inputs. Smooth the visual correction while keeping authority separate; hard reset on seats/reconnect/large errors. Test this model before enabling it. Avoid fixed-point conversion or extra decimal places unless measured deterministic error justifies them.

## Implementation batches and exit gates

| Batch | Changes / likely files | Exit gate |
| --- | --- | --- |
| P0: reproduce and observe | Test-only/dev probes in Vivo, office client/runtime and proximity/media transition boundaries; extend `tests/e2e/live-office.spec.ts`. | Capture one trace linking authoritative coordinates, rendered coordinates, input and pair/media events across two clients. A regression assertion fails on current code. |
| P1: authoritative presentation | `VivoScene.tsx`, `CompanyOfficePreview.tsx`, new reusable render buffer/controller under office feature. | Both views converge to exact authoritative logical coordinates after stop, collision, resync and seat transitions. No normal movement tile-centering. |
| P2: input and navigation | Vivo keyboard/click integration; isolated movement controller; navigation adapter. | Immediate stop, heartbeat safety and server-progress routing pass across frame rates; diagonal speed and collisions match server behavior. Deliver with P1 before general release so click navigation is not regressed. |
| P3: recovery guards | `office-client.ts`, `world-state.ts` and focused tests as needed. | Old versions/generations cannot roll position backward; gaps recover without stale render state or unbounded retries. |
| P4: proximity and real audio acceptance | Pairing tests, live browser/media tests, transition diagnostics. | No positional false exits while authoritative participants remain within the leave radius; actual remote audio survives stationary/boundary tests. Each induced interruption has a classified cause. |
| P5: responsiveness decision | Measure P1–P4 latency and correction metrics. | Ship baseline if acceptable; otherwise complete the separate prediction contract and verification before enabling prediction. |

Do not change join/leave distances or debounce in P1–P4 to make failures disappear. Radius/product-policy tuning is a separate decision after positional correctness.

## Diagnostics needed for causal evidence

Use bounded dev/test trace buffers and sampled production metrics. Record epoch/map/build/protocol, participation, state version, authoritative x/y, render x/y, render sample time, input sequence/direction/send/accept/expiry, RTT, delta arrival intervals, frame gaps and server tick gaps. Match clients by epoch/version; do not compare unrelated latest snapshots.

For pair transitions, record reason (`distance_exit`, eligibility loss, explicit leave, disconnect/removal), authoritative distance, thresholds and `outsideSince`. Add reason metadata at the internal transition/log boundary first; exposing it to clients requires an explicit contract update. Correlate conversation/version/generation with media connect/reconnect/disconnect, permit/token lifecycle, playback state and received audio statistics. Do not log tokens, audio contents or unbounded per-frame participant locations.

Distinguish three errors: authoritative disagreement for an identical version, expected movement/render lag, and residual render offset after stop. Only the last two can be evaluated as pixel distances without first aligning versions/times.

## Verification matrix

1. **Deterministic unit tests:** renderer sample interpolation and final convergence, fractional coordinates, stop halfway through a tile, diagonal routes, large frame gaps, monotonic snapshots, epoch reset, seats and teleports. Fake clocks must drive controller tests.
2. **Runtime/controller integration:** cardinal and diagonal speed parity; held input refresh and expiry; stop under burst budget; blocked movement and stalled routes; seat contention; tick-stall behavior if changed. Retain server-side validation and client isolation.
3. **Two independent browser contexts:** compare each participant's authoritative state in both clients at the same version and their rendered logical positions after settling. Exercise keyboard taps/holds, repeated direction changes, click paths, walls, occupied seats, resync, disconnect/rejoin and background/foreground transitions.
4. **Device/presentation variants:** 15/30/60/120 FPS schedules, CPU pressure, viewport sizes, zoom 0.75/1/1.35/2 and DPR 1/2. Use controlled clocks for determinism and real device runs for actual browser throttling; viewport emulation alone is not a second-device reproduction.
5. **Network variants:** no injected delay, 50/150/300 ms RTT targets, variable jitter, brief disconnect and dropped application delta. Verify measured transport behavior in both directions; browser HTTP throttling must not be assumed to shape WebSocket traffic. A lost delta case needs a subsequent delta to expose a gap, or explicit resync.
6. **Proximity boundaries:** 64 and 96 px, ±0.01/±1 px, fractional and diagonal distances; outside for 499 vs 500 ms; leave/re-enter before timeout; opt-out/away/disconnect must still end promptly. Test stable existing pairs separately from initial join.
7. **Real media:** two opted-in users with microphones and subscribed remote tracks. Monitor received audio energy/bytes, not only a `live` label. Run stationary and boundary cases plus intentional network/media faults. A fake media test cannot establish audible continuity.

## Proposed measurable acceptance criteria

- Authoritative x/y are exactly equal across clients for the same epoch/version; no tolerance hides differing state.
- At rest, rendered logical coordinates are within 0.01 px of the latest authoritative point after the presentation buffer drains; raster/SVG rounding may differ by up to 1 world px. Test anchors before applying this allowance.
- In the no-injected-delay test profile, stop-to-convergence is <=500 ms. For degraded profiles report separate measured convergence bounds derived from RTT, server tick, broadcast and buffer delay; never claim simultaneous frames across devices.
- No error accumulation over a 10-minute mixed keyboard/click route; all clients converge after every stop. No local movement persists after the server rejects or expires intent.
- With authority stationary inside 96 px, no server `distance_exit` occurs during a 5-minute established pair test. After continuous authoritative separation beyond 96 px, end at the first reconciliation at/after 500 ms; allow one nominal simulation interval in unstalled tests and report scheduling stalls separately.
- Within 64 px, eligible unpaired users enter pairing on reconciliation. Existing pair occupancy and explicit-leave suppression remain intentional exceptions.
- In a controlled healthy media run, no unexplained audio interruption longer than 500 ms over 5 minutes. Injected network failures must be identified separately from positional false exits. This media budget is proposed and must be measured against the deployed stack.
- Report P50/P95 input-to-visible-motion latency for the authoritative baseline. Proposed healthy-profile P95 target: <=250 ms. If unmet, the prediction phase is a prerequisite to release or requires an explicit product decision on responsiveness.

Run focused web/world/contracts/API checks per changed layer, then the existing live two-browser and media suites with their required fixtures. Run repository formatting/lint/typecheck and affected builds before handoff. Record actual commands, profiles, trace artifacts and results; unchecked criteria remain pending.

## Scope and current handoff

Recommended first implementation: P0, followed by P1/P2 together, then P3/P4 and the P5 latency decision. Preserve the authoritative runtime, proximity policy, permission boundaries and standalone renderer behavior. No production thresholds, protocol or simulation code have been modified by this investigation.

The original investigation baseline used source inspection and a timing calculation. Controlled browser reproduction, focused regressions, live local API movement, and local synthetic-media continuity are now complete as recorded below. Physical microphone testing and external-network acceptance remain pending.

## Implementation and controlled evidence (2026-11-15)

The networked Vivo path now renders the connected participant from accepted world positions using the same receipt-time interpolation used for remote participants. Logical coordinates remain fractional and are not tile-centered. Seat transitions snap to the authoritative seat position. The standalone scene keeps its local tile simulation. The interpolation reuses the existing 166.67 ms `STEP_MS` tween from each sample's local receipt time; it does not add the proposed shared server-timeline snapshot buffer because the adapter has no server-to-monotonic clock mapping. Thus convergence is verified for identical versions after settling, while simultaneous in-motion samples may still be at different points during network delay.

Keyboard and click-route intents now run on a 100 ms timer independent of animation frames. Direction changes are sent immediately when allowed by the input limiter; key release, blur, hidden-tab, and teardown send a stop. Movement traffic allows at most 28 non-stop inputs in any rolling second and reserves two slots for stops under the server's 30/s limit. Click navigation advances each axis when the authoritative position reaches or crosses that waypoint axis, avoids tiny perpendicular corrections, and cancels after one second without server progress. Full snapshots now reject older versions in the current epoch, and old socket generations cannot apply world callbacks.

The exact regression is `tests/e2e/vivo-position-sync.spec.ts`. It opens two independent Chromium contexts against a controlled snapshot feed, reads fractional logical world coordinates from the avatar's world-position wrapper, and matches both observations to the same epoch and version. The final combined browser run measured **19.494 px** legacy self-vs-peer render drift at version 2 while both raw authoritative positions were `(828.8, 1267.375)`. The authoritative renderer from initial mount produced **0.000 px** residual at version 3, with both render positions exactly `(828.8, 1267.375)`. A separate controlled run measured 51.311 px of legacy drift. This drift varies with local animation frame timing. These are controlled client measurements, not measurements from the API runtime or production devices.

The final combined browser run measured **103.7 ms** from the first input intent to first visible movement, **18.7 ms** from delivery of the next mocked snapshot to the first rendered change, and a maximum **9.38 px** per-frame delta over a continuous five-snapshot stream. A separate run measured 96.5 ms, 4.4 ms and 8.93 px respectively. The test exercises held-input heartbeats, immediate stop on release, route advancement across two authoritative waypoints, and stop after a stalled route. The input-to-visible measurement excludes network and server delay, so it does not establish the end-to-end P95 latency gate. The test waits up to 220 ms for a stopped snapshot to settle and then compares both browser contexts exactly.

Focused checks completed:

- `pnpm --filter @gather/web typecheck` — passed.
- `pnpm --filter @gather/web exec vitest run --config vitest.config.ts` — 46 tests passed.
- `pnpm --filter @gather/api exec vitest run --config vitest.config.ts test/office-runtime.test.ts test/proximity-pairing.test.ts` — 16 tests passed, including boundary jitter/re-entry.
- `pnpm exec playwright test tests/e2e/vivo-position-sync.spec.ts --workers=1` — passed with the controlled position, heartbeat, rate, stop, continuous stream, route waypoint, and stalled-route checks.
- `pnpm exec playwright test tests/e2e/vivo-position-sync.spec.ts tests/e2e/company-office-preview.spec.ts --workers=1` — both browser tests passed after the final route fixture adjustment.
- `pnpm --filter @gather/web build` — passed; test fixture HTML is not part of the production bundle.
- Targeted ESLint and Prettier checks across all changed TypeScript/TSX and planning files — passed.

The server pairing rule was not changed. The added jitter test covers positions at 96, 96.01 and 97 px and verifies the existing 500 ms exit debounce and re-entry reset. The earlier Docker Desktop failure was resolved by starting OrbStack and explicitly selecting its context; the machine has OrbStack Engine 29.8.2 (`linux/aarch64`). The pre-existing gather-lite containers and volumes were retained, and unrelated crew Postgres/Redis containers were not touched.

## Live OrbStack evidence (2026-11-15)

All live API and media tests below used the repository's local compose files and the `orbstack` Docker context. The private test settings remained in ignored `infra/.env.local` and `infra/.env.media-e2e`; credentials were not printed. The media overlay used the host-assigned private IPv4 `192.168.1.4`, with the helper restricted to that host and the SFU peers. The API and web stayed on localhost. The local CA was exported only to `/private/tmp/gather-local-root.crt`; OS certificate trust was not changed.

The documented setup commands passed:

```sh
orb start
docker --context orbstack info --format '{{.ServerVersion}} {{.OSType}}/{{.Architecture}}'
docker --context orbstack compose --env-file infra/.env.local --profile setup \
  -f infra/compose.yaml run --rm indexes
docker --context orbstack compose --env-file infra/.env.media-e2e \
  -f infra/compose.yaml -f infra/compose.media-e2e.yaml \
  --profile app --profile media-e2e up --build -d
node infra/configure-media-e2e-network.mjs 192.168.1.4 orbstack
docker --context orbstack compose --env-file infra/.env.media-e2e \
  -f infra/compose.yaml -f infra/compose.media-e2e.yaml \
  --profile app --profile media-e2e up -d media-livekit
node infra/configure-media-e2e-network.mjs 192.168.1.4 orbstack --check
docker --context orbstack compose --env-file infra/.env.media-e2e \
  -f infra/compose.yaml -f infra/compose.media-e2e.yaml \
  --profile app --profile worker --profile media-e2e up --build -d worker
```

Mongo index setup reported “Backend indexes created. No indexes were dropped.” The media-network `--check` passed. A CA-validated `curl --cacert /private/tmp/gather-local-root.crt https://localhost:8443/api/health/live` returned `{"status":"ok","service":"api"}`.

The live API-backed two-browser acceptance ran with:

```sh
LIVE_OFFICE_E2E=1 pnpm exec playwright test tests/e2e/live-office.spec.ts \
  --grep 'live two-browser Vivo admission' --workers=1 --timeout=180000 \
  --output=/tmp/gather-live-api-rerun
```

It passed the real registration/verification and invitation flow, office admission, movement, seat race, dropped-delta resync, disconnect/rejoin, and company isolation. Movement became visible to the peer **140.3 ms** after input, observed across **77** animation frames with a maximum logical rendered step of **4.58 px**. At the matching office epoch and version 14, both clients reported authoritative `(867.2, 1264)`; after the interpolation settled, both owner and peer rendered exactly `(867.2, 1264)`, a **0 px** logical residual. This is one local run, not a latency percentile or an external-device/network result.

The media tests used Chromium's synthetic capture device and the real local LiveKit/SFU/WebRTC path. To reproduce the continuous five-minute source:

```sh
node tests/e2e/create-continuous-tone.mjs /private/tmp/gather-office-continuous-tone.wav
LIVE_OFFICE_E2E=1 LIVE_OFFICE_MEDIA_E2E=1 \
  LIVE_OFFICE_FAKE_AUDIO_WAV=/private/tmp/gather-office-continuous-tone.wav \
  pnpm exec playwright test tests/e2e/live-office.spec.ts \
  --grep 'carries and cuts off live nearby audio' --workers=1 --timeout=420000 \
  --output=/tmp/gather-live-audio-wav-rerun
```

The helper writes a **3-second, 48 kHz, mono, 16-bit PCM, 440 Hz** WAV. Chromium replays the file as fake microphone input. The five-minute stationary run passed in **5.4 minutes**. Each direction observed more than 15,000 energy-active samples, **0 ms** maximum quiet window, and no callback interval over **33 ms**. At five minutes each inbound stream had about **3.72 MB**, **15,065–15,066 RTP packets**, **0 packets lost**, and about **14.46 million received samples**; each outbound stream had about **3.72 MB** and **15,068 packets**. Explicit conversation leave ended decoded audio with a **236 ms upper bound** while both maps remained mounted.

The browser's default fake microphone produced only **4,205/4,375 active samples** in five minutes and observed **759/740 ms** quiet windows in the initial probe. That run failed the proposed 500 ms energy-gap criterion. It did not record callback cadence, so those quiet windows could not distinguish source silence from a probe scheduling gap. With the controlled continuous WAV, all callbacks were active, callback cadence was regular, inbound RTP counters advanced continuously, and packet loss remained zero. The default-source observation is retained as a harness/source distinction, not hidden by changing the 500 ms criterion.

The strict continuous-energy cutoff is enforced only for Chromium runs with `LIVE_OFFICE_FAKE_AUDIO_WAV` set and without the mixed-browser mode. Firefox's synthetic capture preferences do not consume Chromium's WAV file; Firefox/mixed runs still report decoded energy and RTP metrics but do not apply the continuous-tone energy-gap budget.

The real nearby-radius test passed in **31.1 seconds** with the same synthetic source. It measured an initial **32 px** pair, remained paired with decoded audio at **74.20 px** (between the 64 px join and 96 px leave thresholds), ended the pair and removed audio after continuous movement to **100.95 px**, then returned within **37.19 px** and restored decoded audio both ways. Server thresholds and the 500 ms debounce were unchanged.

The test source and repeatable WAV generator are `tests/e2e/live-office.spec.ts`, `tests/e2e/create-continuous-tone.mjs`, and `playwright.config.ts`; `pnpm test:e2e:live-media` now generates the same fixture before running the mounted Vivo suite. E2E traces/screenshots and the WAV remain under `/tmp` and `/private/tmp`; they are not repository artifacts. The app, worker, Mailpit and media fixture are left running on OrbStack for local review at `https://localhost:8443` and `http://localhost:8025`. Named volumes and local settings are retained. This acceptance is limited to two local Chromium contexts, synthetic audio, localhost signaling, and an SFU bound to the host's private LAN address. Real microphones, Firefox mixed-browser, external networks, and production deployments still require separate acceptance.
