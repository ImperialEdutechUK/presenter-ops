# ---------------------------------------------------------------------------
# PresenterOps API - Railway production container
# ---------------------------------------------------------------------------

# ===========================================================================
# Builder
# ===========================================================================

FROM node:20-bookworm-slim AS builder

WORKDIR /repo

# Prisma requires OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Install workspace dependencies
# ---------------------------------------------------------------------------

# Root workspace files.
COPY package.json package-lock.json ./

# Workspace package manifests required by the API.
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Prisma schema must be available before npm ci because the API package
# runs "prisma generate" during postinstall.
COPY apps/api/prisma apps/api/prisma

RUN npm ci --workspaces --include-workspace-root

# ---------------------------------------------------------------------------
# Build shared package
# ---------------------------------------------------------------------------

COPY packages/shared packages/shared

RUN npm run build --workspace @presenter-ops/shared

# ---------------------------------------------------------------------------
# Build API
# ---------------------------------------------------------------------------

COPY apps/api apps/api

RUN ./node_modules/.bin/prisma generate \
    --schema apps/api/prisma/schema.prisma

RUN npm run build --workspace @presenter-ops/api


# ===========================================================================
# Runtime
# ===========================================================================

FROM node:20-bookworm-slim AS runtime

WORKDIR /repo

ENV NODE_ENV=production

# OpenSSL is required by Prisma.
# dumb-init handles shutdown signals correctly inside Railway.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates \
        dumb-init \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Install production dependencies
# ---------------------------------------------------------------------------

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Prisma schema is needed because postinstall runs prisma generate.
COPY apps/api/prisma apps/api/prisma

RUN npm ci --omit=dev --workspaces --include-workspace-root \
    && npm cache clean --force

# ---------------------------------------------------------------------------
# Copy compiled application
# ---------------------------------------------------------------------------

COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/api/dist apps/api/dist

# Copy Prisma schema and migration files.
COPY --from=builder /repo/apps/api/prisma apps/api/prisma

# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

# npm installs dependencies as root during the Docker build.
# Prisma and the application run as the non-root "node" user.
RUN chown -R node:node \
    /repo/node_modules \
    /repo/apps \
    /repo/packages

USER node

EXPOSE 4000

# ---------------------------------------------------------------------------
# Start application
# ---------------------------------------------------------------------------

# First apply any pending Prisma migrations.
# The compiled NestJS entry file is under dist/src/main.js because the
# TypeScript project compiles both src/* and prisma/* into the dist directory.
CMD ["dumb-init", "sh", "-c", "./node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/src/main.js"]
