# Acceptance and evidence register

Status: initial backend subset locally verified; deployment/media/pilot gates remain pending · Updated: 2026-11-09

Documentation review is not implementation verification. Add an evidence record with environment/build, exact scenario, observed result, measurements, date, responsible person and artifact/code link. A failed gate remains open until corrected and rerun.

| ID | Gate | Required evidence | Status |
|---|---|---|---|
| A01 | M0/M1 browser security | Cookie flags; session/CSRF rotation; anonymous bootstrap cannot overwrite existing session; exact Origin rejection; no secret storage/log leakage | Pending |
| A02 | M1 account lifecycle | Real mail, verification password proof, pending recovery, expired/superseded token rejection, concurrent reset/login/change handling | Pending |
| A03 | M1 tenant policy | ID substitution, operator/mass assignment rejection, recipient-bound invite concurrency, owner transfer and exact capacity counters | Pending |
| A04 | M2 admission | Ticket replay/expiry/epoch tests, direct socket rejection, identity spoofing, fresh reconnect/takeover, revoked membership on open socket | CP03 and CP05.1–CP05.4b local tests pass for Origin, replay, duplicate/capacity, epoch replacement, handshake limits, idle policy revocation/errors, resync, same-session takeover reference binding/replay, ordinary-conflict preservation and old-socket retirement. CP06.1–06.4 provide the typed client and controls; CP06.5/06.7 pass live two-browser admission, separate office rosters by company, shared participant state and leave through Caddy/API/Socket.IO; CP06.9 proves deliberate leave releases participation and permits fresh-ticket re-entry. CP06.10b separately verifies UI recovery in mocked Chromium and server participant removal with a real Socket.IO integration test; CP06.10c additionally passes the combined browser-to-Caddy/API heartbeat-loss and fresh re-entry scenario. Real Mongo outage, multi-instance fencing, revoked-member browser session and deployment evidence remain |
| A05 | M2 world | Server-time speed/collision, seats/exits, last-slot joins, input flood/size limits, version gaps, incompatible map/protocol, stale lease reply rejection | CP02 pure geometry plus CP05.3a/b server-time movement, Commons collision/map bounds, stale epoch/sequence rejection, per-socket movement/office-command budgets, presence delta, serialized runtime seat claims/exit/release and two-client movement delta verified locally. CP05.4a live Socket.IO resync returns current state after a missed delta and rejects a future version. CP06.5–CP06.9 real-browser tests confirm remote rendered movement/presence, room-wall collision, simultaneous seat contention with one winner, seat release, prompt movement stop, company-scoped rosters, recovery after a dropped version delta and fresh-ticket re-entry after deliberate leave. Unexpected transport-loss recovery, per-workspace/shared budgets and load remain |
| A06 | M0/M2 renderer | Cleared asset provenance, pixel scale/anchors/occlusion, React/Phaser bridge and cleanup, accessible essential controls | CP02.5 sample and CP06.3 version-checked renderer/keyboard E2E pass locally; CP06.5 confirms remote movement in the second browser; CP06.7 confirms route teardown removes the live canvas and reopening mounts one canvas; CP06.10a mocked-API Chromium E2E confirms named office control groups, Tab order, visible keyboard focus and pressed state; CP06.10b includes a desktop layout spot-check. Formal anchor/occlusion review, screen-reader audit, Chrome/Edge signoff, smooth reconciliation, and camera/zoom remain |
| A07 | M0/M3 media privacy | Original/refreshed token replay, retired generation, source limits, public bypass, controller loss, guard freeze, failed deletion, independent shutdown and measured forwarding cutoff | CP07.1–CP07.4 experimental permit/watchdog logic and separate-process SFU shutdown implemented. Real Chromium video experiments observed last decoded frames at 3498ms and 3299ms after starting the supervisor. The original unguarded restart replay failed; CP07.7 subsequently rejected that token through the restarted JWT-verifying guard with durable retirement, and measured guarded video/audio cutoff at 3460ms/3793ms. Direct SFU loopback bypass remains open. Guarded signaling, durable retirement, bypass/freeze/control-failure tests, audio and full cutoff acceptance remain open |
| A08 | M3/M4 media UX | Permission denial, off-by-default devices, explicit share, TURN-only/weak network, migration interruption, fixed-zone capacity and isolation | Pending |
| A09 | M1/M5 delivery | Enqueue boundary crash, duplicate worker, ambiguous email acknowledgement, encrypted secret purge, expired delivery, cache pressure isolated from queue | Pending |
| A10 | M5 operations | Fresh epochs on restart, no unguarded fallback, alerting, declared 20-user workload, measured join targets, safe restore with old credentials/access blocked | Pending |
| A11 | M1–M5 B2B SaaS | Cross-company API/socket/invite/media/job isolation; independent multi-company roles; clear current-company context; specified tenant suspension/offboarding; noisy-neighbor limits and shared-media shutdown blast radius | Pending |

## A06 CP02.5 local renderer sample

On 2026-11-08, Codex verified the development preview with Phaser 4.2.1 and Headless Chrome 152.0.7977.42 on macOS 26.6.1 arm64. The test compared avatar pixels against the catalog, confirmed the shared `(80,80)` anchor and verified 94 pixels where the chair foreground covered the seated sprite. It observed nearest-neighbor drawing and used keyboard controls through three clean close/reopen cycles. A blocked sprite displayed an error in the live status region, disabled Sit and recovered after reopening. The production bundle excluded the preview. See the [CP02.5 evidence](CP02_WORLD_AND_MAP.md#cp025-renderer-sample).

## Evidence record template

```text
Acceptance ID / related entity:
Build and pinned dependency versions:
Environment and hardware/network profile:
Responsible person and date:
Scenario and fault injection:
Expected behavior and budget:
Observed result and measurements:
Evidence/code links:
Pass/fail and remaining limitations:
```

All P1 security controls inherited from the source brief must have evidence before pilot signoff. Assign deployment, recovery and patching owners. No capacity, recovery or revocation guarantee is verified by this register's existence.

Initial backend evidence is recorded in [AUTH_IMPLEMENTATION_EVIDENCE.md](AUTH_IMPLEMENTATION_EVIDENCE.md). It covers local portions of A01–A03 and A09; actual email/provider/deployed-origin/queue/recovery requirements remain pending, so the full release gates above are not marked passed.
