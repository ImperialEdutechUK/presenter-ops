# ---------------------------------------------------------------------------
# PresenterOps API container
# ---------------------------------------------------------------------------

FROM node:20-bookworm-slim AS builder

WORKDIR /repo

# Prisma requires OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests.
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Prisma schema must exist before npm ci because the API workspace
# runs prisma generate during postinstall.
COPY apps/api/prisma apps/api/prisma

RUN npm ci --workspaces --include-workspace-root

# Build shared package.
COPY packages/shared packages/shared
RUN npm run build --workspace @presenter-ops/shared

# Build API.
COPY apps/api apps/api

RUN ./node_modules/.bin/prisma generate \
    --schema apps/api/prisma/schema.prisma

RUN npm run build --workspace @presenter-ops/api


# ---------------------------------------------------------------------------
# Runtime image
# ---------------------------------------------------------------------------

FROM node:20-bookworm-slim AS runtime

WORKDIR /repo

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       openssl \
       ca-certificates \
       dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Required by Prisma postinstall and migrate deploy.
COPY apps/api/prisma apps/api/prisma

RUN npm ci --omit=dev --workspaces --include-workspace-root \
    && npm cache clean --force

# Compiled application.
COPY --from=builder /repo/packages/shared/dist packages/shared/dist
COPY --from=builder /repo/apps/api/dist apps/api/dist

# Migration files/schema.
COPY --from=builder /repo/apps/api/prisma apps/api/prisma

# Allow the non-root application user to access Prisma's generated engines.
RUN chown -R node:node /repo/node_modules \
    /repo/apps \
    /repo/packages

USER node

EXPOSE 4000

CMD [
  "dumb-init",
  "sh",
  "-c",
  "./node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"
]
