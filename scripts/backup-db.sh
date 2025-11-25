#!/bin/bash
# Database backup script
# Creates timestamped backups of the SQLite database with rotation

set -e

DB_PATH="${DB_PATH:-/app/data/auth.db}"
BACKUP_DIR="${BACKUP_PATH:-/backup}"
MAX_BACKUPS="${MAX_BACKUPS:-30}"
COMPRESS="${COMPRESS_BACKUPS:-true}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "⚠️  Database file not found at $DB_PATH, skipping backup"
    exit 0
fi

# Generate timestamp for backup filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="auth_backup_${TIMESTAMP}.db"
BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME"

echo "📦 Starting database backup..."
echo "  Source: $DB_PATH"
echo "  Destination: $BACKUP_FILE"

# Create backup using SQLite .backup command
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [ -f "$BACKUP_FILE" ]; then
    echo "  ✓ Backup created successfully"
    
    # Get file size
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "  ✓ Backup size: $SIZE"
    
    # Compress backup if enabled
    if [ "$COMPRESS" = "true" ]; then
        echo "  🗜️  Compressing backup..."
        gzip "$BACKUP_FILE"
        BACKUP_FILE="${BACKUP_FILE}.gz"
        COMPRESSED_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo "  ✓ Compressed size: $COMPRESSED_SIZE"
    fi
    
    # Rotate old backups (keep only MAX_BACKUPS most recent)
    echo "  🔄 Rotating old backups (keeping last $MAX_BACKUPS)..."
    
    # Count backup files
    if [ "$COMPRESS" = "true" ]; then
        BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/auth_backup_*.db.gz 2>/dev/null | wc -l | tr -d ' ')
    else
        BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/auth_backup_*.db 2>/dev/null | wc -l | tr -d ' ')
    fi
    
    echo "  ℹ️  Total backups: $BACKUP_COUNT"
    
    # Remove old backups if we exceed MAX_BACKUPS
    if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
        REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
        echo "  🗑️  Removing $REMOVE_COUNT old backup(s)..."
        
        if [ "$COMPRESS" = "true" ]; then
            ls -1t "$BACKUP_DIR"/auth_backup_*.db.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
        else
            ls -1t "$BACKUP_DIR"/auth_backup_*.db | tail -n "$REMOVE_COUNT" | xargs rm -f
        fi
        
        echo "  ✓ Old backups removed"
    fi
    
    echo "✅ Backup completed successfully!"
    echo "  Backup file: $BACKUP_FILE"
else
    echo "❌ Backup failed!"
    exit 1
fi




