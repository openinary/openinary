# Monolithic Docker Setup

## Overview

The monolithic deployment creates a **single container** that includes:
- **API** (Hono backend running on internal port 3002)
- **Web** (Next.js frontend running on internal port 3001)  
- **Nginx** (Reverse proxy listening on port 3000)

All three services run in one container, managed by **supervisord**.

## Architecture

```
Port 3000 (external)
        ↓
    [Nginx]
        ↓
    ┌───┴──────┐
    ↓          ↓
[API:3002]  [Web:3001]
```

## How It Works

1. **Single Container**: Everything runs in one Docker image
2. **Process Management**: Supervisord manages all three processes (api, web, nginx)
3. **Routing**: 
   - `/api/*` → proxied to API service on port 3002
   - `/storage`, `/upload`, `/t` → proxied to API service on port 3002
   - `/*` → proxied to Web service on port 3001
4. **Auto-restart**: If any service crashes, supervisord automatically restarts it

## Build & Run

```bash
# Build and start the monolithic container (default mode)
docker compose up --build

# Run in detached mode
docker compose up -d --build

# Stop the container
docker compose down
```

## Access

Once running, access the application at:
- **http://localhost:3000** - Main application (Next.js frontend)
- **http://localhost:3000/api** - API endpoints

## Environment Variables

Optional: Create `apps/api/.env` for API configuration (e.g., S3 credentials, storage settings)

## Logs

View all service logs (API + Web + Nginx):
```bash
docker compose logs -f
```

## Benefits of Monolithic Setup

✅ Single image to deploy  
✅ Simpler orchestration  
✅ Lower resource overhead  
✅ Easier for simple deployments  
✅ Single port to expose (3000)

## API-Only Mode

If you only need the API without the frontend, use the `api` profile:

```bash
# Start API only
docker compose --profile api up --build

# Run in background
docker compose --profile api up -d --build

# Stop
docker compose --profile api down
```

**Access**: API available at http://localhost:3000


