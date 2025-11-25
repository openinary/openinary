#!/bin/bash
# Secure database file permissions
# This script ensures the SQLite database has proper permissions and ownership

set -e

DB_PATH="${DB_PATH:-/app/data/auth.db}"
BACKUP_PATH="${BACKUP_PATH:-/backup}"

echo "🔒 Securing database file..."

# Create data directory if it doesn't exist
mkdir -p "$(dirname "$DB_PATH")"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_PATH"

# If database file exists, set strict permissions
if [ -f "$DB_PATH" ]; then
    echo "  ✓ Database file found at $DB_PATH"
    
    # Set permissions to 600 (read/write for owner only)
    chmod 600 "$DB_PATH"
    echo "  ✓ Permissions set to 600 (owner read/write only)"
    
    # Get current file permissions for verification
    PERMS=$(stat -c "%a" "$DB_PATH" 2>/dev/null || stat -f "%A" "$DB_PATH" 2>/dev/null || echo "unknown")
    echo "  ✓ Verified permissions: $PERMS"
    
    # Get file size
    SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "  ✓ Database size: $SIZE"
else
    echo "  ℹ Database file not yet created (will be created on first run)"
fi

# Ensure data directory has proper permissions
chmod 755 "$(dirname "$DB_PATH")"
echo "  ✓ Data directory permissions set"

# Ensure backup directory has proper permissions
chmod 755 "$BACKUP_PATH"
echo "  ✓ Backup directory permissions set"

echo "✅ Database security check complete!"




