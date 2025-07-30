# Image & Video Server with Cloud Storage

This server allows you to process and serve images and videos with support for cloud storage (AWS S3 or Cloudflare R2).

## Features

- ✅ Image resizing (JPEG, PNG, WebP, AVIF, GIF)
- ✅ Video transformation (MP4, MOV, WebM)
- ✅ Local and cloud cache (AWS S3 / Cloudflare R2) for performance
- ✅ Optional cloud storage (recommended)

## Cloud Storage Configuration

### 1. Copy the environment file

```bash
cp .env.example .env
```

### 2. Cloud Provider Configuration

⚠️ **Important**: Choose **ONLY ONE** option from the three below:

#### Option A: Local Mode (No cloud provider)

Leave the `.env` file empty or don't define `STORAGE_PROVIDER`:

```env
# No cloud configuration = local mode only
# Files must be placed in the public/ folder
```

#### Option B: AWS S3

Edit the `.env` file:

```env
STORAGE_PROVIDER=aws
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=your_aws_access_key
STORAGE_SECRET_ACCESS_KEY=your_aws_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_PUBLIC_URL=https://your-bucket-name.s3.us-east-1.amazonaws.com
```

**AWS Steps:**
1. Create an S3 bucket in the AWS console
2. Configure public permissions if necessary
3. Create an IAM user with S3 permissions
4. Retrieve the access keys

#### Option C: Cloudflare R2

Edit the `.env` file:

```env
STORAGE_PROVIDER=cloudflare
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=your_r2_access_key
STORAGE_SECRET_ACCESS_KEY=your_r2_secret_key
STORAGE_BUCKET_NAME=your-bucket-name
STORAGE_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
STORAGE_PUBLIC_URL=https://your-custom-domain.com
```

**Cloudflare R2 Steps:**
1. Create an R2 bucket in the Cloudflare dashboard
2. Generate R2 API tokens
3. Configure a custom domain (optional)
4. Retrieve your account endpoint

## Usage

### Getting Started

```bash
pnpm install
pnpm dev
```

### URL Examples

```
# Image resizing
http://localhost:3000/cdn/resize:640x480/image.png

# Image with crop mode
http://localhost:3000/cdn/resize:800x600/crop:fit/image.jpg
http://localhost:3000/cdn/resize:800x600/crop:fill/image.jpg
http://localhost:3000/cdn/resize:800x600/crop:pad/image.jpg

# Image with crop mode and gravity/focus
http://localhost:3000/cdn/resize:800x600/crop:fill/gravity:face/image.jpg
http://localhost:3000/cdn/resize:800x600/crop:crop/gravity:north/image.jpg

# Image with crop mode and background color (for pad mode)
http://localhost:3000/cdn/resize:800x600/crop:pad/background:ff0000/image.jpg

# Image with quality (0-100)
http://localhost:3000/cdn/resize:800x600/quality:80/image.jpg

# Video transformation
http://localhost:3000/cdn/resize:1280x720/video.mp4

# Video with quality (0-100)
http://localhost:3000/cdn/resize:640x480/quality:50/video.mp4

# Parameter combination with gravity
http://localhost:3000/cdn/resize:800x600/crop:fit/gravity:face/quality:75/image.png
```

### Available Parameters

- **`resize:WIDTHxHEIGHT`**: Resizes the image or video
- **`crop:MODE`**: Image crop mode (images only)
  - **`fill`**: Resize to fill the entire area, cropping if necessary (default)
  - **`fit`**: Resize to fit within the dimensions, maintaining aspect ratio
  - **`scale`**: Scale to exact dimensions, ignoring aspect ratio
  - **`crop`**: Resize and crop to exact dimensions, maintaining aspect ratio
  - **`pad`**: Resize to fit within dimensions and pad with background color
- **`gravity:POSITION`**: Focus/gravity for cropping (images only, works with `fill` and `crop` modes)
  - **`center`**: Focus on the center of the image (default)
  - **`north`**: Focus on the top of the image
  - **`south`**: Focus on the bottom of the image
  - **`east`**: Focus on the right side of the image
  - **`west`**: Focus on the left side of the image
  - **`face`**: Automatically focus on faces or interesting features
  - **`auto`**: Automatically focus on high-contrast areas
- **`background:COLOR`**: Background color for pad mode (hex format, e.g., `ffffff` for white)
- **`quality:VALUE`**: Controls quality (0-100)
  - **Images**: JPEG quality (100 = best quality, larger file)
  - **Videos**: H.264 quality via CRF (100 = best quality, larger file)

## Cache Operation

The server uses a cache system adapted to the configured mode:

### Cloud Mode (AWS S3 or Cloudflare R2)
1. **Cloud cache**: Transformed files are stored in a `cache/` folder in your bucket
2. **Temporary local cache**: Used only during processing, deleted immediately after upload
3. **Hierarchy**: Cloud cache → On-demand processing → Upload to cloud

### Local Mode
1. **Local cache only**: Transformed files are stored in the `temp/` folder
2. **Hierarchy**: Local cache → On-demand processing

### Operating modes:

#### 🌐 Cloud Mode (Provider configured)
When a cloud provider is configured, the server uses **EXCLUSIVELY** cloud storage:
1. **Cloud cache**: First checks if the transformed file exists in the bucket's `cache/`
2. **Local cache**: If not in cloud, checks local cache
3. **Processing**: If not cached, downloads the original file from cloud, processes it and saves in both caches

⚠️ **Important**: Files in the local `public/` folder are **ignored** when a cloud provider is configured.

#### 📁 Local Mode (No provider configured)
When no cloud provider is configured:
1. **Local cache**: Checks local cache
2. **Processing**: If not cached, processes the file from the local `public/` folder

### File structure:

#### 🌐 Cloud Mode (Provider configured)
```
your-bucket/
├── cache/                   # Transformed files (automatically generated)
│   ├── a1b2c3d4.jpg         # Resized image + parameter hash
│   ├── e5f6g7h8.mp4         # Transformed video + parameter hash
│   └── ...
├── folderName/              # Your folders
│   ├── image.png            # Images
│   ├── video.mp4            # Videos
│   ├── logo.jpg             # Other files
│   └── ...
└── other-files.jpg          # Files at root
```

#### 📁 Local Mode (No provider configured)
```
media-api/
├── public/                  # ALL your original files
│   ├── image.png            # Images
│   ├── video.mp4            # Videos
│   ├── logo.jpg             # Other files
│   └── ...
├── cache/                   # Local cache (automatically generated)
│   ├── hash1234             # Transformed files
│   └── ...
└── src/                     # Source code
```

## Advantages

- **Performance**: Local cache for fast access
- **Scalability**: Cloud storage to share between instances
- **Security**: Exclusive cloud mode to avoid conflicts between sources
- **Simplicity**: Only one active mode at a time (local, Cloudflare R2 or AWS S3)
- **Flexibility**: Works with or without cloud storage

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `STORAGE_PROVIDER` | `aws` or `cloudflare` | No |
| `STORAGE_REGION` | Storage region | If provider defined |
| `STORAGE_ACCESS_KEY_ID` | Access key | If provider defined |
| `STORAGE_SECRET_ACCESS_KEY` | Secret key | If provider defined |
| `STORAGE_BUCKET_NAME` | Bucket name | If provider defined |
| `STORAGE_ENDPOINT` | Endpoint (R2 only) | For Cloudflare R2 |
| `STORAGE_PUBLIC_URL` | Public bucket URL | Optional |

## Logs

The server displays logs to indicate where files come from:
- `📦 Serving from cloud cache`: File served from cloud cache
- `💾 Serving from local cache`: File served from local cache
- `☁️ Uploaded to cloud cache`: File uploaded to cloud cache