# Repository setup progress

Historical snapshot: the stage results below describe repository setup on 2026-11-05. Current state (2026-11-08) has ten workspace projects including root and `apps/shared`, imported source/assets and initial auth/company/audit/delivery code. See [auth evidence](AUTH_IMPLEMENTATION_EVIDENCE.md) and [completion progress](IMPLEMENTATION_PROGRESS.md). Historical counts, scaffold behavior and test scope below are preserved as observations at the original setup commits.

Scope authorized: create the agreed monorepo structure, install libraries, and push incremental commits. Do not run Docker.

| Stage | Work | Status |
|---|---|---|
| 1 | Track monorepo directories, Node/pnpm policy and environment template | Complete; pushed as b700d5b |
| 2 | Install pinned libraries and add buildable web/API/worker/shared-package starters | Complete; pushed as c44077f |
| 3 | Add source quality checks, CI and developer instructions; verify and push | Complete; pushed as 1575118; hosted CI passed |

The workspace contains nine projects (root plus eight children). Exact manifests and `pnpm-lock.yaml` record dependencies; the initial installation added 389 packages. Offline frozen-lockfile verification succeeded. Initial build and lint passed on local Node 24.18.0/pnpm 10.33.0.

This is repository setup evidence, not product acceptance. Auth, tenancy, simulation, delivery, media enforcement and production operations remain unimplemented. No upstream source/assets have been imported. The company hierarchy, media topology, providers and Docker supervision decisions stay open.

See [implemented repository layout](../architecture/REPOSITORY.md) for package ownership and dependency choices.

## Local setup verification

Executed on Node 24.18.0 / pnpm 10.33.0:

- `pnpm install --offline --frozen-lockfile`: passed using the populated install cache.
- `pnpm check`: formatting, ESLint, all workspace TypeScript checks and full production builds passed.
- Native Argon2 hash/verify smoke check: passed; no hash/secret was printed.
- Worker entrypoint: started, printed scaffold status and exited without connecting to infrastructure.
- Temporary loopback API and Vite smoke check: liveness, entry HTML and proxied `/api/health/live` passed; both process groups were stopped.
- No Docker command was executed. No MongoDB, Redis, LiveKit or mail service was started.

GitHub Actions completed frozen install plus `pnpm check` successfully on a clean Ubuntu runner for commit `1575118`. Evidence: [successful CI run](https://github.com/ibrahim8ismael/workspace/actions/runs/42079999382). No authentication, tenant-isolation or media acceptance result is implied by these setup checks.
