import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpeningRange, seenRecently } from './delivery';

test('only the opening range of a playback is a delivery', () => {
  assert.equal(isOpeningRange(null), true);
  assert.equal(isOpeningRange(undefined), true);
  assert.equal(isOpeningRange('bytes=0-'), true);
  assert.equal(isOpeningRange('bytes=0-1023'), true);
  assert.equal(isOpeningRange('bytes=500000-'), false);
});

test('a re-open by the same viewer inside the window is the same delivery', () => {
  const seen = new Map<string, number>();
  const t0 = 1_700_000_000_000;
  assert.equal(seenRecently(seen, 'ip|clip.mp4', t0), false);
  assert.equal(seenRecently(seen, 'ip|clip.mp4', t0 + 1_000), true);
  // Another viewer, or another asset, is another delivery.
  assert.equal(seenRecently(seen, 'ip2|clip.mp4', t0 + 1_000), false);
  assert.equal(seenRecently(seen, 'ip|other.mp4', t0 + 1_000), false);
  // The window runs from the first delivery, so re-requesting forever still
  // counts once per window rather than never.
  assert.equal(seenRecently(seen, 'ip|clip.mp4', t0 + 14_000), true);
  assert.equal(seenRecently(seen, 'ip|clip.mp4', t0 + 16_000), false);
});
