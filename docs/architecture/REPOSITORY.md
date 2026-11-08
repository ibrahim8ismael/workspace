# Repository implementation layout

Status: imported client and backend identity/tenancy/delivery/audit implemented; CP03 office admission implemented; realtime/media integration pending · Updated: 2026-11-09

The owner approved the refined structure and requested library installation with incremental pushes and no Docker execution. This page supersedes the earlier suggested folder decomposition; architecture/security requirements in the source brief still apply.

| Path | Responsibility | Current implementation |
|---|---|---|
| apps/web | Imported React/Vite client, temporarily in upstream root-level layout | Dashboard and React/SVG office entry view; legacy backend integration pending |
| apps/shared | Imported JavaScript office/map helpers and adjacent declarations | Private pnpm workspace with import/map regression tests |
| Future apps/web/src/features/office | Planned React controls, Phaser, typed bridge, realtime adapter and state | Original empty scaffold replaced by owner import; feature restructuring pending |
| apps/api | NestJS modular HTTP and future Socket.IO/runtime host | Backend authentication, company roles, validation, cookies/CSRF, Mongo transactions and liveness |
| apps/api/src/modules/identity | Accounts, credentials, sessions, tokens and auth delivery | Implemented backend account lifecycle and session/CSRF guards |
| apps/api/src/modules/tenancy | Workspace company boundary, memberships, invitations and policies | Implemented scoped owner/member APIs, invitations and owner/capacity transactions |
| apps/api/src/modules/office | Maps, admission, authoritative movement, seats and gateway adapters | Trusted map registry, workspace-scoped bootstrap, map backfill, ticket issuance and atomic consume implemented. Socket gateway/runtime remains CP05 |
| apps/api/src/modules/conversations, media | Policy-owned conversation and media work | Empty module boundaries |
| apps/api/src/modules/audit | Transactional security event recording | Implemented safe audit records and 30-day TTL; independent recovery mirror pending |
| apps/worker | Outbox dispatch and delivery processors/providers | Explicitly configured BullMQ/SMTP worker; no real mail sent in tests |
| packages/contracts | Public runtime schemas and DTOs | Liveness plus auth/company request schemas and safe account/workspace DTOs |
| packages/world | Pure engine-independent rules | Point type only; coordinate units and map format open |
| packages/assets | Asset provenance inventory | Records pinned public assets currently under apps/web/public; private reference art excluded |
| packages/delivery | Server-only outbox/job contracts shared with worker | Strict ID job schema, Mongo outbox schema and authenticated encryption helpers |
| packages/tooling | Strict TS Node/React configurations and ESLint composition | Configured and used by workspace checks |
| spikes/media-enforcement | M0 custom guard/supervision proof outside production apps | Planning README only |
| infra | Future Compose/Caddy/Mongo/Redis/media settings | Empty tracked directories; no containers run |
| tests/integration, tests/e2e | Cross-service tests | Empty tracked directories; no passing feature evidence |
| plugins/egm, .agents/plugins, .codex/config.toml | Project-local EGM planning/review tooling | Pinned complete upstream runtime and enabled project marketplace; not an application dependency |

## Ownership rules

Domain Mongo models and business policies belong to their owning API module. Do not create a global generic database repository. Shared delivery records are the specific exception needed by API and worker; their Mongo persistence and authenticated encryption are implemented in `packages/delivery/src/outbox.ts`. A module may split controllers, services, policies and adapters when implementation warrants it.

Public contracts and pure world code cannot import NestJS, database/queue/media server dependencies or application code. Browser code cannot import the server-only delivery package. ESLint blocks the named package patterns; this is a development boundary check, not a complete security sandbox.

The API remains the single office authority. Worker startup is explicit and separate. Media enforcement remains a spike until its Docker-compatible independent shutdown design is proven. Do not add speculative organization, billing, SSO or additional production services through scaffolding.

## Toolchain and dependencies

Node 24.18.0 minimum on 24.x; pnpm 10.33.0; TypeScript 6.0.3. Exact manifests and lockfile are authoritative. TypeScript 7 is intentionally excluded because typescript-eslint 8.72.1 supports versions below 6.1. Node type definitions use 24.x.

Key installed libraries: React 19.3.1, Vite 8.3.6, Phaser 4.2.1, NestJS 12.3.3, Mongo/Mongoose 9.12.0, Socket.IO 4.8.4, BullMQ 6.7.0, ioredis 6.0.0, LiveKit client 2.23.0/server SDK 2.19.2, Zod 4.6.7, Argon2 0.45.2, TanStack Query, React Router and Zustand. These are selected setup versions, not proof of completed product integrations. The LiveKit SFU/image pin remains open.

Native Argon2 install succeeded. The optional MessagePack accelerator install script is skipped; MessagePack uses its JavaScript fallback. Installation starts no application, database, queue or Docker service.

Version/compatibility references consulted: [Vite prerequisites](https://vite.dev/guide/), [NestJS setup](https://docs.nestjs.com/first-steps), and package metadata from the npm registry. The manifests use versions checked against their actual peer requirements rather than historical snapshot versions.

The [web import notes](../migration/WEB_IMPORT.md) supersede the original empty-web setup status and explain source provenance, compatibility settings and backend limitations.

The [backend-only auth/company API guide](../contracts/AUTH_AND_ROLES_API.md) supersedes the original empty identity/tenancy/worker status. Office/media runtime, frontend integration and production release evidence remain pending.
