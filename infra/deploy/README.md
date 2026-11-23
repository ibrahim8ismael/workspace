# Gather Lite server deployment

This Compose project is isolated from `infra/compose.yaml` and the media E2E overlay. It expects
the host's existing Nginx to terminate public TLS and proxy to Caddy over a loopback HTTPS port.
MongoDB and Redis have no published ports. The app and API bind only to Docker networks; the only
public application listener is host Nginx. Caddy is bound to loopback port `18443`. The optional
`media-pilot` overlay binds the media guard to loopback port `18885` for Nginx; its container port
`7885` and LiveKit signaling/admin port `7880` are not public. Only bounded ICE/TURN transport ports
are publicly published. Mailpit's web UI, when enabled, is loopback-only on `8025`.

The default profile includes MongoDB replica-set storage, persistent queue Redis, the NestJS API,
and Caddy/static frontend. The `media-pilot` overlay routes LiveKit signaling over the existing
`gather.imtelak.com` HTTPS origin. The production `mail` profile is enabled only after a TLS-required
SMTP provider has been configured in `worker.env`. The optional `compose.mailpit.yaml` overlay is a
separate, internal-only capture mode for pilot testing; it is not real email delivery.

## Prepare protected settings

Create all three files and generate a stable random outbox key without printing it:

```sh
node infra/deploy/init-env.mjs approved.example.com
```

For private loopback evaluation, pass the origin including the Caddy loopback port, such as
`node infra/deploy/init-env.mjs localhost https://localhost:18443`. The helper refuses to overwrite
existing files, writes all three with mode `0600`, tags images with the current commit, and never
prints secret values. `.env` contains only Compose routing and image labels. `api.env` contains the
stable outbox encryption key. The same key is written to `worker.env`; configure the selected SMTP
values there. Never commit these files or print them to logs.

`APP_DOMAIN` must be the approved hostname and resolve to this server before certificate issuance.
Set `APP_ORIGIN` to its exact HTTPS origin. Nginx uses the public Let's Encrypt certificate. Caddy
uses its own internal CA on the loopback upstream; install only Caddy's public root certificate at
`/etc/nginx/ssl/gather-lite-caddy-root.pem` so Nginx can validate that connection. The private
internal certificate key stays inside Caddy's persistent data volume.

The API trusts forwarded client IPs only from the exact Caddy peer. The pilot edge network reserves
`172.26.0.4` for Caddy and sets `TRUSTED_PROXY_IPS` to that address in the protected Compose `.env`.
Before reusing this Compose configuration on another host, confirm `172.26.0.0/16` does not overlap
an existing Docker or LAN route. If it does, change `GATHER_EDGE_SUBNET`, `CADDY_EDGE_IP`, and
`TRUSTED_PROXY_IPS` together; the last value must be the exact Caddy address, never a CIDR.

Generate a single 32-byte outbox key and use the same canonical base64 value in both private env
files. Keep the key stable while queued messages exist. `DB_AUTO_INDEX=false` is mandatory; the
explicit one-shot `indexes` job provisions declared indexes after replica-set initialization.

## Build and start

Run from the repository root. Install `nginx-bootstrap.conf` as the temporary port-80 site, create
`/var/www/letsencrypt/.well-known/acme-challenge`, test/reload Nginx, and obtain the public
certificate with Certbot webroot mode. Then start the Compose stack. Copy Caddy's public internal
CA root from its data volume to `/etc/nginx/ssl/gather-lite-caddy-root.pem`. For this pilot, install
`gather.imtelak.com.nginx.conf` as the complete HTTP/HTTPS site; it is rendered for
`gather.imtelak.com` and loopback port `18443`. The generic
`nginx-site.conf.template` is for another approved hostname/port. Run `nginx -t` and reload Nginx.
The HTTP challenge directory is `/var/www/letsencrypt`; all other HTTP requests redirect to HTTPS.

Build pinned images serially to stay within the shared server's resource budget:

```sh
docker compose --parallel 1 --env-file infra/deploy/.env \
  -f infra/deploy/compose.yaml build api indexes caddy worker
```

Run the initial replica set and index job once, after verifying the new named volume is the only
target. This command does not reset an existing database:

```sh
docker compose --env-file infra/deploy/.env -f infra/deploy/compose.yaml --profile setup run --rm indexes
```

Initialize Caddy's persistent certificate/config volume ownership before starting its unprivileged
UID:

```sh
docker compose --env-file infra/deploy/.env -f infra/deploy/compose.yaml --profile setup run --rm caddy-data-init
```

Start the core profile:

```sh
docker compose --env-file infra/deploy/.env -f infra/deploy/compose.yaml up -d
```

After TLS SMTP credentials are configured, start the mail worker:

```sh
docker compose --env-file infra/deploy/.env -f infra/deploy/compose.yaml --profile mail up -d worker
```

## Mail capture for pilot testing

When a real SMTP provider is not configured, the optional mail-capture overlay can exercise
verification and invitation delivery without sending messages externally. It starts a separate
development-mode worker and Mailpit. SMTP port `1025` is available only on the private Compose
network; the inbox UI binds to host loopback at `127.0.0.1:8025`. The host firewall is not opened.
This is a test mode, not real email delivery. Do not run it at the same time as the production `mail`
profile because both workers would consume the same queue.

```sh
docker compose --env-file infra/deploy/.env \
  -f infra/deploy/compose.yaml -f infra/deploy/compose.mailpit.yaml \
  --profile mailpit up -d mailpit worker-mailpit
```

Access the inbox over an SSH tunnel from your workstation, replacing `<ssh-user>` with the account
used to connect to the host:

```sh
ssh -L 8025:127.0.0.1:8025 <ssh-user>@gather.imtelak.com
```

Then open `http://localhost:8025` locally. Stop capture mode before starting the production worker:

```sh
docker compose --env-file infra/deploy/.env \
  -f infra/deploy/compose.yaml -f infra/deploy/compose.mailpit.yaml \
  --profile mailpit stop worker-mailpit mailpit
```

## Same-domain proximity voice pilot

No media subdomain is needed. The API issues grants for `wss://gather.imtelak.com`; the LiveKit SDK
uses `/rtc` on that origin. Nginx forwards `/rtc` WebSocket upgrades directly to the policy guard
on loopback port `18885`; request logging is disabled for this path because LiveKit puts short-lived
access tokens in signaling URLs. The Caddy `/rtc` route returns 404, and the guard's own port `7885`
is not publicly published. LiveKit signaling/admin port `7880` stays private. A per-SFU lease wrapper
prevents LiveKit from starting before current application policy is installed and stops the media
process when renewals fail.

Initialize protected LiveKit credentials and the server's public IPv4 address. The command writes
the existing mode-0600 `.env` file and does not print secret values:

```sh
node infra/deploy/init-media-env.mjs 135.181.204.97 gather.imtelak.com <deployment-revision>
```

Allow only the media transport ports (not 8025, 7880, or 7885), then build the Caddy frontend with
voice controls and the media guard:

```sh
ufw allow 17881/tcp
ufw allow 17882:17954/udp
docker compose --parallel 1 --env-file infra/deploy/.env \
  -f infra/deploy/compose.yaml -f infra/deploy/compose.media-pilot.yaml \
  -f infra/deploy/compose.mailpit.yaml --profile media-pilot --profile mailpit build caddy media-guard
```

Deploy while retaining the existing Mailpit capture mode:

```sh
docker compose --env-file infra/deploy/.env \
  -f infra/deploy/compose.yaml -f infra/deploy/compose.media-pilot.yaml \
  -f infra/deploy/compose.mailpit.yaml --profile media-pilot --profile mailpit \
  up -d api caddy media-livekit media-guard mailpit worker-mailpit
```

LiveKit advertises the server's public IPv4 address. The pilot profile uses a bounded UDP mux,
ICE/TCP fallback, and embedded TURN/UDP; verify external ICE and relay connectivity before relying
on voice. This does not close the A07 production host/process failure gate or prove reachability from
networks that block UDP; those release limits remain documented in
`docs/planning/ACCEPTANCE.md`.

## Verify and operate

Inspect service state with `docker compose ... ps`, container health with `docker inspect` health
state, and sanitized logs with `docker compose ... logs --since 10m api caddy mongo redis-queue`.
Do not collect worker debug output containing provider details without reviewing it first. Check
resources with `docker stats --no-stream` and `df -h /`. `/api/health/live` is only liveness; verify
Mongo-backed registration/session/company operations, mail delivery, office Socket.IO, persistence
and browser-origin protections separately.

Take a protected compressed database dump with `infra/deploy/backup.sh`. It writes mode-0600
archives under `/var/backups/gather-lite` and validates the gzip stream. Redis uses AOF with
`appendfsync everysec` on its own persistent volume. Mail queue items reference durable Mongo outbox
records; if Redis needs rebuilding, the worker dispatcher re-enqueues pending and queued outbox
records from Mongo. Keep the Mongo archive protected because it contains authentication/session
state. Copy it to an independent protected destination before relying on recovery. Test a restore
into an isolated database before declaring recovery verified; do not restore older auth state over
newer revocations.

Routine restart: `docker compose ... restart`. Graceful stop retaining data: `docker compose ...
down`. Never add `-v` to shutdown or remove either persistent volume. To roll back code, deploy the
recorded previous image tags and matching Compose/configuration revision, then restart the stack;
keep the current database and queue. The running application images use tag `6e4620dec60c`; the
previous deployed images tagged `1e57915406cf` are retained locally. To roll back only application
code, set the three image variables in the protected `.env` to that prior tag and run
`docker compose ... up -d --no-build api caddy`. If Mailpit capture mode is active, also roll back
`worker-mailpit` with the `compose.mailpit.yaml` overlay and `--profile mailpit`; use the production
`mail` worker only when real SMTP is configured. Keep the current Mongo/Redis volumes and deployment
security settings. Recheck revoked sessions and tickets after rollback.

## Current pilot boundary

Without the `media-pilot` overlay, the frontend build disables proximity voice and the API's LiveKit
settings stay blank, so media grant requests fail closed. With the overlay, keep signaling behind
the policy guard and SFU lease wrapper; do not publish LiveKit's API port or bypass guard routing.
The A07 production release gate remains open for host/process failure validation and a production
profile rerun documented in `docs/planning/ACCEPTANCE.md` and `MEDIA_ENFORCEMENT_EVIDENCE.md`.

No real TLS SMTP provider is configured in this environment, so email verification, password
recovery, and invitation delivery are not ready for real onboarding. The isolated Mailpit capture
profile is available for code testing through an SSH tunnel, but captured messages do not leave the
server. Configure the protected `worker.env` with the provider's TLS endpoint, sender, and
credentials, stop `worker-mailpit`, start the production `mail` profile, and verify real delivery
before inviting users.

## Deployment verification — 2026-11-16

This section supersedes the earlier running-image references above. The pilot is serving
`https://gather.imtelak.com` with the same-domain guarded `/rtc` media path. The source base is
`3d366097e2bae72c6586e2155fa5fc99764fc27a`, matching `origin/main`. The deployed API and web
images are `gather-lite-api:3d36609-issue12-3-20261116` and
`gather-lite-web:3d36609-issue12-3-20261116`. These images include the issue implementation from
the local working tree; those source changes are not committed, so the image tag alone is not a
substitute for preserving the working-tree diff.

Verified on the deployed pilot:

- The public HTTPS frontend returned `200` with the configured HSTS/security headers; the API
  liveness route returned `{"status":"ok","service":"api"}`. This route is process liveness,
  not a database readiness check.
- Authenticated browser flows registered and verified test accounts through Mailpit, created a
  workspace, invited members, authenticated, entered the Vivo office, and established realtime
  group audio. An unauthenticated conversation media-token request returned `401`; an
  unauthenticated `/rtc/v1/validate` request returned `403`.
- The deployed three-browser LiveKit test passed with synthetic audio. All three clients received
  two remote tracks; decoded audio was observed in all three. After the third participant left,
  the remaining pair retained audio. Group admission completed in about 1.7 seconds.
- Five real decoded-audio boundary departures were measured against the server-rendered 64-pixel
  circle. Conservative request-to-first-silent-sample upper bounds were 341, 300, 259, 332, and
  283 ms (empirical p95: 341 ms). Every re-entry created a new area and left both microphones off
  until the users explicitly enabled them.
- Compose reported API, Caddy, MongoDB, queue Redis, Mailpit, and the media guard healthy; the mail
  worker and LiveKit were running. MongoDB and Redis remained on private Docker networks. Mailpit
  UI is bound to `127.0.0.1:8025`; access it through the SSH tunnel above. Port `8025` is not public.
- Host snapshot: Linux x86_64, 8 vCPU, 15 GiB RAM (7.7 GiB available), and 225 GiB disk available.
  The configured 2 GiB swap was nearly fully allocated at the time of the check. Container use was
  inspected with `docker stats`; no dedicated metrics/alerting service is installed.
- `infra/deploy/backup.sh` created and gzip-validated
  `/var/backups/gather-lite/gather-lite-20261116T141356Z.archive.gz`. A restore into an isolated
  database has not been tested, and the archive has not yet been copied to an independent host.
- `pnpm check` passed before deployment, including the API, web, contracts, world, media-spike, and
  build checks. `pnpm test:api` passed 101 tests with one skipped; focused proximity/meeting runtime
  tests passed 26. `pnpm test:e2e` passed two tests with seven skipped. Against the deployed URL,
  the three-person guarded audio and five-cycle departure/re-entry tests passed. The separate local
  `pnpm test:media-live` profile could not run because its configured Docker context was unavailable.

The fixed-room meeting implementation and its runtime/unit tests are deployed, but a live three-user
fixed-room audio session has not been verified. Real SMTP, meeting-room live media, isolated-database
restore, independent off-host backup, external TURN-only reachability, and media host/process failure
supervision remain open pilot/release gates. Mailpit captures verification and invitation messages;
it does not deliver them to real users. The live browser tests left five synthetic validation
workspaces and 13 `@example.test` accounts in the pilot database; they were retained because no safe
application deletion flow was available.

For a code-only rollback, restore the protected `.env` image references to the previously deployed
`gather-lite-api:281ee324` and `gather-lite-web:281ee324-r2-media-pilot` tags, then run the same Compose
file/overlay/profile set with `up -d --no-build api caddy media-guard`. Restarting the guard makes it
negotiate a fresh policy epoch with the rolled-back API. Keep MongoDB and Redis volumes and current
authentication/revocation state; do not restore the older backup over the live database.

## Deployment verification — 2026-11-12

The pilot is serving `https://gather.imtelak.com`. API/frontend source is based on `6e4620dec60c`;
`e7b4d3dbc3db4352d9fd23314e6279c261a2fae6` is a documentation-only commit on top. The same-domain
media guard changes and this deployment configuration are local working-tree changes deployed as
the `r2-media-pilot` images.

Verified on the deployed host:

- Public HTTPS frontend returned `200`; the deployed API liveness endpoint returned `{"status":"ok","service":"api"}`.
- An unauthenticated `/rtc/v1/validate` request returned `403`; guard and API containers were healthy.
- The two-browser live audio test passed. Conversation leave removed the remote audio element and
  audio samples stopped within 30 ms.
- Membership removal stopped both clients' audio within 1.3 seconds, removed the revoked member's
  office view, and retained the owner's view. Logout stopped both clients' audio within 1.5 seconds
  and the logged-out session was rejected.
- `pnpm test:media-spike` passed 25/25 tests. `infra/deploy/backup.sh` created and validated
  `/var/backups/gather-lite/gather-lite-20261112T115401Z.archive.gz`.

Microphone denial displayed the expected browser permission error while preserving the office
socket and movement, but the Playwright case timed out during browser cleanup; it is not counted as
a passing E2E test. External TURN-only connectivity and A07 host/process failure supervision remain
unverified. Real SMTP is not configured: registration and invitation messages are captured by
Mailpit, whose port `8025` is available only on loopback and must not be opened publicly.

## Deployment verification — 2026-11-17

This records the 2026-11-17 deployment before Ibrahim's office-wave merge; the redeployment record
below supersedes its running-image references. The
deployed source commit is `7d4d00bbccb0e377cb8acc51bf2fd43a7711384e`, based on Ibrahim's latest
`origin/main` commit `b166f3d70008a37b0e4ddafcf539f4ae24bf71b5` with the issue #12/#3 implementation
merged. API, web and worker images use the `7d4d00b-issue12-3-20261117` tag. The media guard remains
`gather-lite-media-guard:281ee324-r2-media-pilot`; LiveKit remains pinned to `v1.13.11`.

The latest image build used `docker compose --parallel 1 ... build api caddy worker`. Build `indexes`
separately from the same API image; do not ask Compose to export both `api` and `indexes` in one
build, because both services use the same image tag. The one-shot index job completed successfully
and reported that no indexes were dropped. A pre-deploy Mongo archive was gzip-validated at
`/var/backups/gather-lite/gather-lite-20261117T102818Z.archive.gz`.

Verified against the deployed pilot:

- `https://gather.imtelak.com` returned HTTP `200` with the public certificate validating and HSTS
  enabled. Plain HTTP returned `308` to HTTPS. The API liveness endpoint returned
  `{"status":"ok","service":"api"}`.
- The unauthenticated conversation media-token endpoint returned `401`; the public
  `/rtc/v1/validate` endpoint returned `403`. MongoDB and queue Redis have no host-published ports.
  Mailpit remains bound to `127.0.0.1:8025`, not the public interface.
- The deployed browser smoke covered verification-code registration, login, workspace creation,
  invitation acceptance, office admission, cross-company isolation, movement/reconnect and SPA
  routing: 2 passed, 8 media-only cases skipped. Verification/invitation email was captured by the
  internal Mailpit worker; real SMTP delivery is not configured.
- A three-browser deployed LiveKit run passed with synthetic audio. All three clients received two
  remote audio tracks and decoded samples; group admission took `1,585 ms`. Removing one member
  removed its remote audio element in `154 ms` while the other two retained their tracks and decoded
  audio.
- A two-browser deployed audio run sustained decoded audio in both directions for five minutes:
  active samples `15,038`/`15,058`, longest silent gaps `17`/`24 ms`, maximum callback gaps
  `42`/`44 ms`, and no RTP packet loss at the checkpoints. On conversation leave, the conservative
  last-decoded-sample upper bound was `227 ms`; the remote audio element was removed and the map
  stayed mounted. This is one cutoff measurement on this image. The previous five-sample pilot run
  on `3d36609-issue12-3-20261116` measured `341, 300, 259, 332, 283 ms` (empirical p95 `341 ms`);
  repeat five samples after this merged revision before treating that p95 as current.
- Compose reported the API, Caddy, MongoDB, queue Redis, Mailpit and media guard healthy; the worker
  and LiveKit were running. The API restart preserved database-backed operations. The fresh archive
  is protected, but restore testing and an independent off-host copy are still outstanding.
- The merged source passed formatting, lint, typecheck, contract/world/media-spike/shared/web/API
  tests and production builds. The API suite passed `109` tests with `1` skipped. API integration
  required loopback-listen permission for its disposable MongoDB replica set; the sandboxed
  `pnpm check` invocation itself could not finish that step, so `pnpm test:api` and `pnpm build` were
  rerun separately and passed.

The fixed-room meeting implementation and UI are deployed. Its runtime, contracts and component
tests passed, but a live multi-client fixed-room audio session and meeting revocation have not been
verified. The deployed proximity audio path is verified above; A07 host/process failure supervision,
external TURN-only/network-blocked reachability, real SMTP onboarding, isolated restore and a
current five-sample cutoff p95 remain open release gates. The pilot includes synthetic
`@example.test` accounts/workspaces created by browser tests; these were retained rather than
deleting database records manually.

To roll back code only, use the immediate prior API/web tags
`gather-lite-api:3d36609-issue12-3-20261116` and
`gather-lite-web:3d36609-issue12-3-20261116`, and prior worker tag
`gather-lite-worker:6e4620dec60c`. Keep MongoDB, Redis, LiveKit, media-retirement volumes and current
auth/revocation data. Recreate API/Caddy/worker with the existing Compose overlays, then restart the
media guard to negotiate fresh policy. Do not restore an older database archive over current auth
state; OTP/invitation records created by the newer code may not be understood by the older app.

## Redeployment after Ibrahim's latest main commit — 2026-11-17

The current source is merge commit `d14bea5275ddfc847f256ad6f919c6914135f407`, with parents
`d67500dafdee2cf4396faab56956745aba412497` (issue #12/#3 deployment and evidence) and
`0fb323b3cf9db8b918f685ee882974755ea1ba9d` (Ibrahim's latest `origin/main`, scoped office wave).
The office protocol is version 3. The API, web and worker images use tag
`d14bea5-issue12-3-wave-20261117`; the guarded same-origin LiveKit route remains
`https://gather.imtelak.com/rtc` with the existing media guard and LiveKit images. No database schema
or index change was included in this merge.

Before rollout, `infra/deploy/backup.sh` created and gzip-validated
`/var/backups/gather-lite/gather-lite-20261117T123240Z.archive.gz`. Existing MongoDB and Redis
volumes were preserved. The protected `infra/deploy/.env` image references were updated with mode
`0600`; API, Caddy, media guard and Mailpit worker were recreated after the API passed health checks.
The media guard reconnected to the new API policy authority. MongoDB, Redis, Mailpit, LiveKit and all
application services were running after rollout; API, Caddy, media guard, MongoDB, Redis and Mailpit
reported healthy.

Verified after redeployment:

- Public HTTPS returned `200` with the certificate validating and HSTS enabled; HTTP returned `308`
  to HTTPS. `/api/health/live` returned `{"status":"ok","service":"api"}`. Unauthenticated
  media-token and `/rtc/v1/validate` requests returned `401` and `403`.
- The deployed two-browser office test passed registration, invitation, office entry, realtime
  movement, recovery/reconnect and company isolation. It also sent a live Wave action and observed
  the correct recipient notice. The SPA routing test passed. Result: 2 passed, 8 media-only cases
  skipped.
- A deployed three-client guarded LiveKit run decoded audio for all clients, with two remote tracks
  per participant and `1,706 ms` group admission. On member removal the remote audio element was
  removed in `205 ms`, and both survivors kept their remote track and decoded audio. This run did
  not sample the departed client's last decoded audio frame or use a TURN-only candidate; keep the
  p95 cutoff and external TURN gates open.
- Local validation passed formatting, lint, typecheck, contracts, world, media-spike, renderer,
  shared and web tests; `pnpm test:api` passed 110 tests with 1 skipped; `pnpm build` completed for
  the API, web, worker and shared packages. A first combined check run exposed an API wave-test
  timeout while its independent cross-office fixture was created at the end of a long integration
  case. Moving that setup to the start fixed it; the complete API suite then passed.

The immediate previous application images are retained locally as
`gather-lite-api:7d4d00b-issue12-3-20261117`,
`gather-lite-web:7d4d00b-issue12-3-20261117`, and
`gather-lite-worker:7d4d00b-issue12-3-20261117`. For a code-only rollback, set the three image
references in the protected `.env` to those tags and run the same Compose overlays with
`up -d --no-build api caddy worker-mailpit media-guard`. Keep all database, queue, media-retirement
and lease volumes and the current auth/revocation state. Do not restore the pre-deploy archive over
the live database.

Mailpit remains an internal capture service; its UI binds only to `127.0.0.1:8025` and is reachable
through the documented SSH tunnel. Port `8025` was not opened publicly. Real SMTP onboarding,
fixed-room live multi-client audio, live media revocation, independent off-host backup/restore,
external TURN-only reachability, media host/process failure supervision and a current five-sample
audio-cutoff p95 remain open pilot/release gates.

## Current deployment after Ibrahim's latest main commit — 2026-11-17

The current source is merge commit
37888d02e851e3ad6e2771fb0b746f7a92fadeae, with parents
4f471d804872653e3cb7dfd0a6e370a77a608f89 (the issue #12/#3 and prior pilot work) and
4ddabc92b1b7de341bddbf62c81607b252b67541 (Ibrahim's latest GitHub main commit, member action
card and Go to navigation, #35). GitHub main was checked after rollout and still points to
4ddabc9. API, web and mail-capture worker use
37888d0-issue12-3-actions-20261117. The existing media guard image and LiveKit v1.13.11 remain
unchanged. No schema/index or persistent-volume change was part of this rollout.

A pre-rollout Mongo archive was gzip-validated at
/var/backups/gather-lite/gather-lite-20261117T133525Z.archive.gz. API was updated and checked
healthy before Caddy and the Mailpit worker were recreated. The media guard reconnected to the API;
LiveKit restarted with its existing lease wrapper. MongoDB, Redis, Mailpit and persistent volumes
were preserved. The protected image-reference file remains mode 0600.

The latest Ibrahim UI is live at https://gather.imtelak.com: selecting a member opens the action
card, Wave sends repeated scoped greetings, and Go to uses the authoritative office movement
path. Same-origin guarded proximity audio remains available at /rtc.

Verified on the deployed revision:

- Public HTTPS returned 200; curl validated the certificate. HTTP redirects to HTTPS. HSTS and
  security headers were present. /api/health/live returned {"status":"ok","service":"api"}. An
  unauthenticated media-token request returned 401, and /rtc/v1/validate returned 403.
- Compose showed API, Caddy, MongoDB, queue Redis, Mailpit and media guard healthy. The API, Caddy
  and worker run the 37888d0 images; LiveKit was running. MongoDB/Redis have no host-published
  ports. Mailpit is bound to 127.0.0.1:8025 only; do not open port 8025 publicly.
- pnpm check passed, including formatting, lint, typecheck, contract/world/media-spike/shared/web
  and API suites and production builds. API: 110 passed, 1 skipped; web: 73 passed. The production
  web build emits the existing large-chunk advisory but completed.
- The deployed member-actions-live.spec.ts passed (1/1), covering the member card, repeated
  Wave delivery, Go to movement and narrow/mobile layout.
- pnpm test:e2e:live passed 2 checks and explicitly skipped 8 media-only cases in its smoke
  profile. The passing checks covered two-browser movement/reconnect/company isolation and nested
  SPA route authorization.
- The deployed three-client guarded audio test passed using synthetic audio. Each client received
  two remote tracks and decoded audio; group admission was 1,622 ms. When one member left, its
  remote audio element count fell to zero in 162 ms; both survivors retained a remote track and
  decoded audio. The test did not measure the departed client's final decoded sample, test a
  TURN-only network, or exercise old-token replay. Do not use the element-removal time as an audio
  cutoff guarantee.
- The backup archive was created before this rollout and gzip-validated. A restore drill and an
  independent off-host copy remain unverified. Synthetic E2E accounts/workspaces are retained; no
  manual database deletion was performed.

Routine operations from the repository root, using the same Compose overlays:

    docker compose --env-file infra/deploy/.env -f infra/deploy/compose.yaml -f infra/deploy/compose.media-pilot.yaml -f infra/deploy/compose.mailpit.yaml --profile media-pilot --profile mailpit ps
    docker compose --env-file infra/deploy/.env -f infra/deploy/compose.yaml -f infra/deploy/compose.media-pilot.yaml -f infra/deploy/compose.mailpit.yaml --profile media-pilot --profile mailpit restart caddy worker-mailpit
    infra/deploy/backup.sh

Tail logs with those Compose arguments followed by logs --tail=100 api caddy worker-mailpit media-guard media-livekit.
Use /api/health/live plus authenticated database and realtime operations for readiness; process
liveness alone does not establish full readiness. Use the existing SSH tunnel instructions above
for the Mailpit UI.

After any API restart or image replacement, wait for API health and restart `media-guard` before
testing media. The API's installation sequence is process-local; the guard must start a fresh
policy epoch after an API restart so its in-memory sequence cannot reject the API's reset sequence.

The immediate code rollback tags are gather-lite-api:d14bea5-issue12-3-wave-20261117,
gather-lite-web:d14bea5-issue12-3-wave-20261117, and
gather-lite-worker:d14bea5-issue12-3-wave-20261117. Restore only those image references in the
protected .env, then recreate API/Caddy/worker with the same overlays and restart media-guard so it
negotiates fresh policy with the rolled-back API. Keep MongoDB, Redis, LiveKit lease and
media-retirement volumes and current authentication/revocation state. Do not restore an older
archive over the live database. The backup path above is a recovery artifact, not a code rollback
mechanism.

The pilot is operational, not a production signoff. Real SMTP is not configured; Mailpit captures
verification/invitation mail. Fixed-room multi-client media and revocation, old-generation replay
rejection against the deployed guard, external TURN-only reachability, guard/SFU host failure
supervision, isolated restore and off-host backup remain open acceptance gates.

## Current deployment after Ibrahim's CSP and meeting invitation merge — 2026-11-18

Merged GitHub `main` commit `5da6403b0d803613621fa9912ecd58b3a7934fc3` (#36 CSP headers and #37
meeting invitations/run-to-join) with the local issue #12/#3 branch at `184b3c9312e871cf78ae97ee5c5efb646cc49555` as
`ae5f88ea0ca815740de06a05b271cea682e4f532`. The merge commit was pushed to GitHub `main`. The API,
web and Mailpit worker were built from that commit and deployed together with the existing office
protocol version. Proximity audio remains enabled through the guarded same-origin `/rtc` route.
Meeting invitations now have accept/decline/cancel UI; meeting capacity follows the merged 20-person
meeting limit while proximity remains capped at six. No schema migration, index job or destructive
database operation was run.

Before rollout, `infra/deploy/backup.sh` created and gzip-validated
`/var/backups/gather-lite/gather-lite-20261118T083923Z.archive.gz`. MongoDB, Redis, media-retirement,
LiveKit lease and Mailpit volumes were preserved. The protected image-reference `.env` remained mode
`0600`; its API, web and worker tags now use
`ae5f88ea0ca815740de06a05b271cea682e4f532-merge-20261118`.

The API, Caddy frontend and Mailpit worker use the new images. MongoDB, queue Redis, Mailpit, and the
existing media guard are running; API, Caddy, MongoDB, Redis, Mailpit and the guard report healthy.
LiveKit runs its existing pinned `v1.13.11` image and lease wrapper. Compose refreshed that container
from the merged profile; its lease volume was preserved. API/Caddy/worker images are reproducible
from the pushed commit. There is no Compose health check for LiveKit or the mail worker.

Verified after rollout:

- `https://gather.imtelak.com` returned HTTP 200 with a certificate accepted by curl, HSTS, the
  merged Content-Security-Policy and other security headers. `/api/health/live` returned the API
  liveness payload. Anonymous `/api/auth/me` returned 401. The live Playwright smoke passed its
  two enabled checks (two-browser office admission, movement, seat/reconnect recovery, company
  isolation and nested SPA authorization); eight media-only cases were skipped by that smoke profile.
- The first audio attempt remained in “Preparing guarded voice.” The API had restarted and reset its
  process-local media-policy sequence while the long-running guard retained its previous sequence.
  API/guard policy and LiveKit keys were present and matched. Restarting only `media-guard` established
  a fresh policy epoch; subsequent snapshots received exact install acknowledgements. This recovery
  is now part of the API rollout procedure above. The API, media retirement and LiveKit lease volumes
  were not reset.
- The deployed three-client synthetic-audio test passed: all clients had two remote tracks and
  decoded audio; group admission took 1,449 ms. After the third participant left, their remote audio
  element was removed in 202 ms and the remaining pair continued decoding audio. Selected candidate
  types included host and server-reflexive paths; this is not TURN-only evidence.
- The deployed five-cycle boundary/re-entry test measured conservative upper bounds from the
  movement request that crossed the server-published 64-pixel circle to the first silent decoded
  sample: 311, 272, 312, 178 and 243 ms. Empirical p95 and maximum were both 312 ms (n=5), below the
  1-second p95 target and 2-second maximum for this synthetic, stable-network run. Each re-entry
  created a new area, and microphones stayed off until explicitly enabled. These samples do not
  establish behavior on physical microphones, weak networks or TURN-only routes.
- `pnpm check` passed before deployment: 126 API tests passed and one was skipped; 73 web tests
  passed; contract/world/media-spike/shared checks, lint, typechecks, formatting and production
  builds passed. The web build retains its existing large-chunk advisory. The focused invitation
  UI E2E passed locally. No production database indexes were created by this rollout.

The Mailpit UI remains bound to `127.0.0.1:8025`; MongoDB and Redis have no public host binding.
Mail delivery still goes to Mailpit, not an external SMTP provider. Deployed E2E runs created
synthetic `@example.test` validation accounts/workspaces and Mailpit messages; they remain in the
pilot database because no cleanup flow was used. Fixed-room live group audio/revocation, stale-grant
replay rejection on the current guard, TURN-only external reachability, host/process failure
supervision, isolated restore, independent off-host backup and real SMTP remain open release gates.

The immediately previous application images are retained locally as
`gather-lite-api:37888d0-issue12-3-actions-20261117`,
`gather-lite-web:37888d0-issue12-3-actions-20261117`, and
`gather-lite-worker:37888d0-issue12-3-actions-20261117`. For a code-only rollback, restore only those
three protected `.env` image references, recreate API and Caddy/worker with the same Compose
overlays, then restart `media-guard` after API health so it negotiates a fresh policy epoch. Keep
MongoDB, Redis, media-retirement and lease volumes and current authentication/revocation state. Do
not restore the pre-deploy archive over the live database.

## Workspace Admin and login rollout — 2026-11-22

Deployed the tested workspace Admin RBAC and restored Sign-In design from local commit
`3a68d1b30b9396fa2675e151275757a40bae3745`, based on `main` commit
`78f798e1873347bb2c1fe10edd5902c04bae83e3`. The pilot API and web/Caddy images are tagged
`gather-lite-api:3a68d1b-admin-20261122` and `gather-lite-web:3a68d1b-admin-20261122`. The protected
deployment `.env` references those tags and remains mode `0600`.

Before rollout, MongoDB archive `/tmp/gather-lite-pre-admin-20261122.archive.gz` was created from
the live `gather_lite` database, verified with `gzip -t`, and stored mode `0600` (187,098 bytes).
No database indexes or migrations were run. MongoDB, queue Redis, Mailpit, media guard, worker,
and all named volumes were preserved. API and Caddy are healthy on the new images. LiveKit was
recreated once during the Compose rollout because the initial command used the isolated checkout's
bind-mount path; it is running again on the existing image and lease volume, and the media guard is
healthy. No media policy or guard configuration was changed.

Verified after rollout:

- `https://gather.imtelak.com/login` returned HTTP 200 with `TLS_VERIFY=0`; the page serves the new
  hashed JavaScript and CSS assets. The deployed login screenshot is `/tmp/gather-login-deployed.png`.
- `/api/health/live` returned `{"status":"ok","service":"api"}`. The same-origin CSRF bootstrap
  returned HTTP 200 when sent its required Origin, Fetch-Site and X-Requested-With headers. An
  unauthenticated workspace role PATCH returned HTTP 401.
- The deployment API and Caddy containers report healthy; MongoDB, Redis and the media guard remain
  healthy. A post-deploy read-only query confirmed the specified account is active and verified,
  with role `owner` in `bany` and `member` in `helloworld`.
- `pnpm check` passed: 142 API tests passed, 2 skipped; all 87 web tests, 30 contracts tests, 42
  world tests, 33 media-spike tests, lint, typechecks and production builds passed. `pnpm test:e2e`
  passed 17 tests with 14 live-service scenarios skipped. The targeted auth-route and Owner/Admin
  browser tests passed 15/15. The browser Admin journey uses the test API fixture; backend
  authorization was exercised by the Mongo-backed API integration suite.

The user confirmed `helloworld` as the target workspace. The account is already the Owner of `bany`
(Owner cannot be changed to Admin) and is a Member of `helloworld`. Its current verified Owner is
`test@test.com`. Promotion remains pending until that Owner uses the deployed role-management API
with recent reauthentication. No live role was modified by database update or by the unauthenticated
API probe.

To restart or update the deployed API/web pair, use the runtime Compose files in the isolated
checkout and keep the same overlays and environment file:

```sh
docker compose --env-file /tmp/gather-main-deploy/infra/deploy/.env \
  -f /tmp/gather-admin-rbac/infra/deploy/compose.runtime.yaml \
  -f /tmp/gather-admin-rbac/infra/deploy/compose.runtime.media-pilot.yaml \
  -f /tmp/gather-admin-rbac/infra/deploy/compose.runtime.mailpit.yaml \
  -f /tmp/gather-admin-rbac/infra/deploy/compose.runtime.proxy.yaml \
  --profile media-pilot --profile mailpit up -d --no-build api caddy
```

For code rollback before any Admin role has been granted, restore only the image references in the
protected `.env` to API `gather-lite-api:1b35b82-20261119` and web
`gather-lite-web:78f798e-bany-sidebar-20261122`, then run the same command. Keep MongoDB, Redis,
media-retirement/lease state and current authentication state; do not restore the archive over the
live database. Do not roll back to the older API while any Admin memberships exist.
