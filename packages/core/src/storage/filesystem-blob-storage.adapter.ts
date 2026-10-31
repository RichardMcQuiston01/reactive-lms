import { createWriteStream } from 'node:fs';
import {
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  compareBlobKeys,
  normalizeBlobKey,
  normalizeBlobPrefix,
  type BlobBody,
  type BlobError,
  type BlobInfo,
  type BlobObject,
  type BlobResult,
  type BlobStorageAdapter,
  type GetBlobOptions,
  type PutBlobOptions,
} from '@richardmcquiston01/reactive-lms-shared';

/** Suffix of in-flight writes; such files are never listed or read. */
const TEMP_SUFFIX = '.rlms-tmp';

/**
 * `BlobStorageAdapter` that stores objects as files under a data root that is
 * not served by the web server. Writes go to a temporary file and are renamed
 * into place, so a failed write never leaves a partial object at the key.
 *
 * Content types are not recorded; the serving layer derives them from the key.
 */
export class FilesystemBlobStorageAdapter implements BlobStorageAdapter {
  private readonly root: string;

  /**
   * @param dataRoot - Directory that owns every stored key
   */
  constructor(dataRoot: string) {
    this.root = path.resolve(dataRoot);
  }

  async put(
    key: string,
    body: BlobBody,
    options: PutBlobOptions = {},
  ): Promise<BlobResult<BlobInfo>> {
    const normalized = normalizeBlobKey(key);
    if (!normalized.ok) {
      return normalized;
    }
    const dest = this.resolve(normalized.value);
    if (!dest.ok) {
      return dest;
    }

    const temp = `${dest.value}.${randomUUID()}${TEMP_SUFFIX}`;
    try {
      await mkdir(path.dirname(dest.value), { recursive: true });
      if (body instanceof Uint8Array) {
        await writeFile(temp, body, { signal: asNodeSignal(options.signal) });
      } else {
        await pipeline(Readable.from(body), createWriteStream(temp), {
          signal: asNodeSignal(options.signal),
        });
      }
      await rename(temp, dest.value);
      const stats = await stat(dest.value);
      return { ok: true, value: { key: normalized.value, size: stats.size } };
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      return ioError('Writing', normalized.value, error);
    }
  }

  async get(
    key: string,
    options: GetBlobOptions = {},
  ): Promise<BlobResult<BlobObject>> {
    const info = await this.head(key);
    if (!info.ok) {
      return info;
    }
    const dest = this.resolve(info.value.key);
    if (!dest.ok) {
      return dest;
    }
    const size = info.value.size;

    if (!options.range) {
      return {
        ok: true,
        value: {
          info: info.value,
          body: readFileChunks(dest.value, 0, size - 1, options.signal),
        },
      };
    }

    const { start } = options.range;
    if (start < 0 || start >= size) {
      return {
        ok: false,
        error: {
          code: 'invalid_range',
          message: `Range start ${start} is outside "${info.value.key}" (${size} bytes).`,
          key: info.value.key,
        },
      };
    }
    const end = Math.min(options.range.end ?? size - 1, size - 1);
    return {
      ok: true,
      value: {
        info: info.value,
        body: readFileChunks(dest.value, start, end, options.signal),
        range: { start, end },
      },
    };
  }

  async head(key: string): Promise<BlobResult<BlobInfo>> {
    const normalized = normalizeBlobKey(key);
    if (!normalized.ok) {
      return normalized;
    }
    if (normalized.value.endsWith(TEMP_SUFFIX)) {
      return notFound(normalized.value);
    }
    const dest = this.resolve(normalized.value);
    if (!dest.ok) {
      return dest;
    }
    try {
      const stats = await stat(dest.value);
      if (!stats.isFile()) {
        return notFound(normalized.value);
      }
      return { ok: true, value: { key: normalized.value, size: stats.size } };
    } catch (error) {
      if (isMissing(error)) {
        return notFound(normalized.value);
      }
      return ioError('Reading', normalized.value, error);
    }
  }

  async list(prefix: string): Promise<BlobResult<BlobInfo[]>> {
    const normalized = normalizeBlobPrefix(prefix);
    if (!normalized.ok) {
      return normalized;
    }
    // Start at the deepest directory the prefix names, then filter as text.
    const lastSlash = normalized.value.lastIndexOf('/');
    const directory =
      lastSlash >= 0 ? normalized.value.slice(0, lastSlash) : '';
    const base = this.resolve(directory === '' ? '.' : directory, true);
    if (!base.ok) {
      return base;
    }

    const found: BlobInfo[] = [];
    try {
      await this.walk(base.value, directory, normalized.value, found);
    } catch (error) {
      if (isMissing(error)) {
        return { ok: true, value: [] };
      }
      return ioError('Listing', normalized.value, error);
    }
    found.sort((left, right) => compareBlobKeys(left.key, right.key));
    return { ok: true, value: found };
  }

  async remove(key: string): Promise<BlobResult<void>> {
    const normalized = normalizeBlobKey(key);
    if (!normalized.ok) {
      return normalized;
    }
    const dest = this.resolve(normalized.value);
    if (!dest.ok) {
      return dest;
    }
    try {
      const stats = await stat(dest.value);
      if (stats.isFile()) {
        await unlink(dest.value);
        await this.pruneEmptyDirectories(path.dirname(dest.value));
      }
      return { ok: true, value: undefined };
    } catch (error) {
      if (isMissing(error)) {
        return { ok: true, value: undefined };
      }
      return ioError('Removing', normalized.value, error);
    }
  }

  async removePrefix(prefix: string): Promise<BlobResult<number>> {
    const normalized = normalizeBlobPrefix(prefix);
    if (!normalized.ok) {
      return normalized;
    }
    if (normalized.value === '') {
      return {
        ok: false,
        error: {
          code: 'invalid_key',
          message: 'removePrefix needs a non-empty prefix.',
        },
      };
    }
    const listed = await this.list(normalized.value);
    if (!listed.ok) {
      return listed;
    }
    let removed = 0;
    for (const info of listed.value) {
      const result = await this.remove(info.key);
      if (!result.ok) {
        return result;
      }
      removed += 1;
    }
    return { ok: true, value: removed };
  }

  private async walk(
    directory: string,
    keyPrefix: string,
    filter: string,
    found: BlobInfo[],
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const key = keyPrefix === '' ? entry.name : `${keyPrefix}/${entry.name}`;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        // Descend only when the directory can still contain a match.
        if (`${key}/`.startsWith(filter) || filter.startsWith(`${key}/`)) {
          await this.walk(full, key, filter, found);
        }
      } else if (
        entry.isFile() &&
        !entry.name.endsWith(TEMP_SUFFIX) &&
        key.startsWith(filter)
      ) {
        const stats = await stat(full);
        found.push({ key, size: stats.size });
      }
    }
  }

  private async pruneEmptyDirectories(start: string): Promise<void> {
    let current = start;
    while (current !== this.root && current.startsWith(this.root)) {
      try {
        await rmdir(current);
      } catch {
        return;
      }
      current = path.dirname(current);
    }
  }

  private resolve(key: string, allowRoot = false): BlobResult<string> {
    const full = path.resolve(this.root, ...key.split('/'));
    const relative = path.relative(this.root, full);
    const escapes = relative.startsWith('..') || path.isAbsolute(relative);
    if (escapes || (!allowRoot && relative === '')) {
      return {
        ok: false,
        error: {
          code: 'invalid_key',
          message: `Storage key "${key}" must stay under the data root.`,
          key,
        },
      };
    }
    return { ok: true, value: full };
  }
}

/** Bytes read from disk per chunk. */
const READ_CHUNK_BYTES = 64 * 1024;

/**
 * Streams an inclusive byte range of a file. The file is opened only when
 * iteration starts and is always closed, including when the consumer stops
 * early, so an abandoned body holds no file handle and cannot fail later.
 */
async function* readFileChunks(
  file: string,
  start: number,
  end: number,
  signal: PutBlobOptions['signal'],
): AsyncIterable<Uint8Array> {
  if (end < start) {
    return;
  }
  const handle = await open(file, 'r');
  try {
    let position = start;
    while (position <= end) {
      if (signal?.aborted) {
        throw new Error(`Reading "${file}" was aborted.`);
      }
      const length = Math.min(READ_CHUNK_BYTES, end - position + 1);
      const buffer = new Uint8Array(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      if (bytesRead === 0) {
        return;
      }
      yield bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
}

function notFound(key: string): BlobResult<never> {
  return {
    ok: false,
    error: { code: 'not_found', message: `No object stored at "${key}".`, key },
  };
}

function ioError(
  action: string,
  key: string,
  error: unknown,
): { ok: false; error: BlobError } {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    error: { code: 'io', message: `${action} "${key}" failed: ${reason}`, key },
  };
}

function isMissing(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Node's fs APIs accept a real `AbortSignal`; the contract's structural type
 * is satisfied by one, so this only narrows the type.
 */
function asNodeSignal(
  signal: PutBlobOptions['signal'],
): AbortSignal | undefined {
  return signal as AbortSignal | undefined;
}
