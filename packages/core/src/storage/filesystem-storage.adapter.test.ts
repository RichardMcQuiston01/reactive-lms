import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LmsError } from '@reactive-lms/shared';
import { zipSync, strToU8 } from 'fflate';
import {
  DEFAULT_MAX_ZIP_FILE_COUNT,
  DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES,
  FilesystemStorageAdapter,
} from './filesystem-storage.adapter';

describe('FilesystemStorageAdapter', () => {
  let dataRoot: string;
  let storage: FilesystemStorageAdapter;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), 'rlms-storage-'));
    storage = new FilesystemStorageAdapter(dataRoot);
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  test('put then get round-trips bytes under the dataroot', async () => {
    const body = new TextEncoder().encode('hello zip');
    await storage.put('packages/demo/original.zip', body);
    const read = await storage.get('packages/demo/original.zip');
    expect(read).toEqual(body);

    const onDisk = await readFile(
      path.join(dataRoot, 'packages', 'demo', 'original.zip'),
    );
    expect(new Uint8Array(onDisk)).toEqual(body);
  });

  test('getPublicUrl returns a /lms/content/ relative key path', async () => {
    const url = await storage.getPublicUrl('packages/abc/content/index.html');
    expect(url).toBe('/lms/content/packages/abc/content/index.html');
  });

  test('extractZip writes archive members under destPrefix', async () => {
    const zip = zipSync({
      'index.html': strToU8('<html>ok</html>'),
      'assets/app.js': strToU8('console.log(1)'),
    });
    await storage.put('packages/p1/original.zip', zip);
    const extracted = await storage.extractZip(
      'packages/p1/original.zip',
      'packages/p1/content',
    );

    expect(extracted.sort()).toEqual(['assets/app.js', 'index.html']);
    const html = await storage.get('packages/p1/content/index.html');
    expect(new TextDecoder().decode(html)).toBe('<html>ok</html>');
  });

  test('extractZip rejects archives with more files than the limit', async () => {
    const limited = new FilesystemStorageAdapter(dataRoot, {
      maxFileCount: 2,
    });
    const zip = zipSync({
      'a.txt': strToU8('a'),
      'b.txt': strToU8('b'),
      'c.txt': strToU8('c'),
    });
    await limited.put('bomb-count.zip', zip);

    try {
      await limited.extractZip('bomb-count.zip', 'out');
      throw new Error('expected extractZip to reject file-count bomb');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'PACKAGE_ZIP_BOMB',
        status: 400,
      });
    }
  });

  test('extractZip rejects archives whose uncompressed size exceeds the limit', async () => {
    const limited = new FilesystemStorageAdapter(dataRoot, {
      maxUncompressedBytes: 16,
    });
    const zip = zipSync({
      'big.txt': strToU8('this payload is definitely over sixteen bytes'),
    });
    await limited.put('bomb-size.zip', zip);

    try {
      await limited.extractZip('bomb-size.zip', 'out');
      throw new Error('expected extractZip to reject size bomb');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'PACKAGE_ZIP_BOMB',
        status: 400,
      });
    }
  });

  test('default zip-bomb limits are 200 MiB and 10_000 files', () => {
    expect(DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES).toBe(200 * 1024 * 1024);
    expect(DEFAULT_MAX_ZIP_FILE_COUNT).toBe(10_000);
  });

  test('remove deletes a stored object and a prefix tree', async () => {
    await storage.put('packages/p1/original.zip', new Uint8Array([1, 2]));
    await storage.put(
      'packages/p1/content/index.html',
      new TextEncoder().encode('<html></html>'),
    );
    await storage.remove('packages/p1');
    try {
      await storage.get('packages/p1/original.zip');
      throw new Error('expected original zip to be removed');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'STORAGE_KEY_NOT_FOUND',
        status: 404,
      });
    }
  });

  test('put invokes antivirusScan with the original archive bytes', async () => {
    const scanned: Uint8Array[] = [];
    const guarded = new FilesystemStorageAdapter(dataRoot, {
      antivirusScan: async (buf) => {
        scanned.push(buf);
      },
    });
    const body = new TextEncoder().encode('archive');
    await guarded.put('original.zip', body);
    expect(scanned).toHaveLength(1);
    expect(scanned[0]).toEqual(body);
  });
});
