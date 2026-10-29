/**
 * Why a cache operation failed. Messages name the key and the cause.
 */
export interface CacheError {
  /** Machine-readable reason: `io` for any backing-store failure. */
  code: 'io' | 'invalid_key';
  /** Human-readable description naming the key and the cause. */
  message: string;
  /** Key the operation was working on. */
  key: string;
}

/**
 * Outcome of a cache operation. Adapters never throw; callers must check `ok`.
 */
export type CacheResult<T> =
  { ok: true; value: T } | { ok: false; error: CacheError };

/**
 * Options for {@link CacheAdapter.set} and {@link CacheAdapter.setIfAbsent}.
 */
export interface CacheSetOptions {
  /** Entry lifetime in milliseconds. Omit to keep the entry until deleted. */
  ttlMs?: number;
}

/**
 * Small string key-value state with expiry, used for one-time tokens (cmi5)
 * and nonces (LTI). The in-memory adapter ships with ReactiveLMS; a host
 * running several API processes injects a shared one (e.g. Redis), because
 * single-use guarantees only hold when every process sees the same store.
 *
 * Values are strings so any backend can hold them; callers serialize JSON.
 */
export interface CacheAdapter {
  /**
   * Reads a value.
   *
   * @param key - Cache key
   * @returns The value, or `undefined` when absent or expired
   */
  get(key: string): Promise<CacheResult<string | undefined>>;

  /**
   * Writes a value, replacing any existing one.
   *
   * @param key - Cache key
   * @param value - Value to store
   * @param options - Expiry
   */
  set(
    key: string,
    value: string,
    options?: CacheSetOptions,
  ): Promise<CacheResult<void>>;

  /**
   * Writes a value only if no live entry exists. Use it to claim a nonce.
   *
   * @param key - Cache key
   * @param value - Value to store
   * @param options - Expiry
   * @returns `true` when stored, `false` when a live entry already existed
   */
  setIfAbsent(
    key: string,
    value: string,
    options?: CacheSetOptions,
  ): Promise<CacheResult<boolean>>;

  /**
   * Reads and removes a value in one step. Use it to redeem a one-time token:
   * of two concurrent callers, only one receives the value.
   *
   * @param key - Cache key
   * @returns The value, or `undefined` when absent or expired
   */
  take(key: string): Promise<CacheResult<string | undefined>>;

  /**
   * Removes a value. Removing an absent key succeeds.
   *
   * @param key - Cache key
   */
  delete(key: string): Promise<CacheResult<void>>;
}
