#!/usr/bin/env node
/**
 * Database backup script
 * Creates timestamped backups of the SQLite database with rotation
 * 
 * Cross-platform Node.js version (works on Windows, macOS, Linux, Docker)
 */

import Database from 'better-sqlite3';
import { existsSync, mkdir, readdir, stat, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const gzipAsync = promisify(gzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Get paths from environment or use defaults
const DB_PATH = process.env.DB_PATH || join(projectRoot, 'data', 'auth.db');
const BACKUP_DIR = process.env.BACKUP_PATH || join(projectRoot, 'backup');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '30', 10);
const COMPRESS = process.env.COMPRESS_BACKUPS !== 'false'; // Default to true

async function performBackup() {
  // Create backup directory if it doesn't exist
  if (!existsSync(BACKUP_DIR)) {
    await mkdir(BACKUP_DIR, { recursive: true });
  }

  // Check if database exists
  if (!existsSync(DB_PATH)) {
    console.log(`⚠️  Database file not found at ${DB_PATH}, skipping backup`);
    process.exit(0);
  }

  // Generate timestamp for backup filename
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
    .replace('T', '_')
    .slice(0, -5); // Format: YYYYMMDD_HHMMSS

  const BACKUP_NAME = `auth_backup_${timestamp}.db`;
  const BACKUP_FILE = join(BACKUP_DIR, BACKUP_NAME);

  console.log('📦 Starting database backup...');
  console.log(`  Source: ${DB_PATH}`);
  console.log(`  Destination: ${BACKUP_FILE}`);

  try {
    // Open source database
    const sourceDb = new Database(DB_PATH, { readonly: true });
    
    // Create backup database
    const backupDb = new Database(BACKUP_FILE);
    
    // Perform backup using SQLite backup API
    await sourceDb.backup(backupDb);
    backupDb.close();
    sourceDb.close();
    
    console.log('  ✓ Backup created successfully');
    
    // Get file size
    const stats = await stat(BACKUP_FILE);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`  ✓ Backup size: ${sizeInMB} MB`);
    
    let finalBackupFile = BACKUP_FILE;
    
    // Compress backup if enabled
    if (COMPRESS) {
      console.log('  🗜️  Compressing backup...');
      
      const backupData = readFileSync(BACKUP_FILE);
      const compressed = await gzipAsync(backupData);
      const compressedFile = `${BACKUP_FILE}.gz`;
      
      writeFileSync(compressedFile, compressed);
      
      // Remove uncompressed backup
      await unlink(BACKUP_FILE);
      
      finalBackupFile = compressedFile;
      
      const compressedStats = await stat(compressedFile);
      const compressedSizeInMB = (compressedStats.size / (1024 * 1024)).toFixed(2);
      console.log(`  ✓ Compressed size: ${compressedSizeInMB} MB`);
    }
    
    // Rotate old backups
    console.log(`  🔄 Rotating old backups (keeping last ${MAX_BACKUPS})...`);
    
    const extension = COMPRESS ? '.db.gz' : '.db';
    const files = await readdir(BACKUP_DIR);
    const backupFiles = files
      .filter(f => f.startsWith('auth_backup_') && f.endsWith(extension))
      .map(f => join(BACKUP_DIR, f));
    
    // Get file stats and sort by modification time (newest first)
    const filesWithStats = await Promise.all(
      backupFiles.map(async (f) => {
        const stats = await stat(f);
        return { path: f, mtime: stats.mtime };
      })
    );
    
    filesWithStats.sort((a, b) => b.mtime - a.mtime);
    
    console.log(`  ℹ️  Total backups: ${filesWithStats.length}`);
    
    // Remove old backups if we exceed MAX_BACKUPS
    if (filesWithStats.length > MAX_BACKUPS) {
      const removeCount = filesWithStats.length - MAX_BACKUPS;
      console.log(`  🗑️  Removing ${removeCount} old backup(s)...`);
      
      const toRemove = filesWithStats.slice(MAX_BACKUPS);
      for (const file of toRemove) {
        await unlink(file.path);
      }
      
      console.log('  ✓ Old backups removed');
    }
    
    console.log('✅ Backup completed successfully!');
    console.log(`  Backup file: ${finalBackupFile}`);
  } catch (error) {
    console.error('❌ Backup failed!', error.message);
    process.exit(1);
  }
}

// Run the backup
performBackup().catch((error) => {
  console.error('❌ Backup failed!', error.message);
  process.exit(1);
});

