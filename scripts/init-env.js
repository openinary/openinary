#!/usr/bin/env node
/**
 * Settles BETTER_AUTH_SECRET before the servers start (`pnpm init-env` in
 * dev; the Docker images source init-env-wrapper.sh, which evals the
 * `--shell` output of this script).
 *
 * Order: the environment, then the value already in apps/api/.env (dev, and
 * containers started before the secret lived on the volume), then the copy
 * persisted next to the database (DB_PATH's directory, the data volume in
 * Docker), else a new one. The result is written back to both, so
 * recreating a container keeps the secret the database was created with.
 */

import crypto from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseEnv } from 'util';

const shell = process.argv.includes('--shell');
// stdout is eval'd by the wrapper in --shell mode, so logs go to stderr.
const log = shell ? console.error : console.log;

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(projectRoot, 'apps', 'api', '.env');
const envTemplatePath = join(projectRoot, 'apps', 'api', 'env.template');
const secretPath = process.env.DB_PATH
  ? join(dirname(process.env.DB_PATH), '.secret')
  : undefined;

// Dev convenience; apps/web does not exist in the images.
const webEnvPath = join(projectRoot, 'apps', 'web', '.env');
const webEnvTemplatePath = join(projectRoot, 'apps', 'web', 'env.template');
if (!existsSync(webEnvPath) && existsSync(webEnvTemplatePath)) {
  writeFileSync(webEnvPath, readFileSync(webEnvTemplatePath, 'utf-8'), 'utf-8');
  log(`Created ${webEnvPath} from template`);
}

let envContent = existsSync(envPath)
  ? readFileSync(envPath, 'utf-8')
  : existsSync(envTemplatePath)
    ? readFileSync(envTemplatePath, 'utf-8')
    : '';
const fileEnv = parseEnv(envContent);

const fromEnv = process.env.BETTER_AUTH_SECRET;
const fromFile = fileEnv.BETTER_AUTH_SECRET?.trim();
const fromVolume =
  secretPath && existsSync(secretPath)
    ? readFileSync(secretPath, 'utf-8').trim()
    : undefined;
const secret =
  fromEnv || fromFile || fromVolume || crypto.randomBytes(32).toString('hex');

log(
  fromEnv
    ? 'Using BETTER_AUTH_SECRET from the environment'
    : fromFile
      ? 'Using BETTER_AUTH_SECRET from apps/api/.env'
      : fromVolume
        ? `Using BETTER_AUTH_SECRET from ${secretPath}`
        : 'Generated a new BETTER_AUTH_SECRET',
);

if (secretPath && secret !== fromVolume) {
  mkdirSync(dirname(secretPath), { recursive: true });
  writeFileSync(secretPath, `${secret}\n`, { mode: 0o600 });
}

if (secret !== fromFile) {
  const line = `BETTER_AUTH_SECRET=${secret}`;
  if (/^BETTER_AUTH_SECRET=.*$/m.test(envContent)) {
    envContent = envContent.replace(/^BETTER_AUTH_SECRET=.*$/m, line);
  } else {
    if (envContent && !envContent.endsWith('\n')) envContent += '\n';
    envContent += `${line}\n`;
  }
  try {
    writeFileSync(envPath, envContent, 'utf-8');
  } catch (error) {
    // The API image runs as `node` and apps/api is root-owned. The volume
    // copy above is the one that persists, so this file is only a convenience.
    if (!secretPath) throw error;
    log(`Could not write ${envPath} (${error.code}); the secret lives in ${secretPath}`);
  }
}

if (shell) {
  const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
  const exports = { BETTER_AUTH_SECRET: secret };
  // The runtime BETTER_AUTH_URL wins; the file is only a fallback.
  if (!process.env.BETTER_AUTH_URL && fileEnv.BETTER_AUTH_URL) {
    exports.BETTER_AUTH_URL = fileEnv.BETTER_AUTH_URL;
  }
  for (const [key, value] of Object.entries(exports)) {
    console.log(`export ${key}=${quote(value)}`);
  }
}
