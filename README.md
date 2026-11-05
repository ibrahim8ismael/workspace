# Gather Lite

B2B SaaS virtual offices for companies and their teams.

## Repository

| Directory                  | Responsibility                                                         |
| -------------------------- | ---------------------------------------------------------------------- |
| `apps/web`                 | React/Vite UI, Phaser office and browser media adapters                |
| `apps/api`                 | NestJS identity, tenant policy, office runtime and media authorization |
| `apps/worker`              | Outbox dispatch and background delivery                                |
| `packages/contracts`       | Safe public runtime schemas, DTOs and protocol versions                |
| `packages/world`           | Framework-independent map and simulation rules                         |
| `packages/assets`          | Cleared artwork, immutable maps and provenance                         |
| `packages/delivery`        | Server-only outbox and job contracts                                   |
| `packages/tooling`         | Shared compiler and code-quality configuration                         |
| `spikes/media-enforcement` | Isolated guard/supervision proof, outside production apps              |
| `infra`                    | Future Docker, ingress, database, Redis and media configuration        |
| `tests`                    | Future cross-service integration and end-to-end checks                 |
| `docs`                     | Product requirements, entity plans, contracts and delivery gates       |

Use Node 24.18+ on the 24.x line and pnpm 10.33.x. Exact direct dependency versions and the lockfile are committed. The initial application/tooling scaffold is installed; see [setup progress](docs/planning/SETUP_PROGRESS.md) and [repository ownership](docs/architecture/REPOSITORY.md).

Docker and infrastructure services are not started by repository setup or dependency installation. The initial scaffold does not implement authentication, customer policy, office admission, queues or media enforcement. Never expose an unauthenticated world or debug media issuer as a shortcut.

## Documentation

Start with [project documentation](docs/README.md), the [authoritative brief](GATHER_LITE_PROJECT_KNOWLEDGE.md) and [B2B SaaS requirements](docs/product/B2B_SAAS.md). One company per workspace is the planning default; organization hierarchy and commercial billing remain separate decisions.

## Local development

```sh
pnpm install --frozen-lockfile
# Optional: defaults work without a local .env.
cp .env.example .env
pnpm dev
```

`pnpm dev` builds shared packages once, then starts Vite and the loopback API. Open http://localhost:5173. The API exposes only `GET /api/health/live` on port 3000. It does not connect to MongoDB, Redis or LiveKit. This endpoint is liveness, not production readiness.

| Command               | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `pnpm dev:web`        | Web development server only                                         |
| `pnpm dev:api`        | API compiler watch plus Node restart with decorator metadata        |
| `pnpm dev:worker`     | Worker scaffold; exits until processors are implemented             |
| `pnpm build:packages` | Rebuild shared packages after changing their source                 |
| `pnpm build`          | Build shared packages, API, worker and production web assets        |
| `pnpm typecheck`      | Check TypeScript across all source packages                         |
| `pnpm lint`           | ESLint and browser/server import boundaries                         |
| `pnpm format`         | Format source/configuration; existing project briefs/docs preserved |
| `pnpm check`          | Formatting, lint, typecheck and full build                          |
| `pnpm clean`          | Remove generated workspace build outputs                            |

Shared packages expose compiled ESM and declarations. Re-run `pnpm build:packages` and restart the app when editing shared code during development. The API and web watch their own sources. No install/build/dev command starts Docker. Vitest is available for future focused tests; no feature test suite exists yet.

CI performs a frozen install and `pnpm check` without Docker or external service credentials. Private `.env` files, `node_modules`, build outputs and coverage are ignored by Git.
