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

Use Node 24.18+ on the 24.x line and pnpm 10.33.x. Exact direct dependency versions and the lockfile are committed. Application setup is in progress; see [setup progress](docs/planning/SETUP_PROGRESS.md).

Docker and infrastructure services are not started by repository setup or dependency installation. The initial scaffold does not implement authentication, customer policy, office admission, queues or media enforcement. Never expose an unauthenticated world or debug media issuer as a shortcut.

## Documentation

Start with [project documentation](docs/README.md), the [authoritative brief](GATHER_LITE_PROJECT_KNOWLEDGE.md) and [B2B SaaS requirements](docs/product/B2B_SAAS.md). One company per workspace is the planning default; organization hierarchy and commercial billing remain separate decisions.
