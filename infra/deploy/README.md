# Gather Lite server deployment

This Compose project is isolated from `infra/compose.yaml` and the media E2E overlay. It expects
the host's existing Nginx to terminate public TLS and proxy to Caddy over a loopback HTTPS port.
MongoDB and Redis have no published ports. The app and API bind only to Docker networks; the only
published container port is the loopback Caddy listener. No LiveKit or TURN listener is enabled.

The default profile includes MongoDB replica-set storage, persistent queue Redis, the NestJS API,
and Caddy/static frontend. The production `mail` profile is enabled only after a TLS-required SMTP
provider has been configured in `worker.env`. The optional `compose.mailpit.yaml` overlay is a
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

The production frontend build sets `VITE_PROXIMITY_VOICE_ENABLED=false`; voice controls report that
nearby voice is unavailable. The API's LiveKit settings remain blank, so media grant requests fail
closed. The local media E2E configuration is not used here. Enable media only after deploying the
independent guard/supervisor profile, TURN/ICE/firewall policy and production revocation/failure
tests documented in `docs/planning/ACCEPTANCE.md` and `MEDIA_ENFORCEMENT_EVIDENCE.md`.

No real TLS SMTP provider is configured in this environment, so email verification, password
recovery, and invitation delivery are not ready for real onboarding. The isolated Mailpit capture
profile is available for code testing through an SSH tunnel, but captured messages do not leave the
server. Configure the protected `worker.env` with the provider's TLS endpoint, sender, and
credentials, stop `worker-mailpit`, start the production `mail` profile, and verify real delivery
before inviting users.
