FROM node:20

# Install ffmpeg for video processing
RUN apt update && apt install -y ffmpeg

# Install pnpm globally
RUN npm install -g pnpm

WORKDIR /app

# Copy monorepo configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy shared packages
COPY packages/ ./packages/

# Copy API
COPY apps/api/ ./apps/api/

# Install all monorepo dependencies
RUN pnpm install --frozen-lockfile

# Create necessary directories
RUN mkdir -p apps/api/cache apps/api/public

# Change to API directory
WORKDIR /app/apps/api

# Build API
RUN pnpm build

# Expose port
EXPOSE 3000

# Default command for production
CMD ["pnpm", "start"]
