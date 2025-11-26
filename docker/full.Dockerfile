# Multi-stage build for a monolithic image containing API, Web, and Nginx

# Stage 1: Build API
FROM node:20 AS api-builder
RUN apt update && apt install -y ffmpeg
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN pnpm install --frozen-lockfile
RUN mkdir -p apps/api/cache apps/api/public

# Build shared package first (API depends on it)
RUN pnpm --filter shared build
RUN pnpm --filter api build

# Stage 2: Build Web
FROM node:20 AS web-builder
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
ENV NEXT_PUBLIC_API_BASE_URL=/api
ENV BETTER_AUTH_SECRET=build-time-secret-will-be-replaced
ENV BETTER_AUTH_URL=http://localhost:3000
# Copy favicon to public directory before build so Next.js can serve it
RUN mkdir -p /app/apps/web/public && cp /app/apps/web/src/app/favicon.ico /app/apps/web/public/favicon.ico || true
RUN pnpm --filter web build

# Stage 3: Final monolithic image
FROM node:20

# Install nginx, ffmpeg, supervisor, cron and sqlite3 for process management
RUN apt update && apt install -y nginx ffmpeg supervisor cron sqlite3 && \
    rm -rf /var/lib/apt/lists/*

# Enable Corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

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

# Copy security and backup scripts
COPY scripts/ ./scripts/

# Create necessary directories with proper ownership
RUN mkdir -p /app/apps/api/cache /app/apps/api/public /app/data /app/web-standalone/data /backup /var/log/supervisor && \
    chown -R node:node /app /backup

# Make wrapper script executable
RUN chmod +x /app/scripts/init-env-wrapper.sh

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Create supervisor configuration
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Setup cron job for daily database backup (2 AM)
RUN echo "0 2 * * * node /app/scripts/backup-db.js >> /var/log/backup.log 2>&1" | crontab -u node -

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV API_PORT=3002
ENV WEB_PORT=3001
# Set default BETTER_AUTH_SECRET (will be overridden by init-env.js if needed)
ENV BETTER_AUTH_SECRET=""
ENV BETTER_AUTH_URL="http://localhost:3000"
ENV MODE="fullstack"
ENV DOCKER_CONTAINER="true"

# Run init script wrapper to set env vars, run security script before starting supervisor
CMD ["/bin/sh", "-c", ". /app/scripts/init-env-wrapper.sh && node /app/scripts/secure-db.js && /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf"]

