# Multi-stage build for a monolithic image containing API, Web, and Nginx

# Stage 1: Build API
FROM node:22.23.4-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS api-builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ffmpeg && \
    rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The root manifest declares a patchedDependencies entry; pnpm reads the patch
# file even for a filtered install that never applies it.
COPY patches/ ./patches/

# The API's own workspace closure in full, every other package by manifest
# only: packages/dashboard alone carries 25 MB of demo media for the web stage below.
COPY packages/core/ ./packages/core/
COPY packages/shared/ ./packages/shared/
COPY packages/telemetry-schema/ ./packages/telemetry-schema/
COPY packages/cli/package.json ./packages/cli/
COPY packages/dashboard/package.json ./packages/dashboard/
COPY packages/plans/package.json ./packages/plans/
COPY packages/registry/package.json ./packages/registry/
COPY packages/ui/package.json ./packages/ui/
COPY scripts/ ./scripts/
COPY apps/api/ ./apps/api/
COPY apps/web/package.json ./apps/web/
# --frozen-lockfile compares the lockfile against every workspace project, so
# the apps this stage never builds still need their manifest present.
COPY apps/marketing/package.json ./apps/marketing/
COPY apps/telemetry/package.json ./apps/telemetry/
COPY apps/cloud/server/package.json ./apps/cloud/server/
COPY apps/cloud/web/package.json ./apps/cloud/web/
COPY apps/cloud/admin/package.json ./apps/cloud/admin/

# Install only the workspace dependencies needed for shared + api (dev + prod)
# for build. No `pnpm fetch` first: it downloads everything the lockfile names,
# which since the monorepo merge means the Cloud apps and the marketing site.
RUN pnpm install --filter shared... --filter api... --frozen-lockfile
RUN mkdir -p apps/api/cache apps/api/public

# "api..." builds the API after every workspace package it depends on.
RUN pnpm --filter api... build

# Prune devDependencies pour ne garder que les deps de production
RUN pnpm prune --prod

# Stage 2: Build Web
FROM node:22.23.4-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS web-builder
ARG NEXT_PUBLIC_API_BASE_URL="/api"
ARG IMAGE_TAG="latest"
RUN apt-get update && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY patches/ ./patches/

COPY packages/ ./packages/
COPY scripts/ ./scripts/
COPY apps/web/ ./apps/web/
COPY apps/api/package.json ./apps/api/
# --frozen-lockfile compares the lockfile against every workspace project, so
# the apps this stage never builds still need their manifest present.
COPY apps/marketing/package.json ./apps/marketing/
COPY apps/telemetry/package.json ./apps/telemetry/
COPY apps/cloud/server/package.json ./apps/cloud/server/
COPY apps/cloud/web/package.json ./apps/cloud/web/
COPY apps/cloud/admin/package.json ./apps/cloud/admin/

# Filtered for the same reason as the API stage above.
RUN pnpm install --filter web... --frozen-lockfile --prod=false

# "web^..." builds every workspace package web depends on; web itself
# builds below, once its env is set.
RUN pnpm --filter "web^..." build

ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN mkdir -p /app/apps/web/public && cp /app/apps/web/src/app/favicon.ico /app/apps/web/public/favicon.ico
RUN pnpm --filter web build

# Stage 3: Final monolithic image
FROM node:22.23.4-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
# Runtime args only - will be overridden by docker-compose environment
ARG NEXT_PUBLIC_API_BASE_URL="/api"
ARG IMAGE_TAG="latest"

# Install nginx, ffmpeg, supervisor, cron, sqlite3 and jemalloc for process management
# jemalloc replaces glibc malloc to avoid RSS bloat from arena fragmentation under
# sharp/libvips and ffmpeg workloads (freed memory not returned to the OS)
RUN apt-get update && apt-get install -y --no-install-recommends nginx ffmpeg supervisor cron sqlite3 libjemalloc2 && \
    rm -rf /var/lib/apt/lists/* && \
    ln -sf "$(dpkg -L libjemalloc2 | grep 'libjemalloc\.so\.2$')" /usr/lib/libjemalloc.so.2

# Reduce glibc malloc arena fragmentation and preload jemalloc as the allocator for
# all supervised processes (api, web)
ENV MALLOC_ARENA_MAX=2
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

WORKDIR /app

# Copy API built files
COPY --from=api-builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=api-builder /app/packages ./packages/
COPY --from=api-builder /app/apps/api ./apps/api/
COPY --from=api-builder /app/node_modules ./node_modules/

# Copy Web built files (standalone mode)
COPY --from=web-builder /app/apps/web/.next/standalone /app/web-standalone
COPY --from=web-builder /app/apps/web/.next/static /app/web-standalone/apps/web/.next/static
COPY --from=web-builder /app/apps/web/public /app/web-standalone/apps/web/public

# Copy security scripts
COPY scripts/ ./scripts/

# Write version file at build time (ARG is available here)
RUN echo "${IMAGE_TAG}" > /app/version.txt && \
    echo "Build-time IMAGE_TAG: ${IMAGE_TAG}" && \
    cat /app/version.txt

# Create necessary directories with proper ownership (ciblé uniquement sur les répertoires d'écriture)
RUN mkdir -p /app/apps/api/cache /app/apps/api/public /app/data /app/web-standalone/data /var/log/supervisor && \
    chown -R node:node /app/apps/api/cache /app/apps/api/public /app/data /app/web-standalone/data

# CRLF to LF, in case the checkout was made on Windows
RUN chmod +x /app/scripts/init-env-wrapper.sh && \
    sed -i 's/\r$//' /app/scripts/init-env-wrapper.sh

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Create supervisor configuration
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port
EXPOSE 3000

ENV NODE_ENV=production
# With an empty BETTER_AUTH_SECRET, init-env.js reuses the one persisted on
# the data volume or generates it.
ENV BETTER_AUTH_SECRET=""
# BETTER_AUTH_URL is left to runtime so the same image deploys anywhere.
ENV NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL}"
ENV MODE="fullstack"
ENV DB_PATH="/app/data/auth.db"

# The wrapper is sourced so the secret it settles on reaches supervisord.
CMD ["/bin/sh", "-c", ". /app/scripts/init-env-wrapper.sh && cd /app && node scripts/secure-db.js && exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf"]

