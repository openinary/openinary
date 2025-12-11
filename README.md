# Openinary

Open-source, self-hostable alternative to Cloudinary for image and video processing with on-the-fly transformations.

![Openinary Demo](demo.gif)

## What is Openinary?

Openinary is an open-source media processing platform that gives you complete control over your assets. Transform, optimize, and serve your images and videos through a simple API, without depending on proprietary services.

**Why Openinary?**
- **Open-source**: Transparent and modifiable code
- **Self-hosted**: Deploy on your infrastructure
- **No vendor lock-in**: Your data, your rules
- **Performance**: Built-in cache and automatic optimizations

## Features

- **On-the-fly transformations**: Resize, crop, and rotate images and videos via URL
- **Intelligent optimization**: Automatic conversion to WebP, AVIF, and modern video codecs
- **Built-in cache**: Ultra-fast delivery with automatic caching system
- **S3-compatible storage**: Native support for AWS S3, Cloudflare R2, Minio, DigitalOcean Spaces
- **Simple API**: Transformations via URL parameters, API key authentication

## Quick Start

### Prerequisites
- Docker 20.x+

### Installation

```bash
docker run --platform linux/amd64 -d -p 3000:3000 \
  -v openinary-cache:/app/apps/api/cache \
  -v openinary-public:/app/apps/api/public \
  -v openinary-db:/app/data \
  openinary/openinary:latest
```

### Initial Setup

**Full mode:**
1. Open http://localhost:3000
2. Visit `/setup` to create admin account
3. Go to `/api-keys` to generate an API key

## Usage Examples

### Images

```bash
# Simple resize
GET /t/w_800,h_600/image.jpg

# Smart cropping with face detection
GET /t/w_400,h_400,c_fill,g_face/portrait.jpg

# Format conversion + optimization
GET /t/w_1200,h_800,f_avif,q_80/photo.jpg

# Aspect ratio with automatic detection
GET /t/ar_16:9,g_auto,w_1920,h_1080/banner.jpg
```

### Videos

```bash
# HD optimization
GET /t/w_1280,h_720,q_80/video.mp4

# Low resolution preview
GET /t/w_640,h_360,q_60/preview.mp4

# Full HD high quality
GET /t/w_1920,h_1080,q_90/movie.mp4
```

### Authentication

The transformation endpoint (`/t/*`) is **public** and does not require authentication, making it easy to serve transformed assets directly:

```bash
# No authentication required for transformations
curl "http://localhost:3000/t/w_800,h_600/image.jpg"
```

Other endpoints (upload, storage management) require an API key:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/upload"
```

## S3-Compatible Configuration

Openinary supports any S3-compatible storage. Configure via environment variables in `apps/api/.env`:

### AWS S3

```bash
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=your_aws_access_key
STORAGE_SECRET_ACCESS_KEY=your_aws_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_PUBLIC_URL=https://your-bucket-name.s3.us-east-1.amazonaws.com
```

### Cloudflare R2

```bash
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=your_r2_access_key
STORAGE_SECRET_ACCESS_KEY=your_r2_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
STORAGE_PUBLIC_URL=https://your-custom-domain.com
```

### Other S3-Compatible Providers

```bash
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=your_access_key
STORAGE_SECRET_ACCESS_KEY=your_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_ENDPOINT=https://your-s3-compatible-endpoint.com
STORAGE_PUBLIC_URL=https://your-cdn-domain.com
```

**Note:** The presence of `STORAGE_ENDPOINT` automatically enables S3-compatible mode. Without endpoint, it's standard AWS S3.

## Resources

[Full Documentation](https://docs.openinary.dev) | [Issues](https://github.com/openinary/openinary/issues) | [Contact](https://x.com/initflorian)

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.