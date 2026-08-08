import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyResize } from './resize';

// Minimal stand-in for a fluent-ffmpeg command: records what applyResize asks for.
const fakeCommand = () => {
  const calls: { videoFilters?: string; size?: string } = {};
  const command = {
    videoFilters(f: string) {
      calls.videoFilters = f;
      return command;
    },
    size(s: string) {
      calls.size = s;
      return command;
    },
  };
  return { command, calls };
};

const run = (params: Record<string, unknown>) => {
  const { command, calls } = fakeCommand();
  applyResize(command as any, { params } as any);
  return calls;
};

test('single width is enough: scales with derived even height and setsar', () => {
  assert.equal(run({ width: 303 }).videoFilters, 'scale=304:-2,setsar=1');
});

test('single height works too', () => {
  assert.equal(run({ height: 301 }).videoFilters, 'scale=-2:302,setsar=1');
});

test('both dimensions scale exactly, rounded to even, via filter not .size()', () => {
  const calls = run({ width: 300, height: 300 });
  assert.equal(calls.videoFilters, 'scale=300:300,setsar=1');
  assert.equal(calls.size, undefined);
});

test('crop=fill with both dimensions covers then crops, with setsar', () => {
  assert.equal(
    run({ width: 300, height: 200, crop: 'fill' }).videoFilters,
    'scale=300:200:force_original_aspect_ratio=increase,crop=300:200,setsar=1',
  );
});

test('crop with a single dimension falls back to plain scale', () => {
  assert.equal(run({ width: 300, crop: 'crop' }).videoFilters, 'scale=300:-2,setsar=1');
});

test('no valid dimensions leaves the command untouched', () => {
  const calls = run({});
  assert.equal(calls.videoFilters, undefined);
  assert.equal(calls.size, undefined);
  assert.deepEqual(run({ width: -5 }), {});
});
