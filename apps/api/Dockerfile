# ---------------------------------------------------------------------------
# PresenterOps API container
# ---------------------------------------------------------------------------

FROM node:20-bookworm-slim AS builder

WORKDIR /repo

# Prisma requires OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Install workspace dependencies
# ---------------------------------------------------------------------------

# Copy workspace manifests first so Docker can cache dependency installation.
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Prisma schema must exist before npm ci because the API package has a
# postinstall script that runs "prisma generate".
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
# Runtime image
# ===========================================================================

FROM node:20-bookworm-slim AS runtime

WORKDIR /repo

ENV NODE_ENV=production

# OpenSSL is required by Prisma.
# dumb-init handles container signals correctly.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates \
        dumb-init \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Install production dependencies
# ---------------------------------------------------------------------------

COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Prisma needs the schema during npm install because postinstall runs
# "prisma generate".
COPY apps/api/prisma apps/api/prisma

RUN npm ci --omit=dev --workspaces --include-workspace-root \
    && npm cache clean --force

# ---------------------------------------------------------------------------
# Copy built application
# ---------------------------------------------------------------------------

COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/api/dist apps/api/dist

# Copy Prisma schema and migrations.
COPY --from=builder /repo/apps/api/prisma apps/api/prisma

# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

# Dependencies were installed as root. Give the node user access so Prisma
# can use its generated engines when the container starts.
RUN chown -R node:node /repo/node_modules \
    /repo/apps \
    /repo/packages

USER node

EXPOSE 4000

# ---------------------------------------------------------------------------
# Start
# ---------------------------------------------------------------------------

# Apply any pending Prisma migrations, then start the NestJS API.
CMD ["dumb-init", "sh", "-c", "./node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
