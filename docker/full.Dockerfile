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

WORKDIR /app/apps/api
RUN pnpm build

# Stage 2: Build Web
FROM node:20-alpine AS web-builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --prod=false

COPY apps/web/ ./apps/web/
WORKDIR /app/apps/web
ENV NODE_ENV=production
RUN pnpm build

# Stage 3: Final monolithic image
FROM node:20

# Install nginx, ffmpeg, and supervisor for process management
RUN apt update && apt install -y nginx ffmpeg supervisor && \
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

# Create necessary directories
RUN mkdir -p /app/apps/api/cache /app/apps/api/public

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Create supervisor configuration
RUN mkdir -p /var/log/supervisor
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV API_PORT=3002
ENV WEB_PORT=3001

# Start supervisor to manage all processes
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

