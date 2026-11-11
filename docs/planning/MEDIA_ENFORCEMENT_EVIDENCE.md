# CP07 media enforcement evidence

Date: 2026-11-10. Implementer/reviewer: Codex. Scope: local isolated enforcement spike on OrbStack/macOS, not deployment or A07 release acceptance.

## Reproducible profile

- LiveKit server v1.13.11: `sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20`.
- Node container 24.18.0: `sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`.
- Browser SDK 2.23.0, server SDK 2.19.2; Playwright 1.65.0 / Chromium 158.0.8127.18.
- Four actual browser participants, two authorized fixture rooms, synthetic video and 660Hz audio. Private machine-authenticated synthetic policy authority; no real accounts or external recipients.
- Guard/controller run separately in the SFU network namespace. Signaling/admin 7880 and policy 7886 bind namespace loopback and are not published. Guard 17885 and ICE/TCP 17881 are published only to host loopback. TURN is disabled and UDP is not host-published in this profile. Guard only forwards explicit `/rtc`, `/rtc/v1` and matching validation paths; all other routes are denied.

```sh
pnpm test:media-spike
node spikes/media-enforcement/media-cutoff.mjs --run-local --isolated --policy-loss --guarded-supervisor --supervisor-crash --sfu-lease --freeze-guard --source-permissions --company-isolation --failed-room-delete
node spikes/media-enforcement/media-cutoff.mjs --run-local --isolated --policy-loss --delay-policy --guarded-supervisor --supervisor-crash --sfu-lease --source-permissions --company-isolation
```

These commands intentionally create disposable local containers and listeners and terminate only those fixtures. Secrets are random, ephemeral and excluded from output. Use an owner-authorized isolated development machine. Full code and historical failures are in [the spike](../../spikes/media-enforcement/README.md) and [implementation progress](IMPLEMENTATION_PROGRESS.md).

## Mechanism and measurements

JWT verification binds identity/room/publication sources to expiring policy state and deny-only durable generation tombstones. Signed pulls use new nonces, boot epochs and monotonic request-start deadlines. The supervisor's expected/installed snapshot version is the verified authority sequence, not a local counter. Late or unauthenticated responses produce no installation ACK.

Host watchdog and separate crash/uncertain-stop guardian enforce one immutable labelled no-restart SFU target. Independently, SFU's PID-1 lease wrapper kills its own LiveKit child on request-start lease expiry without Docker control. It starts no LiveKit child before a fresh post-boot policy request succeeds. Lease state is allow-transient; only denial survives in retirement storage.

| Scenario | Observed evidence | Result in this profile |
| --- | --- | --- |
| Wrong identity/room/signature, expired token, broad publisher and screen-audio source | Actual guarded joins rejected; positive media controls succeed | Passed |
| Source limits against modified SDK permission object | Camera/screen rejected by SFU with microphone-only JWT; same JWT publishes microphone | Passed |
| Original and SFU-refreshed replay after retirement/restart | Both rejected, new guard boot epoch observed; corrupt denial storage fails closed in tests | Passed |
| Controller loss / delayed signed replies | Actual pull/install/ACK loop first sustains media; later loss or 1500ms replies cannot renew authorization | Passed |
| Frozen guard and host enforcement-process loss | Controller removed, guard paused, both host watchdog and guardian killed; local SFU lease ends video/audio | Passed |
| Failed room deletion | Actual private RoomService request rejected with 401; media continues before expiry, then stops independently | Passed |
| Primary stop adapter denied | Guardian observes unconfirmed stop, independently stops SFU; audio 3346ms in recorded run | Passed |
| Two authorized rooms | Exclusive rosters and track owners; shared SFU shutdown interrupts both rooms | Passed with documented shared availability impact |
| Final combined fault | Video 4702ms / active audio 5035ms; second room last frame 4692ms | Passed measured 8000ms assertion |
| Delayed signed policy with both host enforcers dead | Video 4845ms / active audio 5224ms; second room 4826ms | Passed measured 8000ms assertion |

[Final fault artifact](../../spikes/media-enforcement/evidence/2026-11-10-final-fault.json) is a structured transcription of actual final stdout, not regenerated expected values. It omits tokens and contains only fixture measurements/process metadata. Tests fail if counters still advance after settling or measured first-room cutoff exceeds eight seconds. Video uses decoded-frame callbacks; audio uses 20ms waveform samples above amplitude 0.01, with two seconds settling and a further one-second stability check. These are receiver delivery measurements, not packet captures or a statistical SLA. Host and supervisor clocks start at different instants and must not be subtracted from one another.

## Retained failures and their fixes

The unguarded SFU accepted stale tokens on restart. Guarded admission plus persistent retirement fixes the tested path. Killing the only host watchdog left media forwarding beyond 8500ms; the guardian fixed worker death, and SFU-local expiry additionally survives loss of both host processes without a Docker stop call. Strict-source admission initially rejected unlabeled synthetic media; fixture tracks now declare exact sources. Cold startup initially raced a short grace period; no-forwarding-until-fresh-policy bootstrap replaces it. Signed installation ACKs now bind authority snapshot versions exactly. Earlier failed experiments remain explicitly recorded in implementation progress.

## Acceptance boundary and follow-on work

This evidence establishes the named local spike profile only. It does not integrate application membership/session/conversation policy, grant issuance or real company lifecycle. Those belong to CP08/CP09. Synthetic fixed identities must not be used in production. The local machine still grants the operator Docker control; no unrestricted Docker interface is exposed to the app/browser, but actual deployment service users, volume permissions, TLS, key rotation, scheduler monitoring and privileged operations need CP10 review.

No test stops the shared development Docker daemon or proves a frozen kernel/hypervisor, a malicious authorized lease writer, deletion/rollback of protected denial storage, or production TURN/UDP/alternate ingress. Extending the profile to those transports requires rerunning bypass and cutoff scenarios before enabling them. A07 remains a release gate; these local results do not imply a production availability or universal timing guarantee. Shared-node fail-closed shutdown intentionally interrupts authorized companies on that node and must be reflected in pilot limitations.

## CP08.7 — application-integrated media evidence

Date: 2026-11-11. Environment: local macOS/OrbStack Docker, application API plus the real CP07
application guard and pinned LiveKit SFU, Chromium fake microphone/audio capture. These focused
cases use API-issued, short-lived application grants and real Chromium LiveKit clients. They do not
replace CP07's separate-supervisor fault profile or prove deployment acceptance. The SFU image is
`livekit/livekit-server@sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20`;
the workspace pins `livekit-client` 2.23.0 and `livekit-server-sdk` 2.19.2, with Playwright
1.65.0 / Chromium 158.0.8127.18.

| Scenario | Method and observation | Result |
| --- | --- | --- |
| Browser capture denial | One real application media client receives browser-standard `NotAllowedError`; peer and denied session go through API grants, guard and LiveKit. The denied identity is absent from the SFU roster, the peer remains authorized, recovery state is surfaced, and office Socket.IO stays connected. | Passed; room cleans up after conversation end |
| TURN-only | LiveKit embedded TURN is enabled; test clients force `iceTransportPolicy: 'relay'`. Instrumented browser RTCPeerConnections report candidate types. Both pages reported only `relay`, connected ICE, and decoded audio samples (11 and 10 in the recorded rerun). | Passed; no direct candidate observed |
| Weak network | A disposable Alpine sidecar applies 120 ms delay, ±40 ms jitter and 3% random packet loss to SFU egress using `tc netem`. `tc -s` recorded 29 dropped packets. Both clients remained live with connected ICE and peer audio; sample deltas were 105 and 112, with no reconnect. | Passed under this injected profile |
| Cross-company media | Four Chromium clients join two API-authorized company conversations in separate LiveKit rooms through the same guard/SFU. Each room contains its two authorized identities; neither company receives a remote track from the other. Company B ends; its media reaches stable cutoff while Company's A two-person room continues. | Passed locally; SFU rosters 2/2 before leave, 0 cross-company tracks |

Commands: `pnpm test:media-permission-denied`, `pnpm test:media-turn-only`,
`pnpm test:media-weak-network`, and `pnpm test:media-cross-company`. The TURN-only rerun logs the
observed candidate types, ICE connection and decoded audio counts. Weak-network shaping occurs only
inside the disposable fixture network namespace and is cleared during cleanup. Cross-company
evidence proves these two isolated application conversations in one local SFU process; it is not a
multi-tenant load, account lifecycle or production routing test.

This closes only the named CP08.7 local scenarios. A07/A08 remain release gates pending deployed
listener/ICE/TURN exposure and credentials, production guard/supervisor/SFU failure-domain tests,
physical-device and real browser permission-prompt behavior, browser/version signoff, screen-share
and fixed-meeting policy, capacity/load, migration interruption, and a production-like rerun of the
relevant cutoff and isolation cases. Local synthetic audio and an embedded TURN server do not prove
reachable production UDP ports or an external TURN service. No production host/network or external
media provider was modified for these tests.
