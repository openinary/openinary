import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripUrlHostile } from './upload-validation';

const BASE = 'https://cdn.example.com/t';

// How a key is delivered: the client encodes per segment, the browser parses,
// the transform route decodes per segment.
function roundTrip(key: string): string {
  const url = new URL(
    `${BASE}/${key.split('/').map(encodeURIComponent).join('/')}`,
  );
  return url.pathname
    .slice('/t/'.length)
    .split('/')
    .map(decodeURIComponent)
    .join('/');
}

test('drops the characters that truncate a URL', () => {
  // Reported by a user whose video would not play: the "#" ended the path,
  // so the CDN was asked for "VAULT/The " and answered 404.
  assert.equal(
    stripUrlHostile('VAULT/The #1 clip.mp4'),
    'VAULT/The 1 clip.mp4',
  );
  assert.equal(stripUrlHostile('what now?.png'), 'what now.png');
});

test('drops "%", which would round trip as a different key', () => {
  // Readers decode, so a stored "50%20off.mp4" is looked up as "50 off.mp4".
  assert.equal(stripUrlHostile('50%20off.mp4'), '5020off.mp4');
});

test('drops control characters', () => {
  assert.equal(stripUrlHostile('a\u0000b\u001fc.png'), 'abc.png');
});

test('keeps everything a URL can carry', () => {
  for (const name of [
    'La Marée.png',
    'clip [final].mp4',
    "a+b & c's.jpg",
    'Vidéos/Été 2026/plage.mov',
    'nested/folder/photo.jpg',
  ]) {
    assert.equal(stripUrlHostile(name), name);
  }
});

test('what it returns survives the delivery round trip', () => {
  for (const raw of [
    'VAULT/The #1 clip.mp4',
    'OPTIMIZED/50% off? maybe.mp4',
    'Vidéos/Été 2026/plage.mov',
  ]) {
    const key = stripUrlHostile(raw);
    assert.equal(roundTrip(key), key);
  }
});

test('the raw name does not - which is the bug', () => {
  const url = new URL(`${BASE}/VAULT/The #1 clip.mp4`);
  assert.notEqual(url.hash, '');
  assert.equal(url.pathname.endsWith('.mp4'), false);
});
