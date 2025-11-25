FROM node:20

# Install ffmpeg for video processing
RUN apt update && apt install -y ffmpeg sqlite3 && \
    rm -rf /var/lib/apt/lists/*

# Enable Corepack to use the pnpm version specified in package.json
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy monorepo configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy shared packages
COPY packages/ ./packages/

# Copy API
COPY apps/api/ ./apps/api/

# Copy security scripts
COPY scripts/ ./scripts/

# Install all monorepo dependencies
RUN pnpm install --frozen-lockfile

# Create necessary directories with proper ownership
RUN mkdir -p apps/api/cache apps/api/public /app/data /backup && \
    chown -R node:node /app /backup

# Build shared package first (API depends on it)
RUN pnpm --filter shared build
# Build API using workspace filter
RUN pnpm --filter api build

# Make scripts executable
RUN chmod +x scripts/secure-db.sh scripts/init-env.sh

# Set default environment variables (will be overridden by docker-compose or init-env.sh)
ENV BETTER_AUTH_SECRET=""
ENV BETTER_AUTH_URL="http://localhost:3000"

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Change to API directory for runtime
WORKDIR /app/apps/api

# Source init script to export env vars, run security script and start server
CMD ["/bin/bash", "-c", "source ../../scripts/init-env.sh && ../../scripts/secure-db.sh && pnpm start"]
