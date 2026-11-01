import { describe, expect, test } from 'bun:test';
import { runCacheConformance } from '../testing';
import { MemoryCacheAdapter } from './memory-cache.adapter';

runCacheConformance('MemoryCacheAdapter', async () => {
  let nowMs = 1_000_000;
  return {
    adapter: new MemoryCacheAdapter(() => nowMs),
    advance: async (ms) => {
      nowMs += ms;
    },
  };
});

describe('MemoryCacheAdapter expiry sweep', () => {
  function cacheWithClock(sweepIntervalMs = 60_000): {
    cache: MemoryCacheAdapter;
    advance: (ms: number) => void;
  } {
    let nowMs = 1_000_000;
    return {
      cache: new MemoryCacheAdapter(() => nowMs, sweepIntervalMs),
      advance: (ms) => {
        nowMs += ms;
      },
    };
  }

  test('expired keys nobody asks for again are freed by later writes', async () => {
    const { cache, advance } = cacheWithClock();
    for (let index = 0; index < 100; index += 1) {
      await cache.set(`token-${index}`, 'x', { ttlMs: 1_000 });
    }
    expect(cache.size).toBe(100);

    advance(120_000);
    await cache.set('fresh', 'y');

    // Only the new key remains; none of the 100 were ever read again.
    expect(cache.size).toBe(1);
  });

  test('a sweep keeps live entries and entries without an expiry', async () => {
    const { cache, advance } = cacheWithClock();
    await cache.set('short', 'a', { ttlMs: 1_000 });
    await cache.set('long', 'b', { ttlMs: 10 * 60_000 });
    await cache.set('forever', 'c');

    advance(120_000);
    await cache.set('trigger', 'd');

    expect(cache.size).toBe(3);
    expect(
      (await cache.get('long')).ok && (await cache.get('long')),
    ).toMatchObject({
      value: 'b',
    });
    expect(await cache.get('forever')).toMatchObject({ value: 'c' });
  });

  test('sweeps at most once per interval, so writes stay cheap', async () => {
    const { cache, advance } = cacheWithClock(60_000);
    await cache.set('a', 'x', { ttlMs: 1_000 });

    advance(30_000);
    await cache.set('b', 'y');
    // Expired, but the interval has not passed, so it has not been swept yet.
    expect(cache.size).toBe(2);

    advance(40_000);
    await cache.set('c', 'z');
    expect(cache.size).toBe(2);
  });

  test('setIfAbsent also triggers the sweep', async () => {
    const { cache, advance } = cacheWithClock();
    await cache.set('old', 'x', { ttlMs: 1_000 });

    advance(120_000);
    await cache.setIfAbsent('claim', 'y');

    expect(cache.size).toBe(1);
  });
});
