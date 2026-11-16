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
