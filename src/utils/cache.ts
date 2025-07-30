import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const getCachePath = (url: string) => {
  const hash = crypto.createHash('md5').update(url).digest('hex');
  return path.join('./cache', hash);
};

export const existsInCache = async (cachePath: string) => {
  try {
    await fs.access(cachePath);
    return true;
  } catch {
    return false;
  }
};

export const saveToCache = async (cachePath: string, buffer: Buffer) => {
  const dir = path.dirname(cachePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(cachePath, buffer);
};

export const readFromCache = async (cachePath: string) => {
  return await fs.readFile(cachePath);
};
