import type { BlobResult } from './contracts/blob-storage-adapter';

/**
 * Normalizes an object key so every adapter validates and spells keys the same
 * way: backslashes become `/`, leading and repeated `/` are dropped, and `.`
 * segments are removed. A key that is empty or contains a `..` segment is
 * rejected, so a key can never climb out of the store.
 *
 * @param key - Raw key from a caller
 * @returns The normalized key, or an `invalid_key` error
 */
export function normalizeBlobKey(key: string): BlobResult<string> {
  const segments = key
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');

  if (segments.length === 0) {
    return {
      ok: false,
      error: {
        code: 'invalid_key',
        message: `Storage key "${key}" is empty after normalization.`,
        key,
      },
    };
  }
  if (segments.includes('..')) {
    return {
      ok: false,
      error: {
        code: 'invalid_key',
        message: `Storage key "${key}" must not contain ".." segments.`,
        key,
      },
    };
  }
  return { ok: true, value: segments.join('/') };
}

/**
 * Normalizes a list or delete prefix. Unlike a key, a prefix may be empty
 * (list everything) and may end in `/`; the trailing `/` is preserved because
 * prefixes match as text, so `a/` and `a` select different objects.
 *
 * @param prefix - Raw prefix from a caller
 * @returns The normalized prefix, or an `invalid_key` error
 */
export function normalizeBlobPrefix(prefix: string): BlobResult<string> {
  const trailingSlash = /[\\/]$/.test(prefix);
  const trimmed = prefix.replace(/\\/g, '/').replace(/^\/+/, '');
  if (trimmed === '') {
    return { ok: true, value: '' };
  }
  const normalized = normalizeBlobKey(trimmed);
  if (!normalized.ok) {
    return {
      ok: false,
      error: {
        ...normalized.error,
        message: normalized.error.message.replace('key', 'prefix'),
      },
    };
  }
  return {
    ok: true,
    value: trailingSlash ? `${normalized.value}/` : normalized.value,
  };
}

/**
 * Compares two keys in plain code-unit order, the order `list` must return.
 *
 * @param left - First key
 * @param right - Second key
 */
export function compareBlobKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

/**
 * Reads a whole blob body into one buffer. Use only for content known to be
 * small, such as a manifest; stream everything else.
 *
 * @param body - Bytes or a stream
 */
export async function collectBlobBody(
  body: Uint8Array | AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    return body;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
