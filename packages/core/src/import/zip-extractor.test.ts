import { describe, expect, test } from 'bun:test';
import {
  LmsError,
  collectBlobBody,
  type BlobStorageAdapter,
} from '@richardmcquiston01/reactive-lms-shared';
import { strToU8, zipSync } from 'fflate';
import { MemoryBlobStorageAdapter } from '../storage/memory-blob-storage.adapter';
import { extractZipToStorage } from './zip-extractor';
import {
  DEFAULT_MAX_ZIP_FILE_COUNT,
  DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES,
} from './zip-limits';

async function read(store: BlobStorageAdapter, key: string): Promise<string> {
  const result = await store.get(key);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return new TextDecoder().decode(await collectBlobBody(result.value.body));
}

describe('extractZipToStorage', () => {
  test('writes archive members under the destination prefix', async () => {
    const store = new MemoryBlobStorageAdapter();
    const zip = zipSync({
      'index.html': strToU8('<html>ok</html>'),
      'assets/app.js': strToU8('console.log(1)'),
    });

    const extracted = await extractZipToStorage(
      store,
      zip,
      'packages/p1/content',
    );

    expect(extracted.sort()).toEqual(['assets/app.js', 'index.html']);
    expect(await read(store, 'packages/p1/content/index.html')).toBe(
      '<html>ok</html>',
    );
  });

  test('records a content type guessed from each extension', async () => {
    const store = new MemoryBlobStorageAdapter();
    const zip = zipSync({
      'index.html': strToU8('<html></html>'),
      'app.js': strToU8('1'),
    });

    await extractZipToStorage(store, zip, 'out');

    const html = await store.head('out/index.html');
    const script = await store.head('out/app.js');
    expect(html.ok && html.value.contentType).toBe('text/html; charset=utf-8');
    expect(script.ok && script.value.contentType).toBe(
      'text/javascript; charset=utf-8',
    );
  });

  test('rejects archives with more files than the limit', async () => {
    const store = new MemoryBlobStorageAdapter();
    const zip = zipSync({
      'a.txt': strToU8('a'),
      'b.txt': strToU8('b'),
      'c.txt': strToU8('c'),
    });

    const attempt = extractZipToStorage(store, zip, 'out', { maxFileCount: 2 });

    await expect(attempt).rejects.toBeInstanceOf(LmsError);
    await expect(attempt).rejects.toMatchObject({
      code: 'PACKAGE_ZIP_BOMB',
      status: 400,
    });
    expect((await store.list('')).ok && (await store.list('')).value).toEqual(
      [],
    );
  });

  test('rejects archives whose uncompressed size exceeds the limit', async () => {
    const store = new MemoryBlobStorageAdapter();
    const zip = zipSync({
      'big.txt': strToU8('this payload is definitely over sixteen bytes'),
    });

    await expect(
      extractZipToStorage(store, zip, 'out', { maxUncompressedBytes: 16 }),
    ).rejects.toMatchObject({ code: 'PACKAGE_ZIP_BOMB', status: 400 });
  });

  test('rejects an archive that is not a ZIP', async () => {
    const store = new MemoryBlobStorageAdapter();

    await expect(
      extractZipToStorage(store, new Uint8Array([1, 2, 3]), 'out'),
    ).rejects.toMatchObject({ code: 'PACKAGE_INVALID_ZIP' });
  });

  test('default limits are 200 MiB and 10,000 files', () => {
    expect(DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES).toBe(200 * 1024 * 1024);
    expect(DEFAULT_MAX_ZIP_FILE_COUNT).toBe(10_000);
  });
});
