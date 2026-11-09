# Media enforcement spike

CP07.1 implements experimental, in-memory permit policy state in `permit-state.mjs`.
It starts default-deny, binds authorization to generation/identity/room/source/version,
checks guard epoch, one outstanding nonce and increasing snapshot sequence, and
expires permits five seconds after the policy request started. Explicitly retired
generations cannot be reinstalled during that guard lifetime. Installation is atomic.

Run `node --test spikes/media-enforcement/test/permit-state.test.mjs`.
The caller must provide a monotonic millisecond clock, fresh cryptographic nonces,
authenticate policy responses and reject unknown DTO fields before installation.

This is not a media guard or measured forwarding guarantee. Persistent retirement,
SFU image/SDK pinning, signaling authentication/proxying, permit installation ACKs,
independent container shutdown supervision and real media fault fixtures remain.
Cold restart must use a fresh guard epoch and keep signaling/SFU default-deny until
policy reconciliation completes; this module does not enforce that lifecycle.

Official LiveKit reference: [token lifecycle and self-hosted revocation limitations](https://docs.livekit.io/frontends/reference/tokens-grants/).
Removing a self-hosted participant does not invalidate an existing token; production
integration therefore remains gated on the complete CP07 proof.

This directory is outside the pnpm application workspace. No services start as a
side effect of importing or testing this policy-state module.

## CP07.2 supervisor policy

`supervisor-state.mjs` models a separate watchdog: startup and useful installation
progress have a three-second deadline. Only an exact outstanding nonce/version
installation acknowledgement with the current guard epoch and a newer sequence
renews progress. Expiry latches shutdown permanently for this process lifetime;
failed or unconfirmed stops are retried. Guard messages cannot choose a container
or command. Test both modules with `node --test spikes/media-enforcement/test/*.test.mjs`.

The injected stop adapter must independently verify that the fixed SFU has stopped
and bound its own call duration. A frozen supervisor, hanging adapter, process
scheduling delay, host failure and actual forwarding cutoff are not covered by
these policy tests. No Docker socket, HTTP endpoint, SFU process or production
media authorization is created by this module.

## CP07.3 separate-process shutdown adapter

`supervisor-process.mjs` runs outside the SFU and guard process. Invoke with a Docker
context, full immutable container ID and guard epoch. It refuses targets without
`gather.cp07.fixture=true` or with automatic restart enabled. The private parent
stdin pipe accepts fixture installation expectations/ACKs only; guard messages
cannot choose a target or Docker command. Docker calls have 1500ms timeouts. The
process checks every 50ms and independently inspects the fixed container state.
This host process has the operator's Docker privilege; it is not yet a production
least-privilege supervision boundary. No Docker socket is mounted into LiveKit.

Experiment pin: `livekit/livekit-server:v1.13.11` resolved by Docker to
`sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20`.
The local fixture used `--network none --restart no`, the fixture label above and
`--dev --bind 127.0.0.1 --node-ip 127.0.0.1`, with no published ports. After verifying
LiveKit stayed running, a separate Node supervisor process received no installation
progress. It reported confirmed stop at 3185.989ms. The fixture was then removed.

This result measures container shutdown, not last protected media forwarding.
Two browser media receivers, RTP/audio evidence, frozen guard injection, failed
Docker control and replay/bypass tests remain required for CP07 acceptance.

## CP07.4 real video cutoff and restart replay

Run `node spikes/media-enforcement/media-cutoff.mjs --run-local` after authorizing
local Docker experiments. It uses the pinned SFU image above, LiveKit browser SDK
2.23.0 and server SDK 2.19.2 already installed in this repository. It creates a
random fixture secret, publishes signaling and ICE/TCP only on loopback ports
17880/17881, serves the installed browser SDK on an ephemeral loopback HTTP port,
and uses two headless Chromium pages. A changing canvas publishes a real WebRTC
video track; the receiver counts decoded frames via requestVideoFrameCallback.
After at least 20 frames, a separate supervisor starts without guard progress.
The experiment records last decoded frame time, verifies the frame counter stays
stable, explicitly restarts the SFU and attempts the exact old receiver token.
Finally it closes browsers and removes its own disposable SFU container.

Observed 2026-11-10: first run 89 decoded frames, last frame 3498ms after experiment
start; repeated run 85 frames, last frame 3299ms, confirmed container stop at
3347.595ms relative to the supervisor's own start clock. The two clocks have
different start instants; these values must not be directly subtracted. Counter
stability was checked after two seconds settling, then over one further second.
This is decoded video evidence, not an RTP packet capture or audio cutoff test.

**Failed security gate:** the original receiver token was accepted after explicit
SFU restart. Direct signaling in this fixture intentionally bypasses a guard;
there is no production signaling enforcement, durable retirement or cold-start
reconciliation yet. The process exits successfully when the experiment completes,
including when it observes this security failure; read the reported replay flag.
CP07 is not accepted and CP08 must not integrate this unguarded fixture.

## CP07.5 durable retirement foundation

`retirement-store.mjs` persists deny-only generation tombstones with exclusive
creation, file fsync and directory fsync before reporting success. Unknown,
incomplete or mismatched entries prevent startup. Supply the store as the third
`PermitState` constructor argument to preserve generation denial across guard
process epochs. In-process denial happens before persistence, so an I/O failure
cannot restore a current permission. The caller must treat persistence failure as
a reason to stop forwarding and must protect this directory from rollback/deletion.
This is single-writer experimental storage, with no compaction or multi-process
coordination. Missing/lost storage is an operational failure requiring isolation
and reconciliation; constructing an empty store does not prove reconciliation.
The LiveKit direct-signaling replay failure remains open until a guard uses this
state and all SFU signaling bypass routes are isolated.

## CP07.6 initial signaling gate — incomplete compatibility

`signaling-guard.mjs` implements a fixed-upstream HTTP/WebSocket gate with exact
Origin, one bounded query token, injected asynchronous authorization with a
one-second deadline, and an allowlist for legacy `/rtc` and `/rtc/validate` only.
Unknown paths, duplicate tokens and authorization failures are denied. The caller
must cryptographically verify JWT claims and bind them to current durable policy;
this module does not provide that wiring or continuing media authorization.

The actual installed LiveKit client 2.23.0 uses `/rtc/v1` with an encoded join
request. A real guarded publisher/receiver attempt failed at signaling admission.
This unsupported path stays denied; do not enable it without bounded decoding and
claim validation. The prior working unguarded media harness is preserved as the
baseline. Thirteen state/loopback tests pass, including refusal to proxy unknown
v1/admin paths, wrong origins, bad or duplicate tokens. SFU signaling is still
published on loopback in that baseline: network bypass isolation remains open.

## CP07.7 verified v1 admission and real audio/video cutoff

Source inspection of installed client 2.23.0 corrects CP07.6's diagnosis: v1 still
sends the JWT as `access_token`; `join_request` contains connection settings, not
an alternative authorization credential. The gate now accepts exact `/rtc/v1`
and `/rtc/v1/validate` paths, bounds the complete URL and base64url join request,
and passes that request unchanged to the pinned LiveKit server for decoding.
It does not infer authorization from reconnect settings or participant SIDs.
The media fixture wires SDK signature/issuer/expiry verification (zero clock
tolerance), exact room/identity checks and durable generation retirement into the
gate. After retirement it restarts both guard and SFU and asserts that the same
original receiver token is rejected. Failure of this assertion now fails the run.

The fixture also publishes a real 660Hz synthetic WebRTC audio track. The receiver
attaches/plays remote audio and samples its waveform every 20ms, counting samples
with amplitude greater than 0.01. On 2026-11-10 the guarded experiment observed
89 video frames, 249 active audio samples, last video frame at 3460ms and last
active waveform at 3793ms after initiating supervisor shutdown. Both counters
stayed stable in the post-settling one-second observation. Old token accepted
after guard/SFU restart: false. Earlier audio attempts failed their activity
precondition until remote audio was attached to a playing element; those attempts
provide no cutoff evidence.

This proves one guarded fixture path, not network bypass exclusion: direct SFU
signaling remains reachable on host loopback. Refreshed-token tests, source-grant
binding, authenticated policy pulls, independent guard process/freeze scenarios,
controller loss, control failure, protected retirement storage and production
supervisor privilege separation remain CP07 gates. No production integration.
