# ---------------------------------------------------------------------------
# API container. Multi-stage so the published image carries no build tooling.
# Railway will use this automatically when the service root is apps/api.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS builder
WORKDIR /repo

# Workspace manifests first — this layer only rebuilds when a dependency
# actually changes, which keeps most pushes to a few seconds of install.
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspaces --include-workspace-root

COPY packages/shared packages/shared
RUN npm run build --workspace @presenter-ops/shared

COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace @presenter-ops/api

# --- runtime ---------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

RUN apk add --no-cache dumb-init

COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspaces --include-workspace-root && npm cache clean --force

COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/api/dist apps/api/dist
COPY --from=builder /repo/apps/api/prisma apps/api/prisma
COPY --from=builder /repo/node_modules/.prisma node_modules/.prisma

USER node
EXPOSE 4000

# Migrations run on boot. Prisma's `migrate deploy` is idempotent, so a
# restarted or scaled container does not re-apply anything.
CMD ["dumb-init", "sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
