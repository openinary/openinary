#!/usr/bin/env node
/**
 * Secure database file permissions
 * Ensures the SQLite database has proper permissions and ownership
 * 
 * Cross-platform Node.js version (works on Windows, macOS, Linux, Docker)
 */

import { chmod, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Get paths from environment or use defaults
const DB_PATH = process.env.DB_PATH || join(projectRoot, 'data', 'auth.db');
const BACKUP_PATH = process.env.BACKUP_PATH || join(projectRoot, 'backup');

const isWindows = process.platform === 'win32';

console.log('🔒 Securing database file...');

try {
  // Create data directory if it doesn't exist
  const dataDir = dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true });
    console.log(`  ✓ Created data directory: ${dataDir}`);
  }

  // Create backup directory if it doesn't exist
  if (!existsSync(BACKUP_PATH)) {
    await mkdir(BACKUP_PATH, { recursive: true });
    console.log(`  ✓ Created backup directory: ${BACKUP_PATH}`);
  }

  // If database file exists, set strict permissions
  if (existsSync(DB_PATH)) {
    console.log(`  ✓ Database file found at ${DB_PATH}`);
    
    // Get file stats
    const stats = await stat(DB_PATH);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`  ✓ Database size: ${sizeInMB} MB`);
    
    // Set permissions (Unix/Linux/macOS only)
    if (!isWindows) {
      try {
        // Set permissions to 600 (read/write for owner only)
        await chmod(DB_PATH, 0o600);
        console.log('  ✓ Permissions set to 600 (owner read/write only)');
        
        // Verify permissions
        const newStats = await stat(DB_PATH);
        const perms = (newStats.mode & 0o777).toString(8);
        console.log(`  ✓ Verified permissions: ${perms}`);
      } catch (error) {
        console.warn(`  ⚠️  Could not set permissions: ${error.message}`);
      }
    } else {
      console.log('  ℹ️  Windows detected - file permissions are managed by Windows ACL');
      console.log('  ℹ️  Ensure the database file is not accessible to other users');
    }
  } else {
    console.log('  ℹ️  Database file not yet created (will be created on first run)');
  }

  // Ensure data directory has proper permissions (Unix only)
  if (!isWindows) {
    try {
      await chmod(dirname(DB_PATH), 0o755);
      console.log('  ✓ Data directory permissions set');
    } catch (error) {
      console.warn(`  ⚠️  Could not set data directory permissions: ${error.message}`);
    }
  }

  // Ensure backup directory has proper permissions (Unix only)
  if (!isWindows) {
    try {
      await chmod(BACKUP_PATH, 0o755);
      console.log('  ✓ Backup directory permissions set');
    } catch (error) {
      console.warn(`  ⚠️  Could not set backup directory permissions: ${error.message}`);
    }
  }

  console.log('✅ Database security check complete!');
} catch (error) {
  console.error('❌ Error securing database:', error.message);
  process.exit(1);
}

