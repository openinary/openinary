# Multi-stage build for a monolithic image containing API, Web, and Nginx

# Stage 1: Build API
FROM node:20-slim AS api-builder
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Install only the workspace dependencies needed for shared + api (dev + prod) for build
RUN pnpm install --filter shared... --filter api... --frozen-lockfile
RUN mkdir -p apps/api/cache apps/api/public

# Build shared package first (API depends on it)
RUN pnpm --filter shared build
RUN pnpm --filter api build

# Prune devDependencies pour ne garder que les deps de production
RUN pnpm prune --prod

# Stage 2: Build Web
FROM node:20-slim AS web-builder
ARG NEXT_PUBLIC_API_BASE_URL="/api"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

RUN pnpm install --frozen-lockfile --prod=false

# Create data directory for auth database (needed during build)
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV BETTER_AUTH_SECRET=build-time-secret-will-be-replaced
# BETTER_AUTH_URL and ALLOWED_ORIGIN are runtime-only (set via docker-compose)
# Copy favicon to public directory before build so Next.js can serve it
RUN mkdir -p /app/apps/web/public && cp /app/apps/web/src/app/favicon.ico /app/apps/web/public/favicon.ico || true
RUN pnpm --filter web build

# Stage 3: Final monolithic image
FROM node:20-slim
# Runtime args only - will be overridden by docker-compose environment
ARG NEXT_PUBLIC_API_BASE_URL="/api"

# Install nginx, ffmpeg, supervisor, cron and sqlite3 for process management
RUN apt-get update && apt-get install -y --no-install-recommends nginx ffmpeg supervisor cron sqlite3 && \
    rm -rf /var/lib/apt/lists/*

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

# Create necessary directories with proper ownership (ciblé uniquement sur les répertoires d'écriture)
RUN mkdir -p /app/apps/api/cache /app/apps/api/public /app/data /app/web-standalone/data /var/log/supervisor && \
    chown -R node:node /app/apps/api/cache /app/apps/api/public /app/data /app/web-standalone/data

# Make wrapper script executable and fix line endings (CRLF to LF)
RUN chmod +x /app/scripts/init-env-wrapper.sh && \
    sed -i 's/\r$//' /app/scripts/init-env-wrapper.sh || true

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Create supervisor configuration
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV API_PORT=3002
ENV WEB_PORT=3001
# Set default BETTER_AUTH_SECRET (will be overridden by init-env.js if needed)
ENV BETTER_AUTH_SECRET=""
# BETTER_AUTH_URL and ALLOWED_ORIGIN must be provided at runtime via docker-compose
# They are not set at build time to allow the same image to be deployed anywhere
ENV NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL}"
ENV MODE="fullstack"
ENV DOCKER_CONTAINER="true"

# Run init script wrapper to set env vars, run security script before starting supervisor
# Source the wrapper script to export env vars, then run secure-db and start supervisor
CMD ["/bin/sh", "-c", ". /app/scripts/init-env-wrapper.sh && cd /app && node scripts/secure-db.js && exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf"]

