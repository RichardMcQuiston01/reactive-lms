import {
  LmsError,
  PACKAGE_INVALID_ZIP,
  httpStatusForLmsCode,
  type BlobStorageAdapter,
} from '@richardmcquiston01/reactive-lms-shared';
import { unzipSync } from 'fflate';
import { contentTypeForKey } from '../content/content-serving';
import { requireBlob } from '../storage/require-blob';
import {
  DEFAULT_MAX_ZIP_FILE_COUNT,
  DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES,
  assertZipNotBomb,
} from './zip-limits';

/**
 * Limits applied while extracting an untrusted archive.
 */
export interface ZipExtractionLimits {
  /** Maximum total uncompressed size. Defaults to 200 MiB. */
  maxUncompressedBytes?: number;
  /** Maximum number of entries. Defaults to 10,000. */
  maxFileCount?: number;
}

/**
 * Extracts a ZIP archive into a blob store under `destPrefix`.
 *
 * Extraction lives here rather than in a storage adapter so every adapter
 * stays storage-only and every store gets the same zip-bomb limits, path
 * checks, and content types.
 *
 * @param storage - Store that receives the extracted files
 * @param archive - ZIP bytes
 * @param destPrefix - Key prefix for the extracted files
 * @param limits - Zip-bomb limits
 * @returns Relative paths of the extracted files
 * @throws LmsError `PACKAGE_ZIP_BOMB`, `PACKAGE_INVALID_ZIP`, or a storage error
 */
export async function extractZipToStorage(
  storage: BlobStorageAdapter,
  archive: Uint8Array,
  destPrefix: string,
  limits: ZipExtractionLimits = {},
): Promise<string[]> {
  assertZipNotBomb(archive, {
    maxFileCount: limits.maxFileCount ?? DEFAULT_MAX_ZIP_FILE_COUNT,
    maxUncompressedBytes:
      limits.maxUncompressedBytes ?? DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES,
  });

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(archive);
  } catch (error) {
    throw new LmsError({
      status: httpStatusForLmsCode(PACKAGE_INVALID_ZIP),
      code: PACKAGE_INVALID_ZIP,
      message: 'The uploaded file is not a valid ZIP archive.',
      details: error,
    });
  }

  const prefix = destPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  const extracted: string[] = [];

  for (const [rawName, data] of Object.entries(unzipped)) {
    const relative = sanitizeZipEntryName(rawName);
    if (!relative) {
      continue;
    }
    const key = prefix ? `${prefix}/${relative}` : relative;
    requireBlob(
      await storage.put(key, data, { contentType: contentTypeForKey(key) }),
    );
    extracted.push(relative);
  }

  return extracted;
}

function sanitizeZipEntryName(name: string): string | undefined {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.endsWith('/')) {
    return undefined;
  }
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  if (parts.length === 0 || parts.some((part) => part === '..')) {
    throw new LmsError({
      status: httpStatusForLmsCode(PACKAGE_INVALID_ZIP),
      code: PACKAGE_INVALID_ZIP,
      message: `Archive contains an unsafe path: "${name}".`,
      details: { name },
    });
  }
  return parts.join('/');
}
