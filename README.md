# Openinary

**Modern image and video processing server with cloud storage**

Transform your media on-the-fly with a simple and powerful API. Resizing, optimized formats, smart caching, and cloud storage (AWS S3 / Cloudflare R2).

## Features

- **Images**: Resizing, cropping, rotation, modern formats (AVIF, WebP)
- **Videos**: Transformation, compression, resizing
- **Cloud Storage**: AWS S3 and Cloudflare R2 support
- **Smart caching**: Local + cloud for optimal performance
- **Monorepo**: API + Next.js Frontend in unified workspace

## Quick Start

```bash
# Clone the repository
git clone https://github.com/openinary/openinary.git
cd openinary

# Install all dependencies (apps + packages)
pnpm install

# Start development (API + Frontend)
pnpm dev
```

**Development URLs:**

- API: http://localhost:3000
- Frontend: http://localhost:3001

# Usage Examples

```bash
# Simple resizing
http://localhost:3000/t/resize:800x600/image.jpg

# With cropping and quality
http://localhost:3000/t/resize:400x400/crop:fill/quality:85/image.png

# Optimized modern format
http://localhost:3000/t/resize:1200x800/format:webp/quality:90/photo.jpg

# Change ratio with automatic focus on face
http://localhost:3000/t/ratio:1:1/gravity:face/portrait.jpg

# Compressed video
http://localhost:3000/t/resize:1280x720/quality:75/video.mp4
```

## Local Development

```bash
# Start everything
pnpm dev

# Or separately
pnpm dev:api    # API only
pnpm dev:web    # Frontend only

# Build all
pnpm build

# Lint all
pnpm lint
```

## Docker Deployment

Openinary supports two Docker deployment modes using profiles:

### Mode 1: API Standalone

Deploy only the API service. Ideal for backend-only deployments or when using a separate frontend.

```bash
# Start API only
docker compose --profile api up --build

# Run in background
docker compose --profile api up -d --build

# Stop
docker compose --profile api down
```

**Access**: API available at http://localhost:3000

### Mode 2: Full Stack with Nginx (Default)

Deploy the complete stack (API + Next.js frontend) with nginx as a reverse proxy. All traffic goes through port 3000:

- `/` → Next.js frontend
- `/api` → Hono API

```bash
# Start full stack (default mode)
docker compose up --build

# Run in background
docker compose up -d --build

# Stop
docker compose down
```

**Access**: Everything available at http://localhost:3000
- Frontend: http://localhost:3000
- API: http://localhost:3000/api

**Architecture**:
- Nginx listens on port 3000 (public entry point)
- Next.js runs in standalone mode (internal port 3001)
- API Hono runs on internal port 3002
- Nginx proxies requests to the appropriate service
- All services managed by supervisord in a single container

## Configuration

### Local Mode (default)

Place your files in `apps/api/public/`

**Production Warning**: Local mode is **NOT recommended for production** as files in the `public/` folder will be overwritten on each deployment/build. For production environments, always use cloud storage (S3 or R2).

### Cloud Mode

Openinary supports **any S3-compatible storage provider** with a universal configuration. No need to specify the provider - it's automatically detected!

Copy and configure:

```bash
cp apps/api/.env.example apps/api/.env
```

#### Universal S3 Configuration

The configuration automatically detects your provider:

* **With STORAGE_ENDPOINT**: S3-compatible provider (Cloudflare R2, Minio, DigitalOcean Spaces, Wasabi, etc.)
* **Without STORAGE_ENDPOINT**: AWS S3 standard

**AWS S3:**

```env
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=your_aws_access_key
STORAGE_SECRET_ACCESS_KEY=your_aws_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_PUBLIC_URL=https://your-bucket-name.s3.us-east-1.amazonaws.com
```

**Cloudflare R2:**

```env
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=your_r2_access_key
STORAGE_SECRET_ACCESS_KEY=your_r2_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
STORAGE_PUBLIC_URL=https://your-custom-domain.com
```

**Other S3-Compatible Providers:**

Works with **Minio**, **DigitalOcean Spaces**, **Wasabi**, **Backblaze B2**, and any other S3-compatible service:

```env
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=your_access_key
STORAGE_SECRET_ACCESS_KEY=your_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_ENDPOINT=https://your-s3-compatible-endpoint.com
STORAGE_PUBLIC_URL=https://your-cdn-domain.com
```

> **Key difference**: Set `STORAGE_ENDPOINT` for any non-AWS S3-compatible provider. For AWS S3, leave it empty.

## Project Structure

```
openinary/
├── apps/
│   ├── api/          # Media processing API
│   └── web/          # Next.js Frontend
├── packages/
│   └── shared/       # Shared types and utilities
├── docker/           # Optimized Dockerfiles
└── docker-compose.yml
```
