import { describe, expect, test } from 'bun:test';
import type {
  CacheAdapter,
  CacheResult,
} from '@richardmcquiston01/reactive-lms-shared';

/**
 * A cache under test. `advance` moves the cache's clock forward so expiry can
 * be tested without waiting; adapters backed by a real service that expires
 * on its own clock may sleep instead.
 */
export interface CacheFixture {
  /** The adapter to exercise; it must start empty. */
  adapter: CacheAdapter;
  /** Moves time forward by `ms` milliseconds. */
  advance: (ms: number) => Promise<void>;
  /** Releases resources after each test. */
  cleanup?: () => Promise<void>;
}

function valueOf<T>(result: CacheResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got ${result.error.message}`);
  }
  return result.value;
}

/**
 * Registers the shared `CacheAdapter` tests. Every adapter, including a host's
 * Redis adapter, must pass this suite: one-time token redemption and nonce
 * claims depend on `take` and `setIfAbsent` being atomic.
 *
 * @param name - Adapter name shown in the test output
 * @param create - Builds a fresh, empty cache for each test
 */
export function runCacheConformance(
  name: string,
  create: () => Promise<CacheFixture>,
): void {
  const withCache = async (
    body: (fixture: CacheFixture) => Promise<void>,
  ): Promise<void> => {
    const fixture = await create();
    try {
      await body(fixture);
    } finally {
      await fixture.cleanup?.();
    }
  };

  describe(`CacheAdapter conformance: ${name}`, () => {
    test('get returns undefined for a missing key', () =>
      withCache(async ({ adapter }) => {
        expect(valueOf(await adapter.get('missing'))).toBeUndefined();
      }));

    test('set then get round-trips and set overwrites', () =>
      withCache(async ({ adapter }) => {
        valueOf(await adapter.set('k', 'one'));
        valueOf(await adapter.set('k', 'two'));
        expect(valueOf(await adapter.get('k'))).toBe('two');
      }));

    test('entries expire after their ttl', () =>
      withCache(async ({ adapter, advance }) => {
        valueOf(await adapter.set('k', 'v', { ttlMs: 1000 }));
        await advance(500);
        expect(valueOf(await adapter.get('k'))).toBe('v');
        await advance(600);
        expect(valueOf(await adapter.get('k'))).toBeUndefined();
      }));

    test('setIfAbsent claims a key once', () =>
      withCache(async ({ adapter }) => {
        expect(valueOf(await adapter.setIfAbsent('n', 'first'))).toBe(true);
        expect(valueOf(await adapter.setIfAbsent('n', 'second'))).toBe(false);
        expect(valueOf(await adapter.get('n'))).toBe('first');
      }));

    test('setIfAbsent succeeds again once the entry expired', () =>
      withCache(async ({ adapter, advance }) => {
        valueOf(await adapter.setIfAbsent('n', 'a', { ttlMs: 100 }));
        await advance(200);
        expect(valueOf(await adapter.setIfAbsent('n', 'b'))).toBe(true);
        expect(valueOf(await adapter.get('n'))).toBe('b');
      }));

    test('take returns the value to exactly one of two concurrent callers', () =>
      withCache(async ({ adapter }) => {
        valueOf(await adapter.set('t', 'token'));
        const [first, second] = await Promise.all([
          adapter.take('t'),
          adapter.take('t'),
        ]);
        const values = [valueOf(first), valueOf(second)];
        expect(values.filter((value) => value === 'token')).toHaveLength(1);
        expect(valueOf(await adapter.get('t'))).toBeUndefined();
      }));

    test('take on an expired or missing key returns undefined', () =>
      withCache(async ({ adapter, advance }) => {
        valueOf(await adapter.set('t', 'x', { ttlMs: 10 }));
        await advance(20);
        expect(valueOf(await adapter.take('t'))).toBeUndefined();
        expect(valueOf(await adapter.take('nope'))).toBeUndefined();
      }));

    test('delete removes a key and tolerates an absent one', () =>
      withCache(async ({ adapter }) => {
        valueOf(await adapter.set('k', 'v'));
        valueOf(await adapter.delete('k'));
        valueOf(await adapter.delete('k'));
        expect(valueOf(await adapter.get('k'))).toBeUndefined();
      }));
  });
}
