import type { PackageFileIndex } from '@richardmcquiston01/reactive-lms-shared';
import { assertZipNotBomb, readZipMember } from './zip-limits';

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
    map.set(normalized, typeof body === 'string' ? encoder.encode(body) : body);
  }
  return createMapFileIndex(map);
}

/**
 * Builds a {@link PackageFileIndex} from ZIP central-directory names.
 * Member bodies are inflated only when {@link PackageFileIndex.read} is called.
 *
 * @param buffer - ZIP bytes
 * @param limits - Size and file-count limits; defaults when omitted. Pass the
 *   importer's configured limits so they apply to this first check too, not
 *   only to the later extraction.
 * @throws LmsError when the buffer is not a valid ZIP or is a ZIP bomb
 */
export function createZipFileIndex(
  buffer: Uint8Array,
  limits?: { maxUncompressedBytes?: number; maxFileCount?: number },
): PackageFileIndex {
  const members = assertZipNotBomb(buffer, limits);
  const names = new Map<string, string>();
  for (const member of members) {
    const normalized = normalizePackagePath(member.name);
    if (!normalized || normalized.endsWith('/')) {
      continue;
    }
    names.set(normalized, member.name);
  }

  const cache = new Map<string, Uint8Array>();
  return {
    paths: [...names.keys()],
    has(path: string): boolean {
      return names.has(normalizePackagePath(path));
    },
    read(path: string): Uint8Array | undefined {
      const normalized = normalizePackagePath(path);
      const cached = cache.get(normalized);
      if (cached) {
        return cached;
      }
      const storedName = names.get(normalized);
      if (!storedName) {
        return undefined;
      }
      const bytes = readZipMember(buffer, storedName);
      if (bytes) {
        cache.set(normalized, bytes);
      }
      return bytes;
    },
  };
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
