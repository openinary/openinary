#!/usr/bin/env node
/**
 * Database restore script
 * Restores database from a backup file
 * 
 * Cross-platform Node.js version (works on Windows, macOS, Linux, Docker)
 */

import Database from 'better-sqlite3';
import { existsSync, readdir, stat, copyFile, unlink } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const gunzipAsync = promisify(gunzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function listBackups() {
  const BACKUP_DIR = process.env.BACKUP_PATH || join(projectRoot, 'backup');
  
  try {
    if (existsSync(BACKUP_DIR)) {
      const files = await readdir(BACKUP_DIR);
      const backupFiles = files
        .filter(f => f.startsWith('auth_backup_'))
        .map(f => join(BACKUP_DIR, f));
      
      if (backupFiles.length === 0) {
        console.log('  No backups found');
      } else {
        // Get file stats and sort by modification time (newest first)
        const filesWithStats = await Promise.all(
          backupFiles.map(async (f) => {
            const stats = await stat(f);
            const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
            return {
              path: f,
              name: basename(f),
              size: sizeInMB,
              mtime: stats.mtime
            };
          })
        );
        
        filesWithStats.sort((a, b) => b.mtime - a.mtime);
        
        for (const file of filesWithStats) {
          console.log(`  ${file.name} (${file.size} MB, ${file.mtime.toISOString()})`);
        }
      }
    } else {
      console.log(`  Backup directory not found: ${BACKUP_DIR}`);
    }
  } catch (error) {
    console.log(`  Error reading backup directory: ${error.message}`);
  }
}

async function performRestore() {
  // Get backup file from command line argument
  const BACKUP_FILE = process.argv[2];
  const DB_PATH = process.env.DB_PATH || join(projectRoot, 'data', 'auth.db');

  // Check if backup file is provided
  if (!BACKUP_FILE) {
    console.error('❌ Error: No backup file specified');
    console.log('');
    console.log(`Usage: node ${basename(__filename)} <backup_file>`);
    console.log('');
    console.log('Available backups:');
    await listBackups();
    process.exit(1);
  }

  // Check if backup file exists
  if (!existsSync(BACKUP_FILE)) {
    console.error(`❌ Error: Backup file not found: ${BACKUP_FILE}`);
    process.exit(1);
  }

  console.log('🔄 Database Restore');
  console.log(`  Backup file: ${BACKUP_FILE}`);
  console.log(`  Target database: ${DB_PATH}`);
  console.log('');

  let BACKUP_TO_RESTORE = BACKUP_FILE;
  let tempFile = null;

  try {
    // Check if file is compressed
    if (BACKUP_FILE.endsWith('.gz')) {
      console.log('  📦 Backup is compressed, decompressing...');
      
      const compressedData = readFileSync(BACKUP_FILE);
      const decompressed = await gunzipAsync(compressedData);
      
      // Create temporary file for decompressed backup
      tempFile = BACKUP_FILE.replace('.gz', '');
      writeFileSync(tempFile, decompressed);
      BACKUP_TO_RESTORE = tempFile;
      
      console.log('  ✓ Decompressed to temporary file');
    }
    
    // Verify backup file is a valid SQLite database
    console.log('  🔍 Verifying backup file integrity...');
    const testDb = new Database(BACKUP_TO_RESTORE, { readonly: true });
    const integrityCheck = testDb.prepare('PRAGMA integrity_check').get();
    testDb.close();
    
    if (integrityCheck && integrityCheck['integrity_check'] === 'ok') {
      console.log('  ✓ Backup file is valid');
    } else {
      console.error('  ❌ Backup file is corrupted or invalid!');
      
      // Clean up temporary file if created
      if (tempFile && existsSync(tempFile)) {
        await unlink(tempFile);
      }
      
      process.exit(1);
    }
    
    // Backup current database before restoring
    let dbBackupBeforeRestore = null;
    if (existsSync(DB_PATH)) {
      console.log('  💾 Backing up current database before restore...');
      
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '')
        .replace('T', '_')
        .slice(0, -5);
      
      dbBackupBeforeRestore = `${DB_PATH}.before-restore-${timestamp}`;
      await copyFile(DB_PATH, dbBackupBeforeRestore);
      console.log(`  ✓ Current database backed up to: ${dbBackupBeforeRestore}`);
    }
    
    // Ensure data directory exists
    const dataDir = dirname(DB_PATH);
    if (!existsSync(dataDir)) {
      const { mkdir } = await import('fs/promises');
      await mkdir(dataDir, { recursive: true });
    }
    
    // Perform restore
    console.log('  📥 Restoring database...');
    await copyFile(BACKUP_TO_RESTORE, DB_PATH);
    
    // Set proper permissions (Unix only)
    if (process.platform !== 'win32') {
      const { chmod } = await import('fs/promises');
      try {
        await chmod(DB_PATH, 0o600);
      } catch (error) {
        console.warn(`  ⚠️  Could not set permissions: ${error.message}`);
      }
    }
    
    // Verify restored database
    console.log('  🔍 Verifying restored database...');
    const restoredDb = new Database(DB_PATH, { readonly: true });
    const restoredIntegrityCheck = restoredDb.prepare('PRAGMA integrity_check').get();
    restoredDb.close();
    
    if (restoredIntegrityCheck && restoredIntegrityCheck['integrity_check'] === 'ok') {
      console.log('  ✓ Restored database is valid');
      
      // Clean up temporary decompressed file if created
      if (tempFile && existsSync(tempFile)) {
        await unlink(tempFile);
      }
      
      console.log('');
      console.log('✅ Database restored successfully!');
      console.log('');
      console.log(`  Restored from: ${BACKUP_FILE}`);
      if (dbBackupBeforeRestore) {
        console.log(`  Previous database saved as: ${dbBackupBeforeRestore}`);
      }
      console.log('');
      console.log('⚠️  Note: You may need to restart your application for changes to take effect.');
    } else {
      console.error('  ❌ Restored database is corrupted!');
      
      // Restore the backup we made
      if (dbBackupBeforeRestore && existsSync(dbBackupBeforeRestore)) {
        console.log('  🔄 Restoring previous database...');
        await copyFile(dbBackupBeforeRestore, DB_PATH);
        console.log('  ✓ Previous database restored');
      }
      
      // Clean up temporary file if created
      if (tempFile && existsSync(tempFile)) {
        await unlink(tempFile);
      }
      
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Restore failed!', error.message);
    
    // Clean up temporary file if created
    if (tempFile && existsSync(tempFile)) {
      try {
        await unlink(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    process.exit(1);
  }
}

// Run the restore
performRestore().catch((error) => {
  console.error('❌ Restore failed!', error.message);
  process.exit(1);
});

