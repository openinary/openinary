FROM node:20-alpine

# Enable Corepack to use the pnpm version specified in package.json
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace configuration files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy shared packages
COPY packages/ ./packages/

# Copy frontend dependency files
COPY apps/web/package.json ./apps/web/

# Install dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile --prod=false

# Copy frontend source code
COPY apps/web/ ./apps/web/

# Build application
WORKDIR /app/apps/web
ENV NODE_ENV=production
RUN pnpm build

# Expose port
EXPOSE 3001

# Default command
CMD ["pnpm", "start"]