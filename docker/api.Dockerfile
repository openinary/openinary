FROM node:20-slim

# Install ffmpeg for video processing
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg sqlite3 && \
    rm -rf /var/lib/apt/lists/*

# Enable Corepack to use the pnpm version specified in package.json
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy monorepo configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy shared packages
COPY packages/ ./packages/

# Copy API
COPY apps/api/ ./apps/api/

# Copy security scripts
COPY scripts/ ./scripts/

# Install all monorepo dependencies
RUN pnpm install --frozen-lockfile

# Create necessary directories with proper ownership
RUN mkdir -p apps/api/cache apps/api/public /app/data && \
    chown -R node:node /app

# Make wrapper script executable and fix line endings (CRLF to LF)
RUN chmod +x /app/scripts/init-env-wrapper.sh && \
    sed -i 's/\r$//' /app/scripts/init-env-wrapper.sh || true

# Build shared package first (API depends on it)
RUN pnpm --filter shared build
# Build API using workspace filter
RUN pnpm --filter api build

# Set default environment variables (will be overridden by docker-compose or init-env.js)
ENV BETTER_AUTH_SECRET=""
ENV BETTER_AUTH_URL="http://localhost:3000"
ENV DOCKER_CONTAINER="true"
ENV MODE="api"

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Change to API directory for runtime
WORKDIR /app/apps/api

# Run init script wrapper to set env vars, run security script and start server
# Run from /app root so turbo can find turbo.json, then use pnpm filter to start only the API
CMD ["/bin/sh", "-c", ". /app/scripts/init-env-wrapper.sh && node /app/scripts/secure-db.js && cd /app && pnpm --filter api start"]
