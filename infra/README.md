# Local delivery environment

CP04.3a configuration is complete. The owner explicitly authorized local Docker runtime testing for CP04.3b on 2026-11-09, superseding the earlier “Do not run Docker” setup restriction in [setup progress](../docs/planning/SETUP_PROGRESS.md). Local runtime validation is complete; see the [evidence](../docs/planning/CP04_BROWSER_AND_DELIVERY.md#cp043b--runtime-evidence). This authorization covers local containers and Mailpit; it does not install certificate trust or configure an external mail provider.

## Service layout

| Service     | Purpose                                                              | Host access               |
| ----------- | -------------------------------------------------------------------- | ------------------------- |
| Caddy       | Built web files and same-origin HTTPS `/api` plus `/socket.io` proxy | `https://localhost:8443`  |
| API         | Existing account/company API                                         | Private container network |
| MongoDB     | Single-node `rs0` replica set                                        | Private container network |
| Queue Redis | Durable mail queue, AOF and `noeviction`                             | Private container network |
| Cache Redis | Optional disposable cache profile                                    | Private container network |
| Worker      | Outbox dispatch and SMTP delivery                                    | Explicit `worker` profile |
| Mailpit     | Local message capture and persistent inbox                           | `http://localhost:8025`   |

The `edge` and `data` networks are internal. Caddy and Mailpit also join the standard `host-access` bridge so their published ports work on the host. The optional local media fixture also joins LiveKit to `host-access` so its loopback ICE port is actually reachable. That bridge permits outbound connectivity for attached services; the API, worker, MongoDB and Redis remain on internal networks. Published ports bind to host loopback. The API uses `API_HOST=0.0.0.0` inside its container, with `APP_ORIGIN=https://localhost:8443`. Caddy routes API requests before its static-file fallback and removes forwarding headers before proxying. The API retains its existing proxy policy.

MongoDB, queue Redis, the inbox and Caddy certificates use named volumes. The cache profile is optional and disposable. The local worker delivers to Mailpit. SMTP TLS is disabled in that development profile. The application’s production SMTP validation requires TLS.

## Prepare the private settings

Run from the repository root, using Node 24.18+ on the 24.x line and pnpm 10.33.x.

```sh
node infra/init-local-env.mjs
```

The helper creates `infra/.env.local` with mode `0600` and a random 32-byte outbox key. It refuses to replace an existing file. Keep that file with the persistent local data across restarts so queued messages remain decryptable. The template is [`.env.local.example`](../.env.local.example).

## Explicit startup sequence

The owner authorized these local runtime commands on 2026-11-09. Docker Compose v2 or later is required.

First build and run the setup job. It starts MongoDB, initializes the expected single-node replica set and provisions the existing API indexes.

```sh
docker compose --env-file infra/.env.local -f infra/compose.yaml --profile setup build indexes
docker compose --env-file infra/.env.local -f infra/compose.yaml --profile setup run --rm indexes
```

The replica-set initializer can be repeated. It rejects a different existing configuration. The API checks required indexes at startup.

Start the web/API profile and its private services.

```sh
docker compose --env-file infra/.env.local -f infra/compose.yaml --profile app up --build -d
```

Start delivery explicitly when ready to capture local messages.

```sh
docker compose --env-file infra/.env.local -f infra/compose.yaml --profile app --profile worker up --build -d worker
```

The optional cache can be started with its `cache` profile.

```sh
docker compose --env-file infra/.env.local -f infra/compose.yaml --profile app --profile worker --profile cache up -d redis-cache
```

## Local TLS and browser checks

Caddy issues the localhost certificate using its internal CA. Export its public root certificate to verify HTTPS with a client.

```sh
docker compose --env-file infra/.env.local -f infra/compose.yaml --profile app cp caddy:/data/caddy/pki/authorities/local/root.crt /private/tmp/gather-local-root.crt
curl --cacert /private/tmp/gather-local-root.crt https://localhost:8443/api/health/live
```

Certificate trust installation is a separate explicit action. The health route checks API liveness. Local acceptance covered cookie/Origin behavior, MongoDB commit/abort, persistence, worker delivery and restart recovery. The isolated Chrome test process bypassed certificate warnings; a separate HTTPS client validated the exported CA, including after recreation. OS certificate trust was not changed.

Open `https://localhost:8443` and the local inbox at `http://localhost:8025`. Register a fixture account and use its captured verification code in the application. Verify company creation, invitation acceptance and password recovery through the same origin. The local inbox contains sensitive one-time codes.

## Stop and retain state

```sh
docker compose --env-file infra/.env.local -f infra/compose.yaml --profile app --profile worker --profile cache --profile setup down
```

Named volumes and `infra/.env.local` retain the local database, queue, inbox, certificates and outbox key for the next run.

## Pins and references

The Dockerfile and Compose file pin image digests for Node 24.18.0, MongoDB 8.2.6, Redis 8.2.3, Caddy 2.11.9 and Mailpit 1.33.1. Linux amd64 and arm64 manifest entries were verified against the official registry on 2026-11-09. Application dependencies use the frozen pnpm lockfile.

Configuration references are the [Compose specification](https://compose-spec.github.io/compose-spec/), [Caddy proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Caddy local TLS settings](https://caddyserver.com/docs/caddyfile/options), [Mailpit Docker image](https://mailpit.axllent.org/docs/install/docker/) and [Mailpit runtime options](https://mailpit.axllent.org/docs/configuration/runtime-options/). Review and runtime evidence belong in the [CP04 delivery plan](../docs/planning/CP04_BROWSER_AND_DELIVERY.md).

## Verified local boundary

CP04.3b passed on 2026-11-09 using Docker Engine 29.8.2, Compose 5.5.0, OrbStack, Linux arm64 containers and Headless Chrome 152.0.7977.42 on macOS 26.6.1. All three application image targets built. Actual verification, invitation and recovery mail reached Mailpit. A paused BullMQ job survived full environment recreation and was delivered after resume; the queue, database, inbox and encryption key were retained, while optional cache data was discarded.

After verification the project containers were stopped with the documented `down` command. Named volumes and the ignored private settings file were retained. Run setup before first use of new data; a normal restart uses the app/worker profiles without the setup profile. Include the optional cache profile only if needed. External SMTP/provider delivery, public ingress, Edge and production acceptance remain later checkpoints.

## Manual testing session

On 2026-11-09 the owner requested the local environment and frontend be left running for manual testing. The `app` and `worker` profiles were restarted from the verified images and retained volumes on the `orbstack` Docker context. Frontend signin rendering, same-origin API health, CA-validated HTTPS and Origin checks passed; no browser runtime exceptions were observed. The application is available at `https://localhost:8443` and the captured inbox at `http://localhost:8025` while those services remain running.

If the selected Docker context points to another engine, use `docker --context orbstack compose` in place of `docker compose` in the commands above. This selects the existing local engine for that command without changing the global Docker context. The local certificate is still not installed in the OS trust store, so the manual browser may show a certificate warning.

## Mounted Vivo media E2E (local only)

The two-browser mounted-office media test uses the optional `compose.media-e2e.yaml` overlay. It
requires the normal private `infra/.env.local` settings and creates a separate ignored
`infra/.env.media-e2e` file with mode `0600` for random guard/LiveKit test credentials. Create it
once; the helper refuses to overwrite an existing file.

```sh
node infra/init-media-e2e-env.mjs
docker --context orbstack compose --env-file infra/.env.media-e2e \
  -f infra/compose.yaml -f infra/compose.media-e2e.yaml \
  --profile app --profile media-e2e up --build -d
pnpm exec playwright install chromium
pnpm test:e2e:live-media
LIVE_OFFICE_E2E=1 pnpm exec playwright test tests/e2e/live-office.spec.ts \
  -g 'live two-browser Vivo admission'
```

The overlay routes signaling through `https://localhost:8443/rtc` and publishes only TCP ICE on
`127.0.0.1:17881`. Playwright uses a synthetic microphone, so the test exercises the actual browser
audio track, API grant, local policy guard, LiveKit server and mounted Vivo UI without requesting a
physical microphone. LiveKit must join both `edge` and `host-access`: an internal-only network
can leave Docker's configured port binding inactive (`NetworkSettings.Ports` is null), causing
host `127.0.0.1:17881` connections to be refused. Signaling can still reach LiveKit through Caddy,
but ICE fails and the SDK never reaches the subsequent microphone permission request. After
changing networks, recreate LiveKit using the same Compose command and confirm
`nc -vz 127.0.0.1 17881` succeeds. Refresh both office tabs and re-enable their microphones.
The profile is a local integration fixture; it does not include CP07's
independent supervisor/SFU lease deployment, TURN/UDP, public ingress or production secrets.

The overlay also configures LiveKit to POST signed events directly to
`http://api:3000/api/internal/media/livekit/webhook` over the private Docker network. The API uses
the same `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` values as the local LiveKit server. Caddy
returns 404 for `/api/internal/*` and `/api/media/internal/*`, so browser traffic cannot reach the
webhook or media-policy machine routes. The receiver checks the signed JWT and exact raw-body
digest; the SDK's default clock tolerance is 10 seconds, and event IDs are retained for dedupe for
30 days. Never put those credentials in browser configuration or a public webhook URL.

Stop the composed app and media fixture when finished; named volumes and both ignored env files are
retained.

```sh
docker --context orbstack compose --env-file infra/.env.media-e2e \
  -f infra/compose.yaml -f infra/compose.media-e2e.yaml \
  --profile app --profile media-e2e down
```
