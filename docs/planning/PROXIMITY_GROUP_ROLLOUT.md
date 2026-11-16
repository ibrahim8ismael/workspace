# Proximity group conversations: rollout and rollback

This release changes the office protocol, API pairing authority, browser roster handling, and media guard lifecycle together. It was deployed to the Gather Lite pilot on 2026-11-16 and passed a controlled three-user browser canary. This is evidence for the pilot host and test accounts; it is not a broad-release sign-off.

## Verified pilot baseline

Read-only inspection on 2026-11-15 found `https://gather.imtelak.com` running one API, one web/Caddy container, one media guard, and one LiveKit server. The prior API image tag was `6e4620dec60c`; its local image ID was `sha256:91e73881f16940bcff888d473d2055b2f111eb78d37d9dc9d8af99fce3a26d4a`. The prior web and guard were the `6e4620dec60c-r2-media-pilot` images with IDs `sha256:e0a93578a232f17912218587712143a811ee03ad480fb538d00a0e08cc7503cf` and `sha256:7e54fd2cbda0eb6e1c9c584c3e838e0878ff9a828a1865a44b6c0caa6fe2d75e`. LiveKit is pinned to `v1.13.11`, digest `sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20`.

The web `/rtc` route passes through Nginx to the loopback guard; Socket.IO passes to Caddy/API. LiveKit signaling and administration remain private. The host firewall allows TCP `17881` and UDP `17882–17954`. External ICE/TURN relay reachability and any cloud/provider firewall rules were not verified. The single API process is required because office runtime and installed media-policy state are process-local; do not scale API replicas without a shared authoritative office owner and policy implementation.

No separate staging endpoint was available. A private synthetic workspace and three `example.test` accounts were used for the controlled pilot canary. Public-host tests were run from the deployment host; tests from separate client networks, TURN-only/UDP-blocked paths, and the full M3/M4 failure matrix remain outstanding.

## 2026-11-16 pilot deployment and verification

Deployed application source commit: `281ee3240ce8bdc419bc2a35c485ed20eac98f97` (`main`). The API image is `gather-lite-api:281ee324`, ID `sha256:034622d51d92725470e911d27fa9112ad4b35dfb2e857590a4f3bfedc476841e`. The web image is `gather-lite-web:281ee324-r2-media-pilot`, ID `sha256:0e118b693fd7c207cd6aa7ae4342e4208e7c38f04767d284b04b37df1798da83`. The media guard is `gather-lite-media-guard:281ee324-r2-media-pilot`, ID `sha256:7fdf6b2c4a74434b1fac102a03b70842829fc5a0ed42a04548cc251bd04eb262`. LiveKit remained pinned to the same `v1.13.11` image. The API remained a single instance.

Before rollout, the MongoDB archive backup was created and verified at `/var/backups/gather-lite/gather-lite-20261116T100555Z.archive.gz`. The protected prior deployment environment was saved at `/var/backups/gather-lite/gather-lite-deploy-env-20261116T100555Z.env`; the rollback environment `/var/backups/gather-lite/gather-lite-rollback-281ee324.env` restores the prior API and web images while retaining the new compatible guard and retirement tombstones. No database migration was made.

The pilot canary used the actual public app at `https://gather.imtelak.com` with three isolated browser contexts and synthetic microphone audio. A and B first established a two-person conversation; C then joined that same group. All three clients displayed a three-person roster, two remote audio elements each, advancing decoded-audio samples, and connected ICE. The measured join time was 1,514 ms. Selected candidate pairs included `srflx-host` and `host-host`. After C left, C's remote audio element was removed in 174 ms; A and B retained one remote track each and decoded audio resumed. The local real-SFU integration additionally verified retired-room emptiness, denial of the removed member's old token, survivor migration, and decoded-audio cutoff. The browser's RTP inbound sample counters were unavailable in this pilot run, so decoded audio was validated with active AudioContext samples and actual attached tracks.

Post-deploy checks returned API health HTTP 200, kept unauthenticated `/rtc/v1/validate` denied with HTTP 403, served the new hashed web bundle, and found no leftover LiveKit rooms after the canary. The pilot did not establish external TURN-only reachability, separate-network connectivity, production-scale capacity, or a production latency SLA. Keep those gates open before a wider rollout.

## Compatibility and release sequence

The shared office protocol moves to version 2 because version 1 clients strictly reject proximity rosters larger than two. The API, shared contracts, web bundle, and media guard must be released as a coordinated set. A single API restart disconnects old office sockets; the new API rejects version 1 admission, so an old open tab must reload before it can rejoin. Caddy now sends `no-store` for the HTML entry point and long-lived immutable caching only for content-hashed `/assets/*` files.

Before a canary:

1. For a future wider rollout, build and test the exact candidate commit in a production-equivalent staging stack using the same pinned LiveKit server, guard, TLS ingress, and ICE/TURN policy.
2. Keep the office API at one replica. The pilot canary verified A+B followed by C joining the same conversation, three distinct participants, two remote audio tracks per user, active decoded audio, and connected ICE. Still verify a working TURN-only path from separate client networks before wider release.
3. The pilot canary verified removal of C and continuity of A+B; the local real-SFU integration verified old-generation retirement, denial of C's old token, and survivor migration. Repeat the full lifecycle matrix on staging, including opt-out, away, disconnect, and membership/session revocation.
4. Verify stale bundle behavior, protocol mismatch feedback, static cache headers, tenant isolation, policy ACK timing, and old-generation room retirement under a guard restart before staging approval.
5. Record the candidate Git SHA, image IDs/digests, Compose revision, health indicators, and protected configuration backup. Do not include secret values in artifacts or logs.

For the current pilot Compose layout, build the release candidates with:

```sh
docker compose --parallel 1 --env-file infra/deploy/.env \
  -f infra/deploy/compose.yaml \
  -f infra/deploy/compose.media-pilot.yaml \
  -f infra/deploy/compose.mailpit.yaml \
  --profile media-pilot --profile mailpit build api caddy media-guard
```

After canary approval, deploy the API, static web bundle, and guard together. This intentionally reconnects all office clients; keep LiveKit and persistent volumes in place:

```sh
docker compose --env-file infra/deploy/.env \
  -f infra/deploy/compose.yaml \
  -f infra/deploy/compose.media-pilot.yaml \
  -f infra/deploy/compose.mailpit.yaml \
  --profile media-pilot --profile mailpit \
  up -d api caddy media-guard
```

Before allowing a broader synthetic cohort to use the feature, verify health and image IDs with the same Compose files, check the active Nginx `/rtc` and `/socket.io` upstreams, verify unauthenticated `/rtc/v1/validate` remains denied, and run the three-user browser flow through the public WSS origin from separate client networks. Stop the rollout on any two-person regression, uncertain forwarding cutoff, stale policy ACK, cross-tenant media, or unexpected ICE/TURN failure.

## Rollback

There are no database migrations or durable group records. Membership, versions, and generations live in API runtime memory; retirement tombstones remain in the existing protected `media-retirements` volume. Never remove that volume during rollback.

1. Stop the single API container while keeping the new guard active. This closes office sockets and stops policy renewal; the SFU lease wrapper kills LiveKit when its five-second lease expires. Verify that no LiveKit process remains before restoring application images.
2. Restore the exact recorded prior API and web image references in the protected deployment `.env`. Keep the new guard running so it can install the prior API’s policy and retain generation tombstones. Do not edit or recreate MongoDB, Redis, LiveKit, `media-retirements`, or `media-lease` volumes.
3. Recreate only the application services with the existing Compose project and profiles:

   ```sh
   docker compose --env-file infra/deploy/.env \
     -f infra/deploy/compose.yaml \
     -f infra/deploy/compose.media-pilot.yaml \
     -f infra/deploy/compose.mailpit.yaml \
     --profile media-pilot --profile mailpit \
     up -d --no-build api caddy
   ```

4. Verify health, current image IDs, two-person audio, and that the restarted LiveKit has no participants from the retired group generations. Only roll the guard image back if the prior guard is required and those generations are confirmed empty; retain retirement tombstones. Ask users to reload the office so cached JavaScript and protocol versions match the restored web/API images.

Keep the previous image references and sanitized health snapshot with the release record. Never use `down -v` or prune deployment volumes as part of rollback.
