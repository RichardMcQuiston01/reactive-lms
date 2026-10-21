import type {
  CacheAdapter,
  CacheResult,
  CacheSetOptions,
} from '@richardmcquiston01/reactive-lms-shared';

interface CacheEntry {
  value: string;
  /** Epoch milliseconds after which the entry is dead; `undefined` never expires. */
  expiresAt?: number;
}

/**
 * `CacheAdapter` that keeps entries in this process's memory. It is the
 * default for `standalone-api` and tests. Entries do not survive a restart and
 * are not shared between processes, so one-time tokens and nonces are only
 * safe with a single API process; inject a shared adapter otherwise.
 */
export class MemoryCacheAdapter implements CacheAdapter {
  private readonly entries = new Map<string, CacheEntry>();

  /**
   * @param now - Clock in epoch milliseconds; replace it in tests
   */
  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<CacheResult<string | undefined>> {
    return { ok: true, value: this.live(key)?.value };
  }

  async set(
    key: string,
    value: string,
    options?: CacheSetOptions,
  ): Promise<CacheResult<void>> {
    this.entries.set(key, this.entryOf(value, options));
    return { ok: true, value: undefined };
  }

  async setIfAbsent(
    key: string,
    value: string,
    options?: CacheSetOptions,
  ): Promise<CacheResult<boolean>> {
    if (this.live(key)) {
      return { ok: true, value: false };
    }
    this.entries.set(key, this.entryOf(value, options));
    return { ok: true, value: true };
  }

  async take(key: string): Promise<CacheResult<string | undefined>> {
    const entry = this.live(key);
    this.entries.delete(key);
    return { ok: true, value: entry?.value };
  }

  async delete(key: string): Promise<CacheResult<void>> {
    this.entries.delete(key);
    return { ok: true, value: undefined };
  }

  private entryOf(value: string, options?: CacheSetOptions): CacheEntry {
    const ttlMs = options?.ttlMs;
    return {
      value,
      expiresAt: ttlMs === undefined ? undefined : this.now() + ttlMs,
    };
  }

  /** Returns the entry if present and unexpired, dropping it if expired. */
  private live(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }
}
