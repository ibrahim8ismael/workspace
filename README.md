# Gather Lite

B2B SaaS virtual offices for companies and their teams.

The current repository milestone is [v0.1.0](docs/releases/v0.1.0.md), published as a pre-release
for evaluation. Production and pilot acceptance gates remain open.

## Repository

| Directory                  | Responsibility                                                              |
| -------------------------- | --------------------------------------------------------------------------- |
| `apps/web`                 | React/Vite UI, Phaser office and browser media adapters                     |
| `apps/api`                 | NestJS identity, tenant policy, office runtime and media authorization      |
| `apps/worker`              | Outbox dispatch and background delivery                                     |
| `packages/contracts`       | Safe public runtime schemas, DTOs and protocol versions                     |
| `packages/world`           | Framework-independent map and simulation rules                              |
| `packages/assets`          | Cleared artwork, immutable maps and provenance                              |
| `packages/delivery`        | Server-only outbox and job contracts                                        |
| `packages/tooling`         | Shared compiler and code-quality configuration                              |
| `spikes/media-enforcement` | Isolated guard/supervision proof, outside production apps                   |
| `infra`                    | Private local Compose, ingress, database, queue and mail-sink configuration |
| `tests`                    | Future cross-service integration and end-to-end checks                      |
| `docs`                     | Product requirements, entity plans, contracts and delivery gates            |

Use Node 24.18+ on the 24.x line and pnpm 10.33.x. Exact direct dependency versions and the lockfile are committed. The initial application/tooling scaffold is installed; see [setup progress](docs/planning/SETUP_PROGRESS.md) and [repository ownership](docs/architecture/REPOSITORY.md).

Docker and infrastructure services are not started by repository setup or dependency installation. The browser now uses authenticated account/company and session-security UI; the backend implements authentication, company owner/member policy, trusted office bootstrap and admission tickets, with configured mail outbox processing. Realtime office participation and media enforcement remain pending. Never expose an unauthenticated world or debug media issuer as a shortcut.

## Documentation

Start with [project documentation](docs/README.md), the [authoritative brief](GATHER_LITE_PROJECT_KNOWLEDGE.md) and [B2B SaaS requirements](docs/product/B2B_SAAS.md). The owner accepted one company/workspace/office, verified-user self-service creation and all-LiveKit media on 2026-11-08. Full company lifecycle and commercial billing remain separate decisions.

## Local development

```sh
pnpm install --frozen-lockfile
# Configure MongoDB and the outbox key before starting the backend.
cp .env.example .env
# Set MONGODB_URI and OUTBOX_ENCRYPTION_KEY in .env.
pnpm db:indexes
pnpm dev
```

`pnpm dev` builds shared packages once, then starts Vite and the loopback API. Open http://localhost:5173. The default entry provides account registration, code verification, login/recovery and company list/create/invitation acceptance against NestJS; see [web integration boundaries](apps/web/README.md). Browser authentication requires same-origin HTTPS for Secure cookies; the plain HTTP development URL is suitable for UI development, not completed authentication evidence. The API now requires a reachable transaction-capable MongoDB replica set, an outbox encryption key, and provisioned indexes. See the [backend setup guide](apps/api/README.md) and [API contract](docs/contracts/AUTH_AND_ROLES_API.md). `/api/health/live` remains liveness only. No LiveKit service is connected.

| Command               | Purpose                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev:web`        | Web development server only                                                        |
| `pnpm dev:api`        | API compiler watch plus Node restart with decorator metadata                       |
| `pnpm dev:worker`     | Configured Mongo outbox/BullMQ/SMTP worker; starts separately                      |
| `pnpm build:packages` | Rebuild shared packages after changing their source                                |
| `pnpm build`          | Build shared packages, API, worker and production web assets                       |
| `pnpm typecheck`      | Check TypeScript across all source packages                                        |
| `pnpm lint`           | ESLint and browser/server import boundaries                                        |
| `pnpm format`         | Format source/configuration; existing project briefs/docs preserved                |
| `pnpm check`          | Formatting, lint, typecheck, browser/backend/shared regressions and full build     |
| `pnpm test:web`       | Validate browser API safety, durable retries, session deadlines and legacy cleanup |
| `pnpm test:contracts` | Validate shared HTTP/office/event projections and hostile payload boundaries       |
| `pnpm clean`          | Remove generated workspace build outputs                                           |

Shared packages expose compiled ESM and declarations. Re-run `pnpm build:packages` and restart the app when editing shared code during development. The API and web watch their own sources. No install/build/dev command starts Docker. Vitest covers browser API boundaries, shared contracts/world rules and backend auth/company/admission behavior; broader delivery, realtime and media acceptance remains future work.

CI performs a frozen install and `pnpm check` without Docker or external service credentials. Backend tests download/run a temporary MongoDB binary in an ignored cache and stop it afterward; they do not send real email. Private `.env` files, `node_modules`, build outputs and coverage are ignored by Git.
