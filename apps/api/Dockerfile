# ---------------------------------------------------------------------------
# PresenterOps API container
# ---------------------------------------------------------------------------

FROM node:20-alpine AS builder

WORKDIR /repo

# Copy workspace manifests first.
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Prisma schema must exist before npm ci because the API package has:
# "postinstall": "prisma generate"
COPY apps/api/prisma apps/api/prisma

RUN npm ci --workspaces --include-workspace-root

# Build shared package.
COPY packages/shared packages/shared
RUN npm run build --workspace @presenter-ops/shared

# Copy and build API.
COPY apps/api apps/api

RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace @presenter-ops/api


# ---------------------------------------------------------------------------
# Runtime image
# ---------------------------------------------------------------------------

FROM node:20-alpine AS runtime

WORKDIR /repo

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init

COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Prisma schema is also required during the production npm install because
# the API workspace postinstall script runs Prisma generate.
COPY apps/api/prisma apps/api/prisma

RUN npm ci --omit=dev --workspaces --include-workspace-root \
    && npm cache clean --force

# Copy compiled application.
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/api/dist apps/api/dist

# Copy Prisma schema and generated client.
COPY --from=builder /repo/apps/api/prisma apps/api/prisma
COPY --from=builder /repo/node_modules/.prisma node_modules/.prisma

USER node

EXPOSE 4000

# Apply database migrations and start NestJS.
CMD ["dumb-init", "sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]