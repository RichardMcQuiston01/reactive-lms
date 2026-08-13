import {
  LmsError,
  type PackageFileIndex,
} from '@reactive-lms/shared';
import { unzipSync } from 'fflate';
import { assertZipNotBomb } from './zip-limits';

/**
 * Normalizes a package-relative path to forward slashes without a leading `./`.
 *
 * @param path - Raw path from a ZIP entry or caller
 * @returns Normalized relative path
 */
export function normalizePackagePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Builds an in-memory {@link PackageFileIndex} from string or byte contents.
 *
 * @param files - Map of relative path → file body
 */
export function createMemoryFileIndex(
  files: Record<string, string | Uint8Array>,
): PackageFileIndex {
  const encoder = new TextEncoder();
  const map = new Map<string, Uint8Array>();
  for (const [path, body] of Object.entries(files)) {
    const normalized = normalizePackagePath(path);
    if (!normalized || normalized.endsWith('/')) {
      continue;
    }
    map.set(
      normalized,
      typeof body === 'string' ? encoder.encode(body) : body,
    );
  }
  return createMapFileIndex(map);
}

/**
 * Builds a {@link PackageFileIndex} from a ZIP buffer.
 * Paths stay as stored in the archive so they match extracted keys.
 *
 * @param buffer - ZIP bytes
 * @throws LmsError when the buffer is not a valid ZIP or is a ZIP bomb
 */
export function createZipFileIndex(buffer: Uint8Array): PackageFileIndex {
  assertZipNotBomb(buffer);

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(buffer);
  } catch (error) {
    throw new LmsError({
      status: 400,
      code: 'PACKAGE_INVALID_ZIP',
      message: 'Uploaded file is not a valid ZIP archive.',
      details: error,
    });
  }

  const files = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(unzipped)) {
    const normalized = normalizePackagePath(path);
    if (!normalized || normalized.endsWith('/')) {
      continue;
    }
    files.set(normalized, data);
  }

  return createMapFileIndex(files);
}

function createMapFileIndex(files: Map<string, Uint8Array>): PackageFileIndex {
  return {
    paths: [...files.keys()],
    has(path: string): boolean {
      return files.has(normalizePackagePath(path));
    },
    read(path: string): Uint8Array | undefined {
      return files.get(normalizePackagePath(path));
    },
  };
}
