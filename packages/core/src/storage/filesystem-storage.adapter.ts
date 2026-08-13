import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LmsError, type StorageAdapter } from '@reactive-lms/shared';
import { unzipSync } from 'fflate';
import {
  DEFAULT_MAX_ZIP_FILE_COUNT,
  DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES,
  assertZipNotBomb,
} from '../import/zip-limits';

export {
  DEFAULT_MAX_ZIP_FILE_COUNT,
  DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES,
};

/** Public URL prefix used when no override is supplied. */
export const DEFAULT_PUBLIC_URL_PREFIX = '/lms/content';

/**
 * Optional filesystem storage knobs.
 */
export interface FilesystemStorageOptions {
  /**
   * Invoked with the bytes passed to {@link FilesystemStorageAdapter.put}
   * (the original archive during import).
   */
  antivirusScan?: (buf: Uint8Array) => Promise<void>;
  /** Override for tests; production default is 200 MiB. */
  maxUncompressedBytes?: number;
  /** Override for tests; production default is 10_000. */
  maxFileCount?: number;
  /** Prefix for {@link FilesystemStorageAdapter.getPublicUrl}. */
  publicUrlPrefix?: string;
}

/**
 * `StorageAdapter` that writes under a constructor dataroot (not the web root).
 */
export class FilesystemStorageAdapter implements StorageAdapter {
  private readonly dataRoot: string;
  private readonly antivirusScan?: (buf: Uint8Array) => Promise<void>;
  private readonly maxUncompressedBytes: number;
  private readonly maxFileCount: number;
  private readonly publicUrlPrefix: string;

  /**
   * @param dataRoot - Absolute or relative directory that owns all stored keys
   * @param options - Optional antivirus hook and ZIP-bomb limits
   */
  constructor(dataRoot: string, options: FilesystemStorageOptions = {}) {
    this.dataRoot = dataRoot;
    this.antivirusScan = options.antivirusScan;
    this.maxUncompressedBytes =
      options.maxUncompressedBytes ?? DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES;
    this.maxFileCount = options.maxFileCount ?? DEFAULT_MAX_ZIP_FILE_COUNT;
    this.publicUrlPrefix = (
      options.publicUrlPrefix ?? DEFAULT_PUBLIC_URL_PREFIX
    ).replace(/\/+$/, '');
  }

  /**
   * Stores bytes under the dataroot. Runs `antivirusScan` when configured.
   *
   * @param key - Storage key
   * @param body - File contents
   */
  async put(key: string, body: Uint8Array): Promise<void> {
    await this.antivirusScan?.(body);
    const dest = this.resolveKey(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
  }

  /**
   * Reads bytes previously stored under the key.
   *
   * @param key - Storage key
   */
  async get(key: string): Promise<Uint8Array> {
    const dest = this.resolveKey(key);
    try {
      const buffer = await readFile(dest);
      return new Uint8Array(buffer);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      if (code === 'ENOENT') {
        throw new LmsError({
          status: 404,
          code: 'STORAGE_KEY_NOT_FOUND',
          message: `No object stored at key: ${key}`,
        });
      }
      throw error;
    }
  }

  /**
   * Returns a relative content URL for the key (`/lms/content/...`).
   *
   * @param key - Storage key
   */
  async getPublicUrl(key: string): Promise<string> {
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${this.publicUrlPrefix}/${normalized}`;
  }

  /**
   * Extracts a stored ZIP under `destPrefix`.
   * Rejects archives with more than the file-count or uncompressed-size limits.
   *
   * @param key - Key of the archive
   * @param destPrefix - Destination key prefix for extracted files
   * @returns Relative paths of extracted files under the destination
   */
  async extractZip(key: string, destPrefix: string): Promise<string[]> {
    const archive = await this.get(key);
    assertZipNotBomb(archive, {
      maxFileCount: this.maxFileCount,
      maxUncompressedBytes: this.maxUncompressedBytes,
    });

    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(archive);
    } catch (error) {
      throw new LmsError({
        status: 400,
        code: 'PACKAGE_INVALID_ZIP',
        message: 'Stored object is not a valid ZIP archive.',
        details: error,
      });
    }

    const extracted: string[] = [];
    const prefix = destPrefix.replace(/\\/g, '/').replace(/\/+$/, '');

    for (const [rawName, data] of Object.entries(unzipped)) {
      const relative = sanitizeZipEntryName(rawName);
      if (!relative) {
        continue;
      }
      const destKey = prefix ? `${prefix}/${relative}` : relative;
      await this.writeExtracted(destKey, data);
      extracted.push(relative);
    }

    return extracted;
  }

  private async writeExtracted(
    key: string,
    body: Uint8Array,
  ): Promise<void> {
    const dest = this.resolveKey(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
  }

  private resolveKey(key: string): string {
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.some((part) => part === '..')) {
      throw new LmsError({
        status: 400,
        code: 'STORAGE_KEY_INVALID',
        message: 'Storage key must stay under the data root.',
        details: { key },
      });
    }

    const full = path.resolve(this.dataRoot, ...parts);
    const root = path.resolve(this.dataRoot);
    const relative = path.relative(root, full);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new LmsError({
        status: 400,
        code: 'STORAGE_KEY_INVALID',
        message: 'Storage key must stay under the data root.',
        details: { key },
      });
    }
    return full;
  }
}

function sanitizeZipEntryName(name: string): string | undefined {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.endsWith('/')) {
    return undefined;
  }
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  if (parts.length === 0 || parts.some((part) => part === '..')) {
    throw new LmsError({
      status: 400,
      code: 'PACKAGE_INVALID_ZIP',
      message: 'Archive contains an unsafe path.',
      details: { name },
    });
  }
  return parts.join('/');
}
