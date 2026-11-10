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

## CP07.8 isolated guard process and guard-freeze experiment

Run the media fixture with `--run-local --isolated`, optionally adding
`--freeze-guard`. The SFU binds signaling to its own loopback; port 7880 is not
published. A separate pinned Node 24.18.0 container shares that network namespace,
serves guarded signaling on published loopback port 17885, and accesses the SFU
through namespace loopback. Only ICE/TCP 17881 is otherwise published. The fixture
asserts no Docker publication for 7880 and failed host HTTP access to 17880.
The guard container has a read-only root, dropped capabilities, read-only source
and dependency mounts, read-only retirement storage, and no Docker socket. Its
process verifies JWTs and reloads persisted retirement before each admission.

Observed 2026-11-10 isolated run: 87 frames / 239 active audio samples; last video
3356ms and audio 3725ms after starting the supervisor. Guard-freeze run uses Docker
pause on only the disposable guard while audio/video are already flowing: 87
frames / 248 samples, last video 3254ms, audio 3632ms; independent supervisor
confirmed SFU stopped at 3298.051ms on its own relative clock. Both runs rejected
the original token after restarting guard and SFU. Both cleaned up their containers.
This is one local TCP topology, not an exhaustive alternate-ingress/TURN audit.

The supervisor still receives no progress in this fixture: it exercises timeout
shutdown, not a fully wired authenticated policy/install-ACK loop. Refreshed JWTs,
source restrictions, controller loss, Docker-control failure, supervisor failure,
shared-tenant impact and deployment privilege isolation remain open acceptance
requirements. CP07 is not complete from these successful experiments alone.

## CP07.9 fixture progress stall and refreshed-token replay

Add `--progress-stall` to keep the independent supervisor alive for four seconds
with exact nonce/version/epoch/sequence installation ACK pairs over its private
parent pipe. The fixture asserts audio and video advance during that interval,
then stops ACKs, retires the generation and optionally pauses the guard. These
ACKs are fixture-generated; they do not prove authenticated controller policy
pulls or real guard installation acknowledgements.

In isolated mode the harness invokes LiveKit's participant update API from the
private guard namespace to induce a token refresh. It captures the pinned SDK's
current internal engine token, asserts it differs from the original, verifies its
signature/identity/room and retains it only in memory. After guard/SFU restart,
both original and refreshed-token reconnects must fail. The internal SDK access
is test instrumentation pinned to client 2.23.0, not a production interface.

2026-11-10 combined isolated/progress-stall/guard-freeze run: 159 video frames,
425 active audio samples; last video at 2576ms and audio at 2938ms after ACKs stop
and guard pause completes. Supervisor confirmed stopped at 6764.645ms from its
own initial startup (which includes the healthy phase). Both original and SFU-
refreshed tokens were rejected after restart. A preceding progress-stall run
without refreshed-token instrumentation measured audio cutoff at 2952ms.

Remaining CP07 gates include authentic policy-to-guard-to-supervisor progress,
controller-loss handling, real control/supervisor failure paths, per-source grants,
shared-tenant interruption, and alternate ingress/TURN topology review.

## CP07.10 authenticated policy transport foundation

`policy-pull.mjs` signs request bytes with a separate machine HMAC-SHA256 key and
verifies response bytes before parsing/installing policy. It generates a fresh
32-byte nonce, binds responses to the PermitState epoch/sequence/request-start
deadline, rejects redirects, caps response bodies at 64KiB and 256 permits, rejects
unknown top-level/permit fields, and aborts transport after one second. A remote
endpoint must use authenticated TLS; HMAC provides integrity, not confidentiality.
Key provisioning/rotation, endpoint scoping and controller implementation remain.

Seventeen spike tests pass, including response signature failure, wrong epoch or
nonce, signed extra fields, oversized responses and permit expiry after controller
loss. Policy tests use injected Response objects and are not a deployed controller
or real media outage experiment. This transport is not yet connected to the
running guard/supervisor; the earlier media progress ACKs remain fixture-generated.

## CP07.11 real authenticated controller loss

`--run-local --isolated --policy-loss` starts a separate restricted policy container
in the private SFU namespace. Its HTTP listener binds namespace loopback port
7886, which is not published. Requests and responses use an independent random
HMAC key. `policy-process.mjs` is a synthetic authority granting two fixed fixture
identities, not the application's authorization service. The guard pulls every
500ms without overlapping requests, installs through PermitState and emits an ACK
only after successful authenticated installation. The harness relays actual guard
stdout events to the independent supervisor's private stdin; it generates no ACKs
in this mode. Docker-log forwarding is fixture plumbing, not a production control
channel. The static fixture epoch still needs production boot-epoch ownership.

Before faults, the fixture verifies advancing audio/video for four seconds under
this real pull/install/ACK loop. It then removes the policy container, persists
generation retirement and measures media cessation. Observed 2026-11-10: 168
frames / 446 active audio samples, last video 2877ms and audio 3238ms after the
fault operation completes. Supervisor reported stop at 7086.772ms from its own
earlier startup. Both original and refreshed-token replays were rejected after
guard/SFU restart. Containers and temporary retirement state were cleaned up.

Eighteen tests pass, including ACK suppression for invalid signed policy. Remaining:
control and supervisor failure injection, source-specific grant enforcement,
shared-node impact, deployment authority/key isolation and application-policy
integration. This mode does not make the entire CP07 release gate accepted.

## CP07.12 negative supervisor-crash acceptance experiment

Run `--run-local --isolated --policy-loss --supervisor-crash` to exercise a joint
fault: after four seconds of healthy authenticated policy/install progress, remove
the controller, persist retirement and SIGKILL only the independent supervisor.
Observe the existing real media flow for 8500ms. The harness reports advancing
frame/waveform counters and deliberately exits nonzero if forwarding continues;
finally cleanup is operator/test cleanup and is not counted as media enforcement.

Observed 2026-11-10: forwarding continued, with 170 additional decoded frames and
426 additional active waveform samples over 8500ms. Security gate failed. Current
signals admission stops new retired joins but does not terminate already-forwarded
media without the supervisor. This is a combined controller-loss/supervisor-crash
failure, not evidence that controller loss alone fails (CP07.11 passed that case).

A deployment enforcing an eight-second bound for this fault model needs a separate
surviving stop path or an independently enforced SFU lease. A restart policy alone
is not proof. CP07 cannot claim this resilience until that path is implemented and
measured. Docker-control failure remains a separate untested infrastructure case.

## CP07.13 independent watchdog crash guardian

`supervisor-guardian.mjs` runs as a separate host process, launches the existing
watchdog, forwards its private progress pipe and independently inspects/kills the
same fixed labelled no-restart SFU when that watchdog exits. Input cannot select
another target or command. Run the media fixture with
`--run-local --isolated --policy-loss --supervisor-crash --guarded-supervisor`.
The harness SIGKILLs the identified child watchdog, not its surviving guardian.
The original unguarded negative crash test remains available for comparison.

Observed 2026-11-10: controller loss plus watchdog SIGKILL now stops real audio at
455ms and video at 124ms after fault initiation. Guardian confirmed SFU stopped
306.926ms after detecting child death. Original and refreshed-token restart
replays were denied. Processes and fixture containers were cleaned up. The guard-
controller healthy phase still asserts continuing real media before injecting faults.

This is process-crash redundancy, not independent infrastructure: both host
processes use the same Docker control channel. Simultaneous guardian/watchdog
failure, host/VM failure, Docker API unavailability and production service lifecycle
are not covered by this result. No restart-policy-only guarantee is asserted.

## CP07.14 SFU source enforcement and foreign-room denial

Add `--source-permissions` to the isolated fixture. Before the normal media run,
a publisher connects with a signed microphone-only JWT (`canPublishSources` =
MICROPHONE). Test instrumentation deliberately changes the SDK's local permission
object to allow all sources while leaving the signed token unchanged. Camera and
screen-share publication must be rejected, and microphone publication with the
same token must succeed while the room remains connected. This distinguishes
SFU source enforcement from merely trusting the client UI permission check.
A correctly signed token scoped to another room is also rejected by the guard.

Actual 2026-11-10 combined source/controller-loss/watchdog-crash/guardian run:
cameraRejected=true, screenShareRejected=true, microphonePublished=true and
foreignRoomRejected=true; last audio 467ms and video 133ms after fault injection.
Original and refreshed replay were both rejected after restart. Guardian stop
confirmation was 280.186ms after observing child death. All fixtures cleaned up.
This is source-grant and negative room-scope evidence, not yet two concurrently
authorized companies with isolated media and measured shared-node interruption.
Screen-share audio, post-join source-permission changes and application-issued
source grant binding remain separate acceptance requirements.

## CP07.15 two authorized rooms and shared-node impact

Add `--company-isolation` with isolated policy mode. Four real Chromium participants
join two explicitly configured fixture rooms. Policy and guard bind the second
room only to publisher-b/receiver-b. Both rooms publish/receive simultaneously;
receiver rosters must contain only their own publisher and second-room track-owner
callbacks must identify publisher-b exclusively. This is room-level media evidence,
not application membership/company API acceptance.

Actual combined run on 2026-11-10 passed source checks and both room-isolation
assertions. First roster: publisher; second roster/track owner: publisher-b. After
controller loss and primary-watchdog SIGKILL, guardian shutdown also interrupted
the unrelated authorized second room: its last video frame was 165ms after fault
initiation (121 frames received). First-room video/audio cutoff: 129ms/512ms.
Original/refreshed replay after restart remained denied. This records deliberate
node-wide collateral interruption; it does not claim per-tenant availability.

## CP07.16 primary stop-adapter failure with surviving guardian

`--guarded-supervisor --deny-primary-stop` injects stop denial into only the child
watchdog (after fixed-target safety checks). The guardian detects stop-unconfirmed,
terminates the child and independently stops/inspects the same SFU. This tests a
failed primary actuator, not a shared Docker daemon outage. The injection is
fixture-only and never changes the real Docker daemon or other containers.

Actual combined two-room/source/policy-loss run passed: primary reported stop-
unconfirmed, guardian confirmed stop 467.149ms after child exit, first-room audio
3346ms/video 2906ms after the fault and second-room video 2909ms. Original and
refreshed tokens remained denied after restart; camera/screen rejection and
positive microphone control passed. Shared Docker API failure, host/VM failure
and loss of both enforcement processes need an external fencing failure domain
if the deployment's guarantee includes them; no local-process design can claim
that infrastructure resilience from this experiment.

## CP07.17 complete source-grant admission

`source-grants.mjs` checks every signed JWT publication source against the current
permit. Publisher grants must have explicit, nonempty, unique source lists;
unknown sources and screen-share audio are denied. A JWT authorizing both camera
and microphone is rejected when policy permits microphone alone. Subscriber-only
grants remain eligible for the separate identity/room/admission checks.
Synthetic publication now labels microphone/camera explicitly rather than relying
on unrestricted unknown-source defaults. Fixture publishers receive only the
needed signed sources. Twenty regression tests pass. The combined real two-room,
source, policy-loss and denied-primary-stop run passed again: first-room last
video/audio 2747ms/3137ms; second-room video 2744ms. Replay remained denied.

## CP07.18 fresh guard boot epochs

Each fixture guard start now receives a new random 32-byte boot epoch. The policy
fixture authenticates and echoes that challenge epoch; the guard's PermitState,
installation ACKs and host supervisor use that exact epoch. Missing/invalid epochs
prevent the guard from starting. Restart changes the epoch and still reloads deny-
only retirement state; no allow snapshot is restored from disk.

The full two-room/source/controller-loss/denied-primary-stop experiment passed:
guardEpochChanged=true, original/refreshed replay false, first-room audio/video
cutoff 3096ms/2689ms and second-room video 2723ms. The broader shared-Docker-control
failure boundary is still distinct from the tested per-process actuator failures.

## CP07.19 SFU-local expiry independent of Docker control

`--sfu-lease` (requires isolated policy mode) launches pinned LiveKit under
`sfu-lease.sh`, a PID-1 wrapper in the same SFU container. The guard atomically
writes a per-fixture SFU-epoch lease only after authenticated policy installation.
Its deadline is five seconds from the request's shared Linux `/proc/uptime`
reading, not response receipt. The SFU mounts that lease read-only and polls its
own child every 50ms. It sends SIGKILL directly to its LiveKit child on expiry:
no Docker API/host process is involved in enforcement. Wrong epochs, malformed
values and implausibly future deadlines cannot extend the lease. Startup has a
three-second bootstrap window; signaling still defaults to deny until policy
installs. Existing stale files cannot extend that bootstrap window.

The first cold-restart attempt failed because an old expired lease killed SFU
before namespace peer containers could start. Bootstrap handling was corrected,
then the full real experiment passed with
`--run-local --isolated --policy-loss --guarded-supervisor --supervisor-crash --sfu-lease --source-permissions --company-isolation`.
Both host guardian and child watchdog were SIGKILLed after policy loss. The SFU
stopped itself: last audio 5045ms/video 4672ms, second-room video 4710ms after fault
initiation. Docker inspect confirmed it had exited before test cleanup. Original
and refreshed replays were rejected after restart; boot epoch changed; sources
and exclusive two-room track/participant checks passed. Twenty regressions pass.

This demonstrates no Docker stop request is needed in this fault path. It does
not deliberately kill the real shared Docker daemon or validate a frozen Linux
scheduler. Correctness still assumes a live SFU wrapper/kernel, protected lease
writer/mounts and trusted controller/guard code. Host/VM failure domains and
production installation privileges need their deployment acceptance checks.
