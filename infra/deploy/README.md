# Gather Lite server deployment

This Compose project is isolated from `infra/compose.yaml` and the media E2E overlay. It expects
the host's existing Nginx to terminate public TLS and proxy to Caddy over a loopback HTTPS port.
MongoDB and Redis have no published ports. The app and API bind only to Docker networks; the only
published container port is the loopback Caddy listener. No LiveKit or TURN listener is enabled.

The default profile includes MongoDB replica-set storage, persistent queue Redis, the NestJS API,
and Caddy/static frontend. The `mail` profile is enabled only after a TLS-required SMTP provider
has been configured in `worker.env`. Mailpit is not part of this deployment.

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

Run from the repository root. Create the host Nginx HTTP-only challenge site from
`nginx-site.conf.template`, obtain the public certificate with Certbot webroot mode, then start the
Compose stack. Copy Caddy's public internal CA root from its data volume to
`/etc/nginx/ssl/gather-lite-caddy-root.pem`; install the complete HTTP/HTTPS Nginx site, run
`nginx -t`, and reload Nginx. The HTTP challenge directory is `/var/www/letsencrypt`; the HTTP
vhost redirects all other paths to HTTPS.

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

Start the core profile:

```sh
docker compose --env-file infra/deploy/.env -f infra/deploy/compose.yaml up -d
```

After TLS SMTP credentials are configured, start the mail worker:

```sh
docker compose --env-file infra/deploy/.env -f infra/deploy/compose.yaml --profile mail up -d worker
```

## Verify and operate

Inspect service state with `docker compose ... ps`, container health with `docker inspect` health
state, and sanitized logs with `docker compose ... logs --since 10m api caddy mongo redis-queue`.
Do not collect worker debug output containing provider details without reviewing it first. Check
resources with `docker stats --no-stream` and `df -h /`. `/api/health/live` is only liveness; verify
Mongo-backed registration/session/company operations, mail delivery, office Socket.IO, persistence
and browser-origin protections separately.

Take a protected compressed database dump with `infra/deploy/backup.sh`. It writes mode-0600
archives under `/var/backups/gather-lite`, validates the gzip stream, and retains the DB and queue
volumes. Copy backup artifacts to an independent protected destination before relying on them for
recovery. Test a restore into an isolated database before declaring recovery verified.

Routine restart: `docker compose ... restart`. Graceful stop retaining data: `docker compose ...
down`. Never add `-v` to shutdown or remove either persistent volume. To roll back code, deploy the
recorded previous image tags and matching Compose/configuration revision, then restart the stack;
keep the current database and queue. Recheck revoked sessions and tickets after rollback.

## Current pilot boundary

The production frontend build sets `VITE_PROXIMITY_VOICE_ENABLED=false`; voice controls report that
nearby voice is unavailable. The API's LiveKit settings remain blank, so media grant requests fail
closed. The local media E2E configuration is not used here. Enable media only after deploying the
independent guard/supervisor profile, TURN/ICE/firewall policy and production revocation/failure
tests documented in `docs/planning/ACCEPTANCE.md` and `MEDIA_ENFORCEMENT_EVIDENCE.md`.
