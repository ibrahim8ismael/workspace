# API starter

NestJS modular application. Only `GET /api/health/live` exists; it reports process liveness, not database/media readiness. Domain modules are empty boundaries. No Socket.IO gateway, auth flow, tenant data endpoint or media token issuer is exposed. Mongo/Redis dependencies are installed but not connected during startup.

Run from the repository root with `pnpm dev:api`. Environment is loaded from the root `.env` only when present; defaults bind to loopback. Server compilation uses TypeScript with decorator metadata (including in watch mode).
