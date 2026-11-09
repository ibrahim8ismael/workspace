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
