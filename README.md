<p align="center">
    <a href="https://openinary.dev" target="_blank" rel="noopener">
        <img src="https://i.imgur.com/P5Qfm65.png" alt="Openinary - self-hosted media processing platform" />
    </a>
</p>

<p align="center">
    <a href="https://github.com/openinary/openinary/actions/workflows/basebuild.yml" target="_blank" rel="noopener"><img src="https://github.com/openinary/openinary/actions/workflows/basebuild.yml/badge.svg" alt="build" /></a>
    <a href="https://hub.docker.com/r/openinary/openinary" target="_blank" rel="noopener"><img src="https://img.shields.io/docker/pulls/openinary/openinary.svg" alt="Docker pulls" /></a>
    <a href="https://github.com/openinary/openinary/blob/main/LICENSE" target="_blank" rel="noopener"><img src="https://img.shields.io/github/license/openinary/openinary.svg" alt="license" /></a>
</p>

[Openinary](https://github.com/openinary/openinary) is an open-source, self-hosted media processing platform that includes:

- on-the-fly transformations for images and videos via URL
- built-in S3-compatible storage with automatic caching
- smart optimization with WebP, AVIF, and modern codecs
- simple REST API with URL-based transformations
- convenient admin dashboard for asset management

**For documentation and more examples, please visit https://docs.openinary.dev.**

> [!WARNING]
> Please keep in mind that Openinary is still under active development
> and therefore full backward compatibility is not guaranteed before reaching v1.0.0.

## Quick Start

<p align="left">
    <a href="https://docs.openinary.dev/guides/coolify-deployment" target="_blank" rel="noopener" style="display: inline-block;"><img src="https://www.openinary.dev/deploy-coolify.svg" alt="Deploy with Coolify" style="display: block;" /></a>&nbsp;&nbsp;&nbsp;<a href="https://docs.openinary.dev/guides/dokploy-deployment" target="_blank" rel="noopener" style="display: inline-block;"><img src="https://www.openinary.dev/deploy-dokploy.svg" alt="Deploy with Dokploy" style="display: block;" /></a>
</p>

### Installation

Make sure to have Docker 20.x+ installed and running.

```bash
docker run --platform linux/amd64 -d -p 3000:3000 \
  -v openinary-cache:/app/apps/api/cache \
  -v openinary-public:/app/apps/api/public \
  -v openinary-db:/app/data \
  openinary/openinary:latest
```

### Initial Setup

1. Open http://localhost:3000
2. Visit `/setup` to create admin account
3. Click on your profile in the bottom left navigation, then go to 'API Keys' to generate your first API key

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
# Thumbnail with resize
GET /t/w_800,h_450,so_5,f_avif/video.mp4

# Web optimized compression
GET /t/w_1280,h_720,q_75/video.mp4

# Extract a clip (from 10s to 30s)
GET /t/so_10,eo_30/interview.mp4

# Lightweight preview (low quality, small size)
GET /t/w_480,h_270,q_50/demo.mp4

# Format conversion with resize
GET /t/w_1920,h_1080,f_mp4/video.mov
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

## Resources

[Full Documentation](https://docs.openinary.dev) | [Issues](https://github.com/openinary/openinary/issues) | [Contact](https://x.com/initflorian)

## License
This project is licensed under the  AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.