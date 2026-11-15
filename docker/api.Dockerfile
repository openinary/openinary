FROM node:22.23.4-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d

# Install ffmpeg for video processing, openssl for Prisma/better-auth, and jemalloc
# to avoid RSS bloat from glibc arena fragmentation under sharp/libvips and ffmpeg workloads
RUN apt-get update && apt-get install -y --no-install-recommends openssl ffmpeg sqlite3 libjemalloc2 && \
    rm -rf /var/lib/apt/lists/* && \
    ln -sf "$(dpkg -L libjemalloc2 | grep 'libjemalloc\.so\.2$')" /usr/lib/libjemalloc.so.2

# Reduce glibc malloc arena fragmentation and preload jemalloc as the allocator
ENV MALLOC_ARENA_MAX=2
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Enable Corepack to use the pnpm version specified in package.json
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

WORKDIR /app

# Copy monorepo configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
# The root manifest declares a patchedDependencies entry; pnpm reads the patch
# file even for a filtered install that never applies it.
COPY patches/ ./patches/

# The API's own workspace closure in full, every other package by manifest
# only: packages/dashboard alone carries 25 MB of demo media for the web build.
COPY packages/core/ ./packages/core/
COPY packages/shared/ ./packages/shared/
COPY packages/telemetry-schema/ ./packages/telemetry-schema/
COPY packages/cli/package.json ./packages/cli/
COPY packages/dashboard/package.json ./packages/dashboard/
COPY packages/plans/package.json ./packages/plans/
COPY packages/registry/package.json ./packages/registry/
COPY packages/ui/package.json ./packages/ui/

# Copy API
COPY apps/api/ ./apps/api/

# Copy security scripts
COPY scripts/ ./scripts/

# --frozen-lockfile compares the lockfile against every workspace project, so
# the apps this image never builds still need their manifest present.
COPY apps/web/package.json ./apps/web/
COPY apps/marketing/package.json ./apps/marketing/
COPY apps/telemetry/package.json ./apps/telemetry/
COPY apps/cloud/server/package.json ./apps/cloud/server/
COPY apps/cloud/web/package.json ./apps/cloud/web/
COPY apps/cloud/admin/package.json ./apps/cloud/admin/

# Filtered, and no `pnpm fetch` before it: fetch downloads everything the
# lockfile names, which since the monorepo merge means the Cloud apps and the
# marketing site too. This image needs the API's closure and nothing else.
RUN pnpm install --frozen-lockfile --filter api... --filter shared...

# Create necessary directories with proper ownership (only writable dirs, chown -R /app is prohibitively slow)
RUN mkdir -p apps/api/cache apps/api/temp apps/api/public /app/data && \
    chown -R node:node apps/api/cache apps/api/temp apps/api/public /app/data

# CRLF to LF, in case the checkout was made on Windows
RUN chmod +x /app/scripts/init-env-wrapper.sh && \
    sed -i 's/\r$//' /app/scripts/init-env-wrapper.sh

# "api..." builds the API after every workspace package it depends on.
RUN pnpm --filter api... build

# Bake the image version for runtime consumers (telemetry, /api/version)
# when no IMAGE_TAG env var is provided (Railway, k8s, plain docker run).
ARG IMAGE_TAG="latest"
RUN echo "${IMAGE_TAG}" > /app/version.txt

# Defaults; docker-compose or the platform overrides them. An empty
# BETTER_AUTH_SECRET makes init-env.js reuse the one persisted on the data
# volume or generate it.
ENV BETTER_AUTH_SECRET=""
ENV BETTER_AUTH_URL="http://localhost:3000"
ENV MODE="api"
ENV DB_PATH="/app/data/auth.db"

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Change to API directory for runtime
WORKDIR /app/apps/api

CMD ["/bin/sh", "-c", ". /app/scripts/init-env-wrapper.sh && node /app/scripts/secure-db.js && cd /app && pnpm --filter api start"]
