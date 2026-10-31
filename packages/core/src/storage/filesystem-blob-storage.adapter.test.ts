import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FilesystemBlobStorageAdapter } from './filesystem-blob-storage.adapter';

// Behavior shared by every adapter is covered by the conformance suite in
// blob-storage.conformance.test.ts; these tests cover what is specific to disk.
describe('FilesystemBlobStorageAdapter', () => {
  let dataRoot: string;
  let store: FilesystemBlobStorageAdapter;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), 'rlms-fs-'));
    store = new FilesystemBlobStorageAdapter(dataRoot);
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  test('stores objects as plain files under the data root', async () => {
    await store.put('packages/p1/original.zip', new Uint8Array([1, 2, 3]));
    expect(await readdir(path.join(dataRoot, 'packages', 'p1'))).toEqual([
      'original.zip',
    ]);
  });

  test('a successful write leaves no temporary file behind', async () => {
    await store.put('a/file.bin', new Uint8Array([1]));
    expect(await readdir(path.join(dataRoot, 'a'))).toEqual(['file.bin']);
  });

  test('in-flight temporary files are never listed or readable', async () => {
    await store.put('a/real', new Uint8Array([1]));
    await writeFile(path.join(dataRoot, 'a', 'x.rlms-tmp'), 'partial');

    const listed = await store.list('');
    expect(listed.ok && listed.value.map((info) => info.key)).toEqual([
      'a/real',
    ]);
    const head = await store.head('a/x.rlms-tmp');
    expect(!head.ok && head.error.code).toBe('invalid_key');
  });

  test('a key ending in the temporary suffix is refused by every operation', async () => {
    const key = 'pkg/bundle.rlms-tmp';

    const put = await store.put(key, new Uint8Array([1]));
    expect(!put.ok && put.error.code).toBe('invalid_key');
    expect(!put.ok && put.error.message).toContain('.rlms-tmp');
    expect(!put.ok && put.error.message).toContain('reserved');
    const head = await store.head(key);
    expect(!head.ok && head.error.code).toBe('invalid_key');
    const get = await store.get(key);
    expect(!get.ok && get.error.code).toBe('invalid_key');
    const removed = await store.remove(key);
    expect(!removed.ok && removed.error.code).toBe('invalid_key');
    // Nothing was written, so there is nothing hidden to clean up later.
    expect(await readdir(dataRoot)).toEqual([]);
  });

  test('removing the last object prunes its empty directories', async () => {
    await store.put('deep/er/file', new Uint8Array([1]));
    await store.remove('deep/er/file');
    expect(await readdir(dataRoot)).toEqual([]);
  });

  test('a directory is not an object', async () => {
    await store.put('dir/file', new Uint8Array([1]));
    const head = await store.head('dir');
    expect(!head.ok && head.error.code).toBe('not_found');
    const removed = await store.remove('dir');
    expect(removed.ok).toBe(true);
    const still = await store.head('dir/file');
    expect(still.ok).toBe(true);
  });

  test('an abandoned body holds no file handle and cannot fail later', async () => {
    await store.put('abandoned', new Uint8Array(10));
    const opened = await store.get('abandoned');
    expect(opened.ok).toBe(true);

    await rm(dataRoot, { recursive: true, force: true });
    // Nothing was iterated, so the deleted file is never touched.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  test('an aborted signal stops a read', async () => {
    await store.put('big', new Uint8Array(1024 * 1024));
    const controller = new AbortController();
    const opened = await store.get('big', { signal: controller.signal });
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    controller.abort();
    await expect(
      (async () => {
        for await (const chunk of opened.value.body) {
          void chunk;
        }
      })(),
    ).rejects.toThrow('aborted');
  });
});
