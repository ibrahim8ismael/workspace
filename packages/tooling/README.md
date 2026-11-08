# Tooling

Strict TypeScript base, Node ESM and browser React configurations. Server builds use `tsc` with NodeNext resolution; the API enables legacy decorators and emitted metadata. Root ESLint configuration composes the shared lint rules, including forbidden server imports in browser/public-contract code. Root Prettier settings cover source/configuration; historical briefs and existing planning docs retain their authored formatting.

TypeScript is pinned to 6.0.3 because the installed typescript-eslint peer range excludes 7.x. Node types match the 24.x runtime. Vitest runs the backend primitive and real HTTP/Mongo integration tests; Node's test runner covers imported shared modules/maps/assets. Root `pnpm check` includes these suites with formatting, lint, typechecking and all builds. Browser, real delivery and media test suites remain future work.
