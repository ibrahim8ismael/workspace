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
