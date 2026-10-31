import { describe, expect, test } from 'bun:test';
import {
  collectBlobBody,
  type BlobResult,
  type BlobStorageAdapter,
} from '@richardmcquiston01/reactive-lms-shared';

/**
 * A store under test and how to dispose of it.
 */
export interface BlobStorageFixture {
  /** The adapter to exercise; it must start empty. */
  adapter: BlobStorageAdapter;
  /** Releases temporary resources after each test. */
  cleanup?: () => Promise<void>;
}

/**
 * Registers the shared `BlobStorageAdapter` tests. Every adapter, including a
 * host's own and the S3-compatible adapter planned for 1.0.0, must pass this
 * suite before it is considered supported.
 *
 * @param name - Adapter name shown in the test output
 * @param create - Builds a fresh, empty store for each test
 */
export function runBlobStorageConformance(
  name: string,
  create: () => Promise<BlobStorageFixture>,
): void {
  const withStore = async (
    body: (adapter: BlobStorageAdapter) => Promise<void>,
  ): Promise<void> => {
    const fixture = await create();
    try {
      await body(fixture.adapter);
    } finally {
      await fixture.cleanup?.();
    }
  };

  describe(`BlobStorageAdapter conformance: ${name}`, () => {
    test('put then get round-trips bytes and reports the size', () =>
      withStore(async (store) => {
        const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
        const put = unwrap(await store.put('a/b/file.bin', bytes));
        expect(put).toMatchObject({ key: 'a/b/file.bin', size: 6 });

        const got = unwrap(await store.get('a/b/file.bin'));
        expect(got.info.size).toBe(6);
        expect(Array.from(await collectBlobBody(got.body))).toEqual(
          Array.from(bytes),
        );
      }));

    test('stores a multi-chunk stream', () =>
      withStore(async (store) => {
        async function* source(): AsyncIterable<Uint8Array> {
          for (let index = 0; index < 5; index += 1) {
            yield new Uint8Array(1000).fill(index);
          }
        }
        const put = unwrap(await store.put('stream.bin', source()));
        expect(put.size).toBe(5000);

        const got = unwrap(await store.get('stream.bin'));
        const all = await collectBlobBody(got.body);
        expect(all.byteLength).toBe(5000);
        expect(all[0]).toBe(0);
        expect(all[4999]).toBe(4);
      }));

    test('overwriting a key replaces the object', () =>
      withStore(async (store) => {
        unwrap(await store.put('k', new Uint8Array([1, 1, 1])));
        unwrap(await store.put('k', new Uint8Array([2])));
        const got = unwrap(await store.get('k'));
        expect(Array.from(await collectBlobBody(got.body))).toEqual([2]);
      }));

    test('a missing key is not_found for get and head', () =>
      withStore(async (store) => {
        expect(errorCode(await store.get('nope'))).toBe('not_found');
        expect(errorCode(await store.head('nope'))).toBe('not_found');
      }));

    test('head returns metadata without content', () =>
      withStore(async (store) => {
        unwrap(await store.put('h', new Uint8Array(42)));
        expect(unwrap(await store.head('h'))).toMatchObject({
          key: 'h',
          size: 42,
        });
      }));

    test('equivalent spellings of a key address the same object', () =>
      withStore(async (store) => {
        unwrap(await store.put('/a//b\\c.txt', new Uint8Array([7])));
        const got = unwrap(await store.get('a/b/c.txt'));
        expect(got.info.key).toBe('a/b/c.txt');
      }));

    test('unsafe keys are invalid_key for every operation', () =>
      withStore(async (store) => {
        for (const key of ['', '/', '..', 'a/../b', '../escape']) {
          expect(errorCode(await store.put(key, new Uint8Array(1)))).toBe(
            'invalid_key',
          );
          expect(errorCode(await store.get(key))).toBe('invalid_key');
          expect(errorCode(await store.head(key))).toBe('invalid_key');
          expect(errorCode(await store.remove(key))).toBe('invalid_key');
        }
      }));

    test('whatever put accepts can be read back, listed, and removed', () =>
      withStore(async (store) => {
        // A store may refuse a key for its own reasons, but it must do so
        // for every operation; accepting a write it then cannot see loses data.
        for (const key of [
          'dir/plain.txt',
          'dir/odd.rlms-tmp',
          'dir/.hidden',
        ]) {
          const put = await store.put(key, new Uint8Array([9]));
          if (!put.ok) {
            expect(errorCode(await store.head(key))).toBe(put.error.code);
            continue;
          }
          expect(unwrap(await store.head(key)).size).toBe(1);
          expect(
            unwrap(await store.list('dir/')).map((info) => info.key),
          ).toContain(key);
          unwrap(await store.remove(key));
          expect(errorCode(await store.head(key))).toBe('not_found');
        }
      }));

    test('list returns keys sorted and matches the prefix as text', () =>
      withStore(async (store) => {
        for (const key of ['a/b', 'a/bc', 'a/c/d', 'z', 'a/a']) {
          unwrap(await store.put(key, new Uint8Array([1])));
        }
        const keys = async (prefix: string): Promise<string[]> =>
          unwrap(await store.list(prefix)).map((info) => info.key);

        expect(await keys('')).toEqual(['a/a', 'a/b', 'a/bc', 'a/c/d', 'z']);
        expect(await keys('a/')).toEqual(['a/a', 'a/b', 'a/bc', 'a/c/d']);
        expect(await keys('a/b')).toEqual(['a/b', 'a/bc']);
        expect(await keys('a/b/')).toEqual([]);
        expect(await keys('nothing/')).toEqual([]);
      }));

    test('list on an empty store is an empty list', () =>
      withStore(async (store) => {
        expect(unwrap(await store.list(''))).toEqual([]);
      }));

    test('remove is idempotent', () =>
      withStore(async (store) => {
        unwrap(await store.put('r', new Uint8Array([1])));
        unwrap(await store.remove('r'));
        unwrap(await store.remove('r'));
        expect(errorCode(await store.get('r'))).toBe('not_found');
      }));

    test('removePrefix deletes only keys that start with the prefix', () =>
      withStore(async (store) => {
        for (const key of ['p/1/a', 'p/1/b', 'p/10/a', 'q/1']) {
          unwrap(await store.put(key, new Uint8Array([1])));
        }
        expect(unwrap(await store.removePrefix('p/1/'))).toBe(2);
        const left = unwrap(await store.list('')).map((info) => info.key);
        expect(left).toEqual(['p/10/a', 'q/1']);
        expect(unwrap(await store.removePrefix('missing/'))).toBe(0);
      }));

    test('removePrefix refuses an empty prefix', () =>
      withStore(async (store) => {
        unwrap(await store.put('keep', new Uint8Array([1])));
        expect(errorCode(await store.removePrefix(''))).toBe('invalid_key');
        expect(unwrap(await store.list('')).length).toBe(1);
      }));

    test('range reads return the requested bytes', () =>
      withStore(async (store) => {
        const bytes = Uint8Array.from({ length: 100 }, (_, index) => index);
        unwrap(await store.put('r.bin', bytes));

        const middle = unwrap(
          await store.get('r.bin', { range: { start: 10, end: 19 } }),
        );
        expect(middle.range).toEqual({ start: 10, end: 19 });
        expect(Array.from(await collectBlobBody(middle.body))).toEqual(
          Array.from(bytes.subarray(10, 20)),
        );

        const open = unwrap(await store.get('r.bin', { range: { start: 95 } }));
        expect(open.range).toEqual({ start: 95, end: 99 });
        expect((await collectBlobBody(open.body)).byteLength).toBe(5);

        const clamped = unwrap(
          await store.get('r.bin', { range: { start: 90, end: 500 } }),
        );
        expect(clamped.range).toEqual({ start: 90, end: 99 });
        expect(clamped.info.size).toBe(100);
      }));

    test('a range starting past the end is invalid_range', () =>
      withStore(async (store) => {
        unwrap(await store.put('s', new Uint8Array(10)));
        expect(errorCode(await store.get('s', { range: { start: 10 } }))).toBe(
          'invalid_range',
        );
        expect(errorCode(await store.get('s', { range: { start: -1 } }))).toBe(
          'invalid_range',
        );
      }));

    test('a stream that fails midway leaves no partial object', () =>
      withStore(async (store) => {
        async function* failing(): AsyncIterable<Uint8Array> {
          yield new Uint8Array([1, 2, 3]);
          throw new Error('source failed');
        }

        const fresh = await store.put('fresh', failing());
        expect(errorCode(fresh)).toBe('io');
        expect(errorCode(await store.head('fresh'))).toBe('not_found');

        unwrap(await store.put('existing', new Uint8Array([9, 9])));
        expect(errorCode(await store.put('existing', failing()))).toBe('io');
        const kept = unwrap(await store.get('existing'));
        expect(Array.from(await collectBlobBody(kept.body))).toEqual([9, 9]);

        expect(unwrap(await store.list('')).map((info) => info.key)).toEqual([
          'existing',
        ]);
      }));

    test('stores an empty object', () =>
      withStore(async (store) => {
        unwrap(await store.put('empty', new Uint8Array(0)));
        const got = unwrap(await store.get('empty'));
        expect(got.info.size).toBe(0);
        expect((await collectBlobBody(got.body)).byteLength).toBe(0);
      }));
  });
}

function unwrap<T>(result: BlobResult<T>): T {
  if (!result.ok) {
    throw new Error(
      `Expected success but got ${result.error.code}: ${result.error.message}`,
    );
  }
  return result.value;
}

function errorCode(result: BlobResult<unknown>): string {
  if (result.ok) {
    throw new Error('Expected a failure but the operation succeeded.');
  }
  return result.error.code;
}
