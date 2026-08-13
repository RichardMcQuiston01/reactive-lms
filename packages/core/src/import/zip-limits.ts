import {
  LmsError,
  PACKAGE_INVALID_ZIP,
  PACKAGE_ZIP_BOMB,
  httpStatusForLmsCode,
} from '@reactive-lms/shared';
import { unzipSync } from 'fflate';

/** Default uncompressed ZIP size limit (200 MiB). */
export const DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

/** Default ZIP member count limit. */
export const DEFAULT_MAX_ZIP_FILE_COUNT = 10_000;

/**
 * ZIP central-directory members used for bomb checks (no payload inflate).
 */
export interface ZipMemberInfo {
  /** Entry path inside the archive. */
  name: string;
  /** Uncompressed size from the ZIP header. */
  originalSize: number;
}

/**
 * Lists non-directory ZIP members without inflating their payloads.
 *
 * @param buffer - ZIP bytes
 * @throws {@link LmsError} `PACKAGE_INVALID_ZIP` when the buffer is not a ZIP
 */
export function listZipMembers(buffer: Uint8Array): ZipMemberInfo[] {
  const members: ZipMemberInfo[] = [];
  try {
    unzipSync(buffer, {
      filter(file) {
        if (!file.name || file.name.endsWith('/')) {
          return false;
        }
        members.push({
          name: file.name,
          originalSize: file.originalSize,
        });
        return false;
      },
    });
  } catch (error) {
    if (error instanceof LmsError) {
      throw error;
    }
    throw new LmsError({
      status: httpStatusForLmsCode(PACKAGE_INVALID_ZIP),
      code: PACKAGE_INVALID_ZIP,
      message: 'Uploaded file is not a valid ZIP archive.',
      details: error,
    });
  }
  return members;
}

/**
 * Rejects archives over the uncompressed-size or file-count limits.
 *
 * @param buffer - ZIP bytes
 * @param limits - Optional overrides (defaults are 200 MiB / 10_000 files)
 */
export function assertZipNotBomb(
  buffer: Uint8Array,
  limits?: {
    maxUncompressedBytes?: number;
    maxFileCount?: number;
  },
): ZipMemberInfo[] {
  const maxFileCount = limits?.maxFileCount ?? DEFAULT_MAX_ZIP_FILE_COUNT;
  const maxUncompressedBytes =
    limits?.maxUncompressedBytes ?? DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES;
  const members = listZipMembers(buffer);
  const fileCount = members.length;
  const uncompressed = members.reduce(
    (sum, member) => sum + member.originalSize,
    0,
  );

  if (fileCount > maxFileCount || uncompressed > maxUncompressedBytes) {
    throw new LmsError({
      status: httpStatusForLmsCode(PACKAGE_ZIP_BOMB),
      code: PACKAGE_ZIP_BOMB,
      message: 'Archive exceeds the uncompressed size or file-count limit.',
      details: {
        fileCount,
        uncompressedBytes: uncompressed,
        maxFileCount,
        maxUncompressedBytes,
      },
    });
  }

  return members;
}

/**
 * Inflates a single ZIP member by name. Other payloads stay compressed.
 *
 * @param buffer - ZIP bytes
 * @param name - Archive member path
 * @returns Member bytes, or `undefined` if the name is absent
 */
export function readZipMember(
  buffer: Uint8Array,
  name: string,
): Uint8Array | undefined {
  const wanted = name.replace(/\\/g, '/').replace(/^\/+/, '');
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(buffer, {
      filter(file) {
        const candidate = file.name.replace(/\\/g, '/').replace(/^\/+/, '');
        return (
          candidate === wanted ||
          candidate.toLowerCase() === wanted.toLowerCase()
        );
      },
    });
  } catch (error) {
    throw new LmsError({
      status: httpStatusForLmsCode(PACKAGE_INVALID_ZIP),
      code: PACKAGE_INVALID_ZIP,
      message: 'Uploaded file is not a valid ZIP archive.',
      details: error,
    });
  }

  return unzipped[name] ?? unzipped[wanted] ?? Object.values(unzipped)[0];
}
