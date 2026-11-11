ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG CADDY_IMAGE=caddy:2.11.9-alpine@sha256:0bbb055bda6793c999bde78b1b5ce3e89f829fb031af2cf50056ea1246559fee

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build:packages \
    && pnpm --filter @gather/api build \
    && pnpm --filter @gather/worker build \
    && pnpm --filter @gather/web build

FROM ${NODE_IMAGE} AS node-runtime
WORKDIR /workspace
ENV NODE_ENV=production

FROM node-runtime AS api-runtime
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/apps/shared ./apps/shared
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
USER node
CMD ["node", "apps/api/dist/main.js"]

FROM node-runtime AS worker-runtime
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=node:node /workspace/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build --chown=node:node /workspace/apps/worker/dist ./apps/worker/dist
USER node
CMD ["node", "apps/worker/dist/main.js"]

FROM ${CADDY_IMAGE} AS web-runtime
COPY --from=build /workspace/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
EXPOSE 8443

FROM api-runtime AS media-guard-runtime
COPY --from=build --chown=node:node /workspace/spikes/media-enforcement/guard-process.mjs ./spikes/media-enforcement/guard-process.mjs
COPY --from=build --chown=node:node /workspace/spikes/media-enforcement/signaling-guard.mjs ./spikes/media-enforcement/signaling-guard.mjs
COPY --from=build --chown=node:node /workspace/spikes/media-enforcement/source-grants.mjs ./spikes/media-enforcement/source-grants.mjs
COPY --from=build --chown=node:node /workspace/spikes/media-enforcement/application-token-authorization.mjs ./spikes/media-enforcement/application-token-authorization.mjs
COPY --from=build --chown=node:node /workspace/spikes/media-enforcement/permit-state.mjs ./spikes/media-enforcement/permit-state.mjs
COPY --from=build --chown=node:node /workspace/spikes/media-enforcement/policy-pull.mjs ./spikes/media-enforcement/policy-pull.mjs
COPY --from=build --chown=node:node /workspace/spikes/media-enforcement/retirement-store.mjs ./spikes/media-enforcement/retirement-store.mjs
COPY --chown=node:node infra/media/local-guard-entry.mjs ./infra/media/local-guard-entry.mjs
USER node
CMD ["node", "infra/media/local-guard-entry.mjs"]
