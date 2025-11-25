# Scripts

This directory contains utility scripts for Openinary.

## init-env.sh

**Purpose**: Automatically generates `BETTER_AUTH_SECRET` if not provided.

**Usage**: This script is automatically executed when Docker containers start. It checks if `BETTER_AUTH_SECRET` is set, and if not, generates a secure random secret using OpenSSL.

**How it works**:
- Sources this script in Docker CMD to export environment variables
- Generates a 32-byte hex secret if `BETTER_AUTH_SECRET` is not set
- Exports the secret to be used by API and Web services

**Manual usage** (if needed):
```bash
source scripts/init-env.sh
echo $BETTER_AUTH_SECRET
```

## secure-db.sh

**Purpose**: Ensures the SQLite auth database has proper permissions.

**Usage**: Automatically executed on Docker container startup to set correct file permissions for the auth database.

## backup-db.sh

**Purpose**: Creates backups of the SQLite auth database.

**Usage**: 
- Automatically runs daily at 2 AM via cron (in fullstack mode)
- Can be manually executed: `./scripts/backup-db.sh`

## restore-db.sh

**Purpose**: Restores the SQLite auth database from a backup.

**Usage**: 
```bash
./scripts/restore-db.sh /path/to/backup.db
```









