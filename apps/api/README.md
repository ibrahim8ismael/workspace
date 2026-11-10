# Backend API

NestJS API, company authorization, office admission and Socket.IO runtime. The browser currently connects account/company flows and the company-scoped Commons office through same-origin HTTP and Socket.IO. The supplied OpenOfficeForAll UI remains to be migrated to these adapters. Backend/API unit and integration tests do not require Docker; the full live browser E2E uses the local Compose stack.

## Configure and run

Use Node 24.18+ (24.x) and pnpm 10.33.0. Copy the root `.env.example` to an ignored `.env`, then configure:

- `MONGODB_URI`: a reachable transaction-capable MongoDB replica set or compatible sharded cluster. Standalone MongoDB is rejected. There is no production memory fallback.
- `OUTBOX_ENCRYPTION_KEY`: canonical base64 encoding of 32 random bytes (`openssl rand -base64 32`). Keep it stable and identical for API/worker; protect it outside Git.
- `APP_ORIGIN`: the exact allowed origin, without a trailing slash/path. Production requires HTTPS. No credentialed cross-origin allowance is configured.

```sh
pnpm install --frozen-lockfile
pnpm db:indexes
pnpm dev:api
```

`db:indexes` only creates missing declared indexes; it does not drop or synchronize away existing indexes. The API validates required uniqueness indexes at startup. `DB_AUTO_INDEX=true` is available only for isolated development/test environments and is rejected in production. HTTP defaults to loopback port 3000. `GET /api/health/live` is public process liveness, not media/readiness evidence.

See [backend API guide](../../docs/contracts/AUTH_AND_ROLES_API.md) for routes, headers, cookie behavior and examples.

## Checks

`pnpm test:api` builds shared/server packages and runs real HTTP/Mongo transaction tests plus security primitive checks. It uses a temporary MongoDB 8.2.6 replica set downloaded into the ignored `.cache/mongodb-binaries` directory, then stops it. This is real MongoDB, not an auth mock, and does not use Docker. No SMTP message is sent during tests.

`pnpm check` includes backend tests alongside formatting, lint, typechecking, shared-map tests and all workspace builds.

## Scope

Implemented: pending registration, password-bound verification, mailbox recovery, login, opaque cookie sessions, CSRF/Origin checks, session rotation/revocation/extension, password change, Mongo-backed abuse budgets, company owner/member authorization, recipient-bound invitations, atomic ownership transfer and exact capacity counters. Audit events and encrypted transactional mail outbox records are committed with domain mutations.

Email delivery requires separately configuring and explicitly starting the SMTP/BullMQ worker. SMTP provider delivery, production proxy behavior, independent audit/recovery mirroring, full compromised-password datasets, distributed load targets, deployment-level media authorization and LiveKit grant issuance are not established by local API tests. The browser `ApiClient`/`OfficeClient` currently connect account/company, office bootstrap/tickets and the `/office` Socket.IO gateway; the supplied UI migration is tracked separately. No platform-superadmin endpoint was added.
