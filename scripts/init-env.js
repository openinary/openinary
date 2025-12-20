#!/usr/bin/env node
/**
 * Initialize environment variables
 * Generates BETTER_AUTH_SECRET if not already set
 * 
 * Cross-platform Node.js version (works on Windows, macOS, Linux, Docker)
 */

import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Get the API .env file path
const envPath = join(projectRoot, 'apps', 'api', '.env');
const envTemplatePath = join(projectRoot, 'apps', 'api', 'env.template');

console.log('Initializing environment...');

// Read existing .env file or create from template
let envContent = '';
if (existsSync(envPath)) {
  envContent = readFileSync(envPath, 'utf-8');
} else if (existsSync(envTemplatePath)) {
  envContent = readFileSync(envTemplatePath, 'utf-8');
  console.log('Creating .env from template...');
}

// Check if BETTER_AUTH_SECRET is set in environment or file
const secretFromEnv = process.env.BETTER_AUTH_SECRET;
const secretMatch = envContent.match(/^BETTER_AUTH_SECRET=(.+)$/m);
const existingSecret = secretMatch ? secretMatch[1].trim() : null;

// Check if secret needs to be generated
// In Docker, if secret is set via env var, use it. Otherwise, generate and write to .env
const needsGeneration = !secretFromEnv || 
  secretFromEnv === '' ||
  secretFromEnv === 'build-time-secret-will-be-replaced' ||
  (!existingSecret && !secretFromEnv) ||
  (existingSecret && (
    existingSecret === 'your-secret-key-here-generate-with-openssl-rand-hex-32' ||
    existingSecret === '' ||
    existingSecret === 'build-time-secret-will-be-replaced'
  ));

if (needsGeneration && !secretFromEnv) {
  console.log('Generating BETTER_AUTH_SECRET...');
  
  // Generate 32-byte (256-bit) hex secret
  const secret = crypto.randomBytes(32).toString('hex');
  
  // Update or add BETTER_AUTH_SECRET in env content
  if (secretMatch) {
    // Replace existing line
    envContent = envContent.replace(
      /^BETTER_AUTH_SECRET=.*$/m,
      `BETTER_AUTH_SECRET=${secret}`
    );
  } else {
    // Add new line
    if (envContent && !envContent.endsWith('\n')) {
      envContent += '\n';
    }
    envContent += `BETTER_AUTH_SECRET=${secret}\n`;
  }
  
  // Write updated .env file
  writeFileSync(envPath, envContent, 'utf-8');
  console.log('BETTER_AUTH_SECRET generated successfully');
  console.log(`   Saved to: ${envPath}`);
} else {
  if (secretFromEnv && secretFromEnv !== '' && secretFromEnv !== 'build-time-secret-will-be-replaced') {
    console.log('Using existing BETTER_AUTH_SECRET from environment');
    
    // Also update .env file if it exists to keep it in sync
    if (existsSync(envPath)) {
      if (secretMatch) {
        envContent = envContent.replace(
          /^BETTER_AUTH_SECRET=.*$/m,
          `BETTER_AUTH_SECRET=${secretFromEnv}`
        );
      } else {
        if (envContent && !envContent.endsWith('\n')) {
          envContent += '\n';
        }
        envContent += `BETTER_AUTH_SECRET=${secretFromEnv}\n`;
      }
      writeFileSync(envPath, envContent, 'utf-8');
    }
  } else if (existingSecret && existingSecret !== '' && existingSecret !== 'your-secret-key-here-generate-with-openssl-rand-hex-32' && existingSecret !== 'build-time-secret-will-be-replaced') {
    console.log('Using existing BETTER_AUTH_SECRET from .env file');
  } else {
    // Fallback: generate if nothing valid exists
    console.log('Generating BETTER_AUTH_SECRET...');
    const secret = crypto.randomBytes(32).toString('hex');
    if (secretMatch) {
      envContent = envContent.replace(
        /^BETTER_AUTH_SECRET=.*$/m,
        `BETTER_AUTH_SECRET=${secret}`
      );
    } else {
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `BETTER_AUTH_SECRET=${secret}\n`;
    }
    writeFileSync(envPath, envContent, 'utf-8');
    console.log('BETTER_AUTH_SECRET generated successfully');
    console.log(`   Saved to: ${envPath}`);
  }
}

// Write runtime configuration for Next.js (variables that might be filtered by standalone mode)
const runtimeConfig = {
  IMAGE_TAG: process.env.IMAGE_TAG || 'latest',
  NODE_ENV: process.env.NODE_ENV || 'production',
  generatedAt: new Date().toISOString()
};

const runtimeConfigPath = join(projectRoot, 'runtime-config.json');
try {
  writeFileSync(runtimeConfigPath, JSON.stringify(runtimeConfig, null, 2), 'utf-8');
  console.log('Runtime configuration written to:', runtimeConfigPath);
  console.log('  IMAGE_TAG:', runtimeConfig.IMAGE_TAG);
} catch (err) {
  console.error('Warning: Could not write runtime-config.json:', err.message);
}

console.log('Environment initialized');

