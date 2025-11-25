#!/bin/bash
# Database restore script
# Restores database from a backup file

set -e

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "❌ Error: No backup file specified"
    echo ""
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    BACKUP_DIR="${BACKUP_PATH:-/backup}"
    
    if [ -d "$BACKUP_DIR" ]; then
        ls -lht "$BACKUP_DIR"/auth_backup_* 2>/dev/null || echo "  No backups found"
    else
        echo "  Backup directory not found: $BACKUP_DIR"
    fi
    
    exit 1
fi

BACKUP_FILE="$1"
DB_PATH="${DB_PATH:-/app/data/auth.db}"
DB_BACKUP_BEFORE_RESTORE="${DB_PATH}.before-restore-$(date +%Y%m%d_%H%M%S)"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "🔄 Database Restore"
echo "  Backup file: $BACKUP_FILE"
echo "  Target database: $DB_PATH"
echo ""

# Check if file is compressed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "  📦 Backup is compressed, decompressing..."
    TEMP_BACKUP="${BACKUP_FILE%.gz}"
    gunzip -c "$BACKUP_FILE" > "$TEMP_BACKUP"
    BACKUP_TO_RESTORE="$TEMP_BACKUP"
    echo "  ✓ Decompressed to temporary file"
else
    BACKUP_TO_RESTORE="$BACKUP_FILE"
fi

# Backup current database before restoring
if [ -f "$DB_PATH" ]; then
    echo "  💾 Backing up current database before restore..."
    cp "$DB_PATH" "$DB_BACKUP_BEFORE_RESTORE"
    echo "  ✓ Current database backed up to: $DB_BACKUP_BEFORE_RESTORE"
fi

# Verify backup file is a valid SQLite database
echo "  🔍 Verifying backup file integrity..."
if sqlite3 "$BACKUP_TO_RESTORE" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "  ✓ Backup file is valid"
else
    echo "  ❌ Backup file is corrupted or invalid!"
    
    # Clean up temporary file if created
    if [ "$BACKUP_TO_RESTORE" != "$BACKUP_FILE" ]; then
        rm -f "$BACKUP_TO_RESTORE"
    fi
    
    exit 1
fi

# Perform restore
echo "  📥 Restoring database..."
cp "$BACKUP_TO_RESTORE" "$DB_PATH"

# Set proper permissions
chmod 600 "$DB_PATH"

# Verify restored database
echo "  🔍 Verifying restored database..."
if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "  ✓ Restored database is valid"
    
    # Clean up temporary decompressed file if created
    if [ "$BACKUP_TO_RESTORE" != "$BACKUP_FILE" ]; then
        rm -f "$BACKUP_TO_RESTORE"
    fi
    
    echo ""
    echo "✅ Database restored successfully!"
    echo ""
    echo "  Restored from: $BACKUP_FILE"
    echo "  Previous database saved as: $DB_BACKUP_BEFORE_RESTORE"
    echo ""
    echo "⚠️  Note: You may need to restart your application for changes to take effect."
else
    echo "  ❌ Restored database is corrupted!"
    
    # Restore the backup we made
    if [ -f "$DB_BACKUP_BEFORE_RESTORE" ]; then
        echo "  🔄 Restoring previous database..."
        cp "$DB_BACKUP_BEFORE_RESTORE" "$DB_PATH"
        echo "  ✓ Previous database restored"
    fi
    
    # Clean up temporary file if created
    if [ "$BACKUP_TO_RESTORE" != "$BACKUP_FILE" ]; then
        rm -f "$BACKUP_TO_RESTORE"
    fi
    
    exit 1
fi




