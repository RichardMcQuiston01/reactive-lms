import { describe, expect, test } from 'bun:test';
import {
  contentTypeForKey,
  contentUrlForKey,
  parseByteRange,
} from './content-serving';

describe('contentTypeForKey', () => {
  test('maps known extensions case-insensitively', () => {
    expect(contentTypeForKey('packages/p/content/Index.HTML')).toBe(
      'text/html; charset=utf-8',
    );
    expect(contentTypeForKey('a/b.mp4')).toBe('video/mp4');
    expect(contentTypeForKey('a/b.woff2')).toBe('font/woff2');
  });

  test('falls back to octet-stream for unknown or missing extensions', () => {
    expect(contentTypeForKey('a/b.unknown')).toBe('application/octet-stream');
    expect(contentTypeForKey('noextension')).toBe('application/octet-stream');
  });
});

describe('contentUrlForKey', () => {
  test('joins the prefix and key without doubling slashes', () => {
    expect(contentUrlForKey('packages/p/content/index.html')).toBe(
      '/lms/content/packages/p/content/index.html',
    );
    expect(contentUrlForKey('/a\\b.html', '/files/')).toBe('/files/a/b.html');
  });
});

describe('parseByteRange', () => {
  test('no header or an unsupported form serves the whole object', () => {
    expect(parseByteRange(undefined, 100)).toEqual({ kind: 'none' });
    expect(parseByteRange('items=0-5', 100)).toEqual({ kind: 'none' });
    expect(parseByteRange('bytes=0-5,10-20', 100)).toEqual({ kind: 'none' });
    expect(parseByteRange('bytes=-', 100)).toEqual({ kind: 'none' });
  });

  test('parses closed, open-ended, and suffix ranges', () => {
    expect(parseByteRange('bytes=10-19', 100)).toEqual({
      kind: 'range',
      start: 10,
      end: 19,
    });
    expect(parseByteRange('bytes=90-', 100)).toEqual({
      kind: 'range',
      start: 90,
      end: 99,
    });
    expect(parseByteRange('bytes=-10', 100)).toEqual({
      kind: 'range',
      start: 90,
      end: 99,
    });
  });

  test('clamps an end past the object and a suffix larger than it', () => {
    expect(parseByteRange('bytes=90-500', 100)).toEqual({
      kind: 'range',
      start: 90,
      end: 99,
    });
    expect(parseByteRange('bytes=-500', 100)).toEqual({
      kind: 'range',
      start: 0,
      end: 99,
    });
  });

  test('a start past the end, or an empty suffix, is unsatisfiable', () => {
    expect(parseByteRange('bytes=100-', 100)).toEqual({
      kind: 'unsatisfiable',
    });
    expect(parseByteRange('bytes=-0', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseByteRange('bytes=0-5', 0)).toEqual({ kind: 'unsatisfiable' });
  });
});
