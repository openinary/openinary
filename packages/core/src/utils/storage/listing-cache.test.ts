import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedFullListing,
  invalidateListingCache,
} from './listing-cache';

type Listed = { key: string; size?: number; lastModified?: Date };

test('caches the listing between calls', async () => {
  invalidateListingCache();
  let calls = 0;
  const fetcher = async (): Promise<Listed[]> => {
    calls++;
    return [{ key: 'public/a.png' }];
  };

  const first = await getCachedFullListing(fetcher);
  const second = await getCachedFullListing(fetcher);

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});

test('concurrent callers share a single in-flight fetch', async () => {
  invalidateListingCache();
  let calls = 0;
  let release!: (value: Listed[]) => void;
  const fetcher = () => {
    calls++;
    return new Promise<Listed[]>((resolve) => {
      release = resolve;
    });
  };

  const p1 = getCachedFullListing(fetcher);
  const p2 = getCachedFullListing(fetcher);
  release([{ key: 'public/a.png' }]);

  assert.deepEqual(await p1, await p2);
  assert.equal(calls, 1);
});

test('invalidateListingCache forces a refetch', async () => {
  invalidateListingCache();
  let calls = 0;
  const fetcher = async (): Promise<Listed[]> => {
    calls++;
    return [];
  };

  await getCachedFullListing(fetcher);
  invalidateListingCache();
  await getCachedFullListing(fetcher);

  assert.equal(calls, 2);
});

test('a rejected fetch is not cached', async () => {
  invalidateListingCache();
  let calls = 0;
  const fetcher = async (): Promise<Listed[]> => {
    calls++;
    if (calls === 1) throw new Error('boom');
    return [{ key: 'public/a.png' }];
  };

  await assert.rejects(getCachedFullListing(fetcher));
  // Let the internal rejection handler clear the entry
  await new Promise((resolve) => setImmediate(resolve));

  const result = await getCachedFullListing(fetcher);
  assert.equal(calls, 2);
  assert.equal(result.length, 1);
});

test('the cache expires after its TTL', async (t) => {
  invalidateListingCache();
  mock.timers.enable({ apis: ['Date'], now: 0 });
  t.after(() => mock.timers.reset());

  let calls = 0;
  const fetcher = async (): Promise<Listed[]> => {
    calls++;
    return [];
  };

  await getCachedFullListing(fetcher);
  mock.timers.setTime(59_000);
  await getCachedFullListing(fetcher);
  assert.equal(calls, 1);

  mock.timers.setTime(61_000);
  await getCachedFullListing(fetcher);
  assert.equal(calls, 2);
});
