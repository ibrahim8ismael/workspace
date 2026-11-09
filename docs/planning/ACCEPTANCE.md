# Acceptance and evidence register

Status: initial backend subset locally verified; deployment/media/pilot gates remain pending · Updated: 2026-11-09

Documentation review is not implementation verification. Add an evidence record with environment/build, exact scenario, observed result, measurements, date, responsible person and artifact/code link. A failed gate remains open until corrected and rerun.

| ID | Gate | Required evidence | Status |
|---|---|---|---|
| A01 | M0/M1 browser security | Cookie flags; session/CSRF rotation; anonymous bootstrap cannot overwrite existing session; exact Origin rejection; no secret storage/log leakage | Pending |
| A02 | M1 account lifecycle | Real mail, verification password proof, pending recovery, expired/superseded token rejection, concurrent reset/login/change handling | Pending |
| A03 | M1 tenant policy | ID substitution, operator/mass assignment rejection, recipient-bound invite concurrency, owner transfer and exact capacity counters | Pending |
| A04 | M2 admission | Ticket replay/expiry/epoch tests, direct socket rejection, identity spoofing, fresh reconnect/takeover, revoked membership on open socket | CP03 HTTP/ticket and CP05.1 local socket-Origin, ticket replay, duplicate/capacity, epoch replacement and disconnect tests pass. Live lease/revocation, handshake rate/timeout budget, takeover, reconnect client and browser integration remain |
| A05 | M2 world | Server-time speed/collision, seats/exits, last-slot joins, input flood/size limits, version gaps, incompatible map/protocol, stale lease reply rejection | CP02 pure geometry and CP05.1 bounded snapshots/transport verified locally. Server movement, seat transitions, command flood policy and gap recovery remain |
| A06 | M0/M2 renderer | Cleared asset provenance, pixel scale/anchors/occlusion, React/Phaser bridge and cleanup, accessible essential controls | CP02.5 sample locally verified. CP06 office integration and pilot browser evidence pending |
| A07 | M0/M3 media privacy | Original/refreshed token replay, retired generation, source limits, public bypass, controller loss, guard freeze, failed deletion, independent shutdown and measured forwarding cutoff | Pending |
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
