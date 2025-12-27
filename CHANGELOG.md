# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2025-12-27

### Added
- Cache invalidation endpoint (`DELETE /api/invalidate/*`) to force cache refresh after direct file replacement in S3 ([#9](https://github.com/openinary/openinary/issues/9))
- Configurable HTTP connection settings for S3 client via environment variables:
  - `STORAGE_MAX_SOCKETS`: Maximum number of concurrent sockets (default: 50)
  - `STORAGE_CONNECTION_TIMEOUT`: Connection timeout in milliseconds
  - `STORAGE_REQUEST_TIMEOUT`: Request timeout in milliseconds
  - `STORAGE_SOCKET_TIMEOUT`: Socket timeout in milliseconds
- Nginx support for cache invalidation endpoint in Docker configuration

## [0.1.2] - 2025-12-23

### Changed
- Asynchronous authentication initialization for improved performance
- Enhanced Nginx configuration for health checks

## [0.1.1] - 2025-12-23

### Added
- Security measures to restrict user sign-ups and enforce single admin account (database-level trigger)
- User existence validation in session authentication to prevent deleted users from accessing the system
- Authentication configuration validation with improved error handling and logging
- Version display components
- `/api/version` public endpoint for version information

### Changed
- Simplified CORS handling to rely solely on `BETTER_AUTH_URL` instead of `ALLOWED_ORIGIN`
- Enhanced session validation to check user existence in database before accepting sessions
- Improved baseURL handling and trusted origins configuration in auth module
- Disabled session cookie cache to force database validation on every request for security
- Enhanced error handling and logging in authentication routes and setup page

### Fixed
- Fixed loading screen issue after login by validating user existence before accepting sessions ([#6](https://github.com/openinary/openinary/issues/6))
- Fixed Error 500 on `/setup` by implementing proper sign-up restrictions and better error handling ([#8](https://github.com/openinary/openinary/issues/8))
- Fixed API path normalization for caching consistency
- Fixed thumbnail request handling to support string 'true' and '1' for parameter parsing
- Fixed video job processing by verifying cache existence and handling missing cache scenarios
- Fixed parameter normalization in job creation and retrieval to ensure consistent JSON string representation

### Security
- Implemented database-level trigger to prevent multiple user accounts (closes race condition window)
- Added sign-up blocking in Better Auth POST handler when admin account already exists
- Enhanced session security by disabling cookie cache and requiring database validation on every request

## [0.1.0] - 2025-12-20

### Added
- Initial release of Openinary (beta)
- Media transformation API for images and videos
- Video processing queue with FFmpeg
- Authentication system with Better Auth
- Web dashboard for media management
- API key management
- S3-compatible storage support
- Local filesystem storage support
- Docker support with multiple profiles (api, full)
- Automatic video transcoding and optimization
- Image transformation (resize, crop, quality, format, rotation)
- Video transformation (resize, trim, quality, format, thumbnails)
- RESTful API endpoints
- Real-time queue status monitoring

### Security
- Secure database access controls
- API key authentication
- Environment-based configuration

### Note
This is a pre-release version (0.x.x). Breaking changes may occur between minor versions until v1.0.0 is reached.