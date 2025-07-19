# Openinary API

Cloudflare Workers-based API for media storage and serving using R2.

## Configuration

### Environment Variables

The API uses the following environment variables:

- `BUCKET_NAME`: Name of the R2 bucket for storage
- `R2_PUBLIC_URL`: Public URL of the R2 bucket for direct file access

### R2 Public Access Setup

To serve files directly from R2, you need to enable public access on your bucket:

1. Go to Cloudflare Dashboard > R2 Object Storage
2. Select your bucket (`openinary-storage`)
3. Go to Settings > Public Access
4. Click "Allow Access" and copy the public URL
5. Update the `R2_PUBLIC_URL` variable with this URL

Example R2 public URL: `https://pub-61c0fc12088d4e539900f2a710489df0.r2.dev`

### Development

For local development, files are served directly from the same R2 bucket as production:

```toml
[vars]
BUCKET_NAME = "openinary-storage"
PUBLIC_URL = "http://localhost:8787"
R2_PUBLIC_URL = "https://pub-61c0fc12088d4e539900f2a710489df0.r2.dev"
```

```bash
npm run dev
```

### Production Deployment

Update both URLs in `wrangler.toml` for your production environment:

```toml
[env.production.vars]
BUCKET_NAME = "openinary-storage"
R2_PUBLIC_URL = "https://pub-61c0fc12088d4e539900f2a710489df0.r2.dev"
```

### Staging Deployment

```toml
[env.staging.vars]
BUCKET_NAME = "openinary-storage"
R2_PUBLIC_URL = "https://pub-61c0fc12088d4e539900f2a710489df0.r2.dev"
```

## API Endpoints

### GET /files

Returns a list of all files with their public URLs:

```json
{
  "bucket": "openinary-storage",
  "files": [
    {
      "key": "1752609738139-image.jpg",
      "size": 29464,
      "etag": "d62b27f5e1b00acd3da65a694441d918",
      "uploaded": "2025-07-15T20:02:18.141Z",
      "url": "https://pub-61c0fc12088d4e539900f2a710489df0.r2.dev/1752609738139-image.jpg",
      "customMetadata": {
        "originalName": "image.jpg",
        "mediaType": "image",
        "originalDimensions": "512x512"
      }
    }
  ],
  "truncated": false
}
```

### GET /files/:key

Serves the actual file content with appropriate headers.

### POST /upload

Upload a new file to the storage.

### DELETE /files/:key

Delete a file from storage.

## URL Generation

File URLs are generated using the `R2_PUBLIC_URL` environment variable, pointing directly to Cloudflare R2's public URL across all environments:

- URLs format: `https://pub-61c0fc12088d4e539900f2a710489df0.r2.dev/{filename}`
- Files are served directly from R2, providing:
  - **Direct access**: No API processing overhead
  - **Better performance**: Reduced latency and bandwidth usage
  - **CDN benefits**: Automatic caching and global distribution via Cloudflare's network
  - **Cost efficiency**: Lower compute costs
  - **Consistency**: Same behavior across development, staging, and production

**Important**: You must enable public access on your R2 bucket for the URLs to work. See the "R2 Public Access Setup" section above.
