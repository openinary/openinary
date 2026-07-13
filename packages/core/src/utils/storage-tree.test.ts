import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTreeFromKeys,
  storageTreeToTreeData,
  sumTreeSize,
  type StorageNode,
} from './storage-tree';

function findChild(node: StorageNode, name: string, type: "file" | "directory") {
  return node.children?.find((c) => c.name === name && c.type === type);
}

test('builds an empty tree from no keys', () => {
  const root = buildTreeFromKeys([]);
  assert.equal(root.type, 'directory');
  assert.deepEqual(root.children, []);
});

test('places root-level files at the top level', () => {
  const root = buildTreeFromKeys([
    { key: 'a.png', size: 10, lastModified: new Date('2026-01-01') },
  ]);
  const file = findChild(root, 'a.png', 'file');
  assert.ok(file);
  assert.equal(file.path, 'a.png');
  assert.equal(file.size, 10);
  assert.equal(file.mtime, new Date('2026-01-01').toISOString());
});

test('builds nested directories from deep keys', () => {
  const root = buildTreeFromKeys([
    { key: 'a/b/c.png', size: 1 },
    { key: 'a/b/d.png', size: 2 },
    { key: 'a/e.png', size: 3 },
  ]);
  const a = findChild(root, 'a', 'directory');
  assert.ok(a);
  const b = findChild(a, 'b', 'directory');
  assert.ok(b);
  assert.equal(findChild(b, 'c.png', 'file')?.path, 'a/b/c.png');
  assert.equal(findChild(b, 'd.png', 'file')?.path, 'a/b/d.png');
  assert.equal(findChild(a, 'e.png', 'file')?.path, 'a/e.png');
  // "a" appears once, not once per key
  assert.equal(
    root.children?.filter((c) => c.name === 'a').length,
    1,
  );
});

test('folder marker keys create directories, not files', () => {
  const root = buildTreeFromKeys([{ key: 'empty/', size: 0 }]);
  assert.ok(findChild(root, 'empty', 'directory'));
  assert.equal(findChild(root, 'empty', 'file'), undefined);
});

test('duplicate file keys are deduplicated', () => {
  const root = buildTreeFromKeys([
    { key: 'a/x.png', size: 1 },
    { key: 'a/x.png', size: 2 },
  ]);
  const a = findChild(root, 'a', 'directory');
  assert.equal(a?.children?.length, 1);
  assert.equal(a?.children?.[0].size, 1);
});

test('leading slashes are stripped from keys', () => {
  const root = buildTreeFromKeys([{ key: '/a/x.png', size: 1 }]);
  const a = findChild(root, 'a', 'directory');
  assert.equal(findChild(a!, 'x.png', 'file')?.path, 'a/x.png');
});

test('a file and a directory can share the same name', () => {
  const root = buildTreeFromKeys([
    { key: 'a', size: 1 },
    { key: 'a/b.png', size: 2 },
  ]);
  assert.ok(findChild(root, 'a', 'file'));
  assert.ok(findChild(root, 'a', 'directory'));
});

test('storageTreeToTreeData maps paths to ids', () => {
  const root = buildTreeFromKeys([{ key: 'a/b.png', size: 1 }]);
  const treeData = storageTreeToTreeData(root);
  assert.equal(treeData[0].id, 'a');
  assert.equal(treeData[0].children?.[0].id, 'a/b.png');
});

test('sumTreeSize aggregates sizes and file counts, ignoring markers', () => {
  const root = buildTreeFromKeys([
    { key: 'a/b.png', size: 10 },
    { key: 'a/c/d.png', size: 5 },
    { key: 'empty/', size: 0 },
  ]);
  assert.deepEqual(sumTreeSize(root), { size: 15, fileCount: 2 });
});

test('matches the legacy tree shape for a mixed listing', () => {
  const root = buildTreeFromKeys([
    { key: 'z.png', size: 1 },
    { key: 'a/1.png', size: 2 },
    { key: 'a/sub/2.png', size: 3 },
    { key: 'a/', size: 0 },
  ]);
  const a = findChild(root, 'a', 'directory');
  assert.equal(root.children?.length, 2); // z.png + a
  assert.equal(a?.children?.length, 2); // 1.png + sub
});
