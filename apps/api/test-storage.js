import 'dotenv/config';
import { createStorageClient } from './src/utils/storage/index.ts';

console.log('Environment Variables:');
console.log('STORAGE_PROVIDER:', process.env.STORAGE_PROVIDER);
console.log('STORAGE_ACCESS_KEY_ID:', process.env.STORAGE_ACCESS_KEY_ID ? '***SET***' : 'NOT SET');
console.log('STORAGE_SECRET_ACCESS_KEY:', process.env.STORAGE_SECRET_ACCESS_KEY ? '***SET***' : 'NOT SET');
console.log('STORAGE_BUCKET_NAME:', process.env.STORAGE_BUCKET_NAME || 'NOT SET');
console.log('STORAGE_ENDPOINT:', process.env.STORAGE_ENDPOINT || 'NOT SET');
console.log('');

const storage = createStorageClient();
console.log('Storage Client:', storage ? 'CREATED ✓' : 'NULL ✗');

if (!storage) {
  console.log('⚠️ Cloud storage is disabled. The app will use local storage.');
} else {
  console.log('✓ Cloud storage is enabled and configured.');
}

