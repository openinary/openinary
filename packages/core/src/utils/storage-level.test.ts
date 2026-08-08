import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFolderPaths,
  getMediaType,
  normalizeLevelPath,
  shapeFolderSummary,
  shapeLevel,
} from './storage-level';

test('getMediaType recognizes image, video and other extensions', () => {
  assert.equal(getMediaType('a.PNG'), 'image');
  assert.equal(getMediaType('b.webm'), 'video');
  assert.equal(getMediaType('c.txt'), null);
});

test('normalizeLevelPath accepts root and nested paths', () => {
  assert.equal(normalizeLevelPath(''), '');
  assert.equal(normalizeLevelPath('/'), '');
  assert.equal(normalizeLevelPath('a/b'), 'a/b');
  assert.equal(normalizeLevelPath('/a/b/'), 'a/b');
});

test('normalizeLevelPath rejects traversal and empty segments', () => {
  assert.equal(normalizeLevelPath('..'), null);
  assert.equal(normalizeLevelPath('a/../b'), null);
  assert.equal(normalizeLevelPath('a//b'), null);
  assert.equal(normalizeLevelPath('a/./b'), null);
});

test('shapeLevel strips the storage prefix and excludes the folder marker', () => {
  const { folderNames, files } = shapeLevel('public/cows/', 'cows', {
    prefixes: ['public/cows/2024/', 'public/cows/2023/'],
    objects: [
      { key: 'public/cows/', size: 0 }, // folder marker
      { key: 'public/cows/black.png', size: 5, lastModified: new Date(0) },
      { key: 'public/cows/albert.png', size: 3 },
    ],
  });

  assert.deepEqual(folderNames, ['2023', '2024']); // sorted
  assert.deepEqual(
    files.map((f) => f.path),
    ['cows/albert.png', 'cows/black.png'], // sorted by name
  );
  assert.equal(files[1].size, 5);
  assert.equal(files[1].mtime, new Date(0).toISOString());
});

test('shapeLevel at the root produces paths without a leading slash', () => {
  const { files } = shapeLevel('public/', '', {
    prefixes: [],
    objects: [{ key: 'public/a.png', size: 1 }],
  });
  assert.equal(files[0].path, 'a.png');
  assert.equal(files[0].name, 'a.png');
});

test('shapeLevel of an empty (marker-only) folder returns empty lists', () => {
  const level = shapeLevel('public/empty/', 'empty', {
    prefixes: [],
    objects: [{ key: 'public/empty/', size: 0 }],
  });
  assert.deepEqual(level, { folderNames: [], files: [] });
});

test('shapeFolderSummary counts direct children and flags truncation', () => {
  const summary = shapeFolderSummary('public/a/', 'a', {
    prefixes: ['public/a/sub/'],
    objects: [
      { key: 'public/a/', size: 0 }, // marker excluded
      { key: 'public/a/x.png', size: 1 },
      { key: 'public/a/notes.txt', size: 1 },
    ],
    isTruncated: true,
  });

  assert.equal(summary.itemCount, 3); // sub + x.png + notes.txt
  assert.equal(summary.truncated, true);
  assert.deepEqual(summary.previewItems, [
    { path: 'a/x.png', type: 'image' },
  ]);
});

test('shapeFolderSummary caps preview items and keeps only media', () => {
  const objects = ['1.png', '2.mp4', '3.txt', '4.jpg', '5.webp', '6.gif'].map(
    (name) => ({ key: `public/a/${name}`, size: 1 }),
  );
  const summary = shapeFolderSummary('public/a/', 'a', {
    prefixes: [],
    objects,
    isTruncated: false,
  });

  assert.equal(summary.previewItems.length, 4);
  assert.deepEqual(
    summary.previewItems.map((p) => p.path),
    ['a/1.png', 'a/2.mp4', 'a/4.jpg', 'a/5.webp'],
  );
});

test('deriveFolderPaths includes intermediate directories and markers', () => {
  const folders = deriveFolderPaths([
    'a/b/c.png',
    'root.png',
    'empty/',
    'a/d.png',
  ]);
  assert.deepEqual(folders, ['a', 'a/b', 'empty']);
});
