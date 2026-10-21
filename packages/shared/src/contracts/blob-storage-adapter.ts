/**
 * The part of the standard `AbortSignal` that adapters rely on. Declared here
 * because this package targets plain ES2022 and must not depend on DOM or
 * Node typings; a real `AbortSignal` satisfies it.
 */
export interface BlobAbortSignal {
  /** True once the operation has been aborted. */
  readonly aborted: boolean;
  /** Registers a listener for the abort event. */
  addEventListener(type: 'abort', listener: () => void): void;
  /** Removes a listener added with `addEventListener`. */
  removeEventListener(type: 'abort', listener: () => void): void;
}

/**
 * Machine-readable reason a blob operation failed.
 *
 * - `not_found`: no object exists at the key
 * - `invalid_key`: the key is empty, escapes the store, or is otherwise unsafe
 * - `invalid_range`: a requested byte range starts past the end of the object
 * - `io`: the backing store failed (disk, network, permissions)
 */
export type BlobErrorCode =
  'not_found' | 'invalid_key' | 'invalid_range' | 'io';

/**
 * Why a blob operation failed. Messages name the key and the cause so they are
 * useful in logs without further context.
 */
export interface BlobError {
  /** Machine-readable reason. */
  code: BlobErrorCode;
  /** Human-readable description naming the key and the cause. */
  message: string;
  /** Key the operation was working on, when there was one. */
  key?: string;
}

/**
 * Outcome of a blob operation. Adapters never throw; callers must check `ok`.
 */
export type BlobResult<T> =
  { ok: true; value: T } | { ok: false; error: BlobError };

/**
 * Metadata for one stored object.
 */
export interface BlobInfo {
  /** Normalized key (see {@link normalizeBlobKey}). */
  key: string;
  /** Size in bytes. */
  size: number;
  /** Media type when the store records one; filesystem stores do not. */
  contentType?: string;
}

/**
 * A stored object's metadata and its content as a byte stream.
 */
export interface BlobObject {
  /** Metadata for the whole object, even when only a range is streamed. */
  info: BlobInfo;
  /** Bytes of the object, or of the requested range. */
  body: AsyncIterable<Uint8Array>;
  /** Present when a range was requested: the inclusive byte range streamed. */
  range?: { start: number; end: number };
}

/**
 * Bytes to store: a buffer, or a stream that is consumed once.
 */
export type BlobBody = Uint8Array | AsyncIterable<Uint8Array>;

/**
 * Options for {@link BlobStorageAdapter.put}.
 */
export interface PutBlobOptions {
  /** Media type to record, for stores that keep one. */
  contentType?: string;
  /** Aborts the write. */
  signal?: BlobAbortSignal;
}

/**
 * Options for {@link BlobStorageAdapter.get}.
 */
export interface GetBlobOptions {
  /**
   * Inclusive byte range to stream. `end` defaults to the last byte and is
   * clamped to the object. A `start` past the last byte fails with
   * `invalid_range`.
   */
  range?: { start: number; end?: number };
  /** Aborts the read. */
  signal?: BlobAbortSignal;
}

/**
 * Options for {@link BlobStorageAdapter.list}.
 */
export interface ListBlobOptions {
  /** Aborts the listing. */
  signal?: BlobAbortSignal;
}

/**
 * Storage for imported package files: the original archive, extracted
 * content, and shared libraries.
 *
 * The contract is key-based and stream-based, exposes no local file paths, and
 * returns results instead of throwing, so a filesystem, S3-compatible, or host
 * store can implement it interchangeably. Content is always served through the
 * API from our own origin, so there is no public-URL method.
 *
 * Every adapter must pass the shared conformance suite in
 * `@richardmcquiston01/reactive-lms-core/testing`.
 */
export interface BlobStorageAdapter {
  /**
   * Stores bytes under the key, replacing any existing object. A failed write
   * must not leave a partial object visible at the key.
   *
   * @param key - Object key; normalized with {@link normalizeBlobKey}
   * @param body - Bytes or a stream consumed once
   * @param options - Content type and abort signal
   */
  put(
    key: string,
    body: BlobBody,
    options?: PutBlobOptions,
  ): Promise<BlobResult<BlobInfo>>;

  /**
   * Opens an object for reading.
   *
   * @param key - Object key
   * @param options - Optional byte range and abort signal
   */
  get(key: string, options?: GetBlobOptions): Promise<BlobResult<BlobObject>>;

  /**
   * Reads an object's metadata without its content.
   *
   * @param key - Object key
   */
  head(key: string): Promise<BlobResult<BlobInfo>>;

  /**
   * Lists objects whose key starts with `prefix`, sorted by key in plain
   * code-unit order. The prefix is matched as text, never as a pattern, and
   * `''` lists everything.
   *
   * @param prefix - Key prefix
   * @param options - Optional abort signal
   */
  list(
    prefix: string,
    options?: ListBlobOptions,
  ): Promise<BlobResult<BlobInfo[]>>;

  /**
   * Deletes one object. A missing key is not an error.
   *
   * @param key - Object key
   */
  remove(key: string): Promise<BlobResult<void>>;

  /**
   * Deletes every object whose key starts with `prefix`.
   *
   * @param prefix - Key prefix; must not be empty
   * @returns How many objects were deleted
   */
  removePrefix(prefix: string): Promise<BlobResult<number>>;
}
