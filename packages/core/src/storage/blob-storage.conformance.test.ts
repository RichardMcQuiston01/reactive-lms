import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runBlobStorageConformance } from '../testing/blob-storage-conformance';
import { FilesystemBlobStorageAdapter } from './filesystem-blob-storage.adapter';
import { MemoryBlobStorageAdapter } from './memory-blob-storage.adapter';

runBlobStorageConformance('MemoryBlobStorageAdapter', async () => ({
  adapter: new MemoryBlobStorageAdapter(),
}));

runBlobStorageConformance('FilesystemBlobStorageAdapter', async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'rlms-blob-'));
  return {
    adapter: new FilesystemBlobStorageAdapter(dataRoot),
    cleanup: () => rm(dataRoot, { recursive: true, force: true }),
  };
});
