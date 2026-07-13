import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateUploadSignature,
  verifyUploadSignature,
  UPLOAD_SIGNATURE_LENGTH,
} from './upload-signature';

const SECRET = 'test-secret-at-least-16-chars-long';

test('generates a signature of the expected length', () => {
  const expires = Math.floor(Date.now() / 1000) + 300;
  const sig = generateUploadSignature('photos', expires, SECRET);
  assert.equal(sig.length, UPLOAD_SIGNATURE_LENGTH);
});

test('verifies a freshly generated signature', () => {
  const expires = Math.floor(Date.now() / 1000) + 300;
  const sig = generateUploadSignature('photos', expires, SECRET);
  assert.equal(verifyUploadSignature(sig, 'photos', expires, SECRET), true);
});

test('rejects a signature for a different folder (tampered scope)', () => {
  const expires = Math.floor(Date.now() / 1000) + 300;
  const sig = generateUploadSignature('photos', expires, SECRET);
  assert.equal(verifyUploadSignature(sig, 'evil-folder', expires, SECRET), false);
});

test('rejects a signature verified against a different expires value', () => {
  const expires = Math.floor(Date.now() / 1000) + 300;
  const sig = generateUploadSignature('photos', expires, SECRET);
  assert.equal(verifyUploadSignature(sig, 'photos', expires + 1, SECRET), false);
});

test('rejects a signature verified with a different secret', () => {
  const expires = Math.floor(Date.now() / 1000) + 300;
  const sig = generateUploadSignature('photos', expires, SECRET);
  assert.equal(
    verifyUploadSignature(sig, 'photos', expires, 'a-completely-different-secret-16'),
    false,
  );
});

test('rejects malformed signatures', () => {
  const expires = Math.floor(Date.now() / 1000) + 300;
  for (const bad of ['', 'short', '0'.repeat(15), '0'.repeat(17)]) {
    assert.equal(verifyUploadSignature(bad, 'photos', expires, SECRET), false, `expected "${bad}" to be invalid`);
  }
});

test('rejects when expires is not a finite number', () => {
  const sig = generateUploadSignature('photos', Number.NaN, SECRET);
  assert.equal(verifyUploadSignature(sig, 'photos', Number.NaN, SECRET), false);
});

test('root folder (empty string) round-trips correctly', () => {
  const expires = Math.floor(Date.now() / 1000) + 300;
  const sig = generateUploadSignature('', expires, SECRET);
  assert.equal(verifyUploadSignature(sig, '', expires, SECRET), true);
});
