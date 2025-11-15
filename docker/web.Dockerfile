FROM node:20-alpine

# Install pnpm globally
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace configuration files
COPY pnpm-workspace.yaml ./
COPY package.json ./

# Copy shared packages
COPY packages/ ./packages/

# Copy frontend dependency files
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install

# Copy frontend source code
COPY apps/web/ ./apps/web/

# Build application
WORKDIR /app/apps/web
RUN pnpm build

# Expose port
EXPOSE 3001

# Default command
CMD ["pnpm", "start"]