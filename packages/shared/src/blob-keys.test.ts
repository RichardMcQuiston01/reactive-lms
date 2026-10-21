import { describe, expect, test } from 'bun:test';
import {
  collectBlobBody,
  compareBlobKeys,
  normalizeBlobKey,
  normalizeBlobPrefix,
} from './blob-keys';

describe('normalizeBlobKey', () => {
  test('collapses separators, backslashes, and dot segments', () => {
    const result = normalizeBlobKey('/a//b\\./c.txt');
    expect(result).toEqual({ ok: true, value: 'a/b/c.txt' });
  });

  test('rejects an empty key, naming it', () => {
    for (const key of ['', '/', '//', '.', './.']) {
      const result = normalizeBlobKey(key);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('invalid_key');
        expect(result.error.message).toContain('empty');
      }
    }
  });

  test('rejects a key with a parent segment', () => {
    for (const key of ['..', 'a/../b', '../a', 'a/b/..']) {
      const result = normalizeBlobKey(key);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('invalid_key');
        expect(result.error.message).toContain('".."');
        expect(result.error.key).toBe(key);
      }
    }
  });
});

describe('normalizeBlobPrefix', () => {
  test('an empty prefix means everything', () => {
    expect(normalizeBlobPrefix('')).toEqual({ ok: true, value: '' });
    expect(normalizeBlobPrefix('/')).toEqual({ ok: true, value: '' });
  });

  test('keeps a trailing slash, because prefixes match as text', () => {
    expect(normalizeBlobPrefix('a//b/')).toEqual({ ok: true, value: 'a/b/' });
    expect(normalizeBlobPrefix('a\\b')).toEqual({ ok: true, value: 'a/b' });
  });

  test('rejects a parent segment and says it is a prefix', () => {
    const result = normalizeBlobPrefix('a/../b/');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_key');
      expect(result.error.message).toContain('prefix');
    }
  });
});

describe('compareBlobKeys', () => {
  test('orders by code unit, not locale', () => {
    const keys = ['b', 'B', 'a', 'a/b', 'a-b', 'A'];
    expect([...keys].sort(compareBlobKeys)).toEqual([
      'A',
      'B',
      'a',
      'a-b',
      'a/b',
      'b',
    ]);
    expect(compareBlobKeys('a', 'a')).toBe(0);
  });
});

describe('collectBlobBody', () => {
  test('returns a buffer unchanged', async () => {
    const bytes = new Uint8Array([1, 2]);
    expect(await collectBlobBody(bytes)).toBe(bytes);
  });

  test('joins stream chunks in order', async () => {
    async function* chunks(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([]);
      yield new Uint8Array([3]);
    }
    expect(Array.from(await collectBlobBody(chunks()))).toEqual([1, 2, 3]);
  });
});
