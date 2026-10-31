import {
  collectBlobBody,
  compareBlobKeys,
  normalizeBlobKey,
  normalizeBlobPrefix,
  type BlobBody,
  type BlobInfo,
  type BlobObject,
  type BlobResult,
  type BlobStorageAdapter,
  type GetBlobOptions,
  type PutBlobOptions,
} from '@richardmcquiston01/reactive-lms-shared';

interface StoredBlob {
  bytes: Uint8Array;
  contentType?: string;
}

/**
 * `BlobStorageAdapter` that keeps objects in memory. It is the reference
 * implementation of the contract and the store tests use; do not use it where
 * content must survive a restart.
 */
export class MemoryBlobStorageAdapter implements BlobStorageAdapter {
  private readonly objects = new Map<string, StoredBlob>();

  async put(
    key: string,
    body: BlobBody,
    options: PutBlobOptions = {},
  ): Promise<BlobResult<BlobInfo>> {
    const normalized = normalizeBlobKey(key);
    if (!normalized.ok) {
      return normalized;
    }
    let bytes: Uint8Array;
    try {
      // Collect first so a stream that fails midway stores nothing.
      bytes = new Uint8Array(await collectBlobBody(body));
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'io',
          message: `Writing "${normalized.value}" failed: ${describe(error)}`,
          key: normalized.value,
        },
      };
    }
    this.objects.set(normalized.value, {
      bytes,
      contentType: options.contentType,
    });
    return { ok: true, value: infoFor(normalized.value, this.objects) };
  }

  async get(
    key: string,
    options: GetBlobOptions = {},
  ): Promise<BlobResult<BlobObject>> {
    const normalized = normalizeBlobKey(key);
    if (!normalized.ok) {
      return normalized;
    }
    const stored = this.objects.get(normalized.value);
    if (!stored) {
      return notFound(normalized.value);
    }
    const info = infoFor(normalized.value, this.objects);
    const size = stored.bytes.byteLength;

    if (!options.range) {
      return { ok: true, value: { info, body: chunks(stored.bytes) } };
    }
    const { start } = options.range;
    if (start < 0 || start >= size) {
      return {
        ok: false,
        error: {
          code: 'invalid_range',
          message: `Range start ${start} is outside "${normalized.value}" (${size} bytes).`,
          key: normalized.value,
        },
      };
    }
    const end = Math.min(options.range.end ?? size - 1, size - 1);
    return {
      ok: true,
      value: {
        info,
        body: chunks(stored.bytes.subarray(start, end + 1)),
        range: { start, end },
      },
    };
  }

  async head(key: string): Promise<BlobResult<BlobInfo>> {
    const normalized = normalizeBlobKey(key);
    if (!normalized.ok) {
      return normalized;
    }
    if (!this.objects.has(normalized.value)) {
      return notFound(normalized.value);
    }
    return { ok: true, value: infoFor(normalized.value, this.objects) };
  }

  async list(prefix: string): Promise<BlobResult<BlobInfo[]>> {
    const normalized = normalizeBlobPrefix(prefix);
    if (!normalized.ok) {
      return normalized;
    }
    const keys = [...this.objects.keys()]
      .filter((key) => key.startsWith(normalized.value))
      .sort(compareBlobKeys);
    return {
      ok: true,
      value: keys.map((key) => infoFor(key, this.objects)),
    };
  }

  async remove(key: string): Promise<BlobResult<void>> {
    const normalized = normalizeBlobKey(key);
    if (!normalized.ok) {
      return normalized;
    }
    this.objects.delete(normalized.value);
    return { ok: true, value: undefined };
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
    let removed = 0;
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(normalized.value)) {
        this.objects.delete(key);
        removed += 1;
      }
    }
    return { ok: true, value: removed };
  }
}

function infoFor(key: string, objects: Map<string, StoredBlob>): BlobInfo {
  const stored = objects.get(key);
  return {
    key,
    size: stored?.bytes.byteLength ?? 0,
    ...(stored?.contentType === undefined
      ? {}
      : { contentType: stored.contentType }),
  };
}

function notFound(key: string): BlobResult<never> {
  return {
    ok: false,
    error: { code: 'not_found', message: `No object stored at "${key}".`, key },
  };
}

async function* chunks(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  const size = 64 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += size) {
    yield bytes.subarray(offset, offset + size);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
