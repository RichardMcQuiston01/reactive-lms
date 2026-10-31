import type {
  CacheAdapter,
  CacheResult,
  CacheSetOptions,
} from '@richardmcquiston01/reactive-lms-shared';

/** Default least time between sweeps of expired entries (one minute). */
export const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

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
  private nextSweepAt: number;

  /**
   * @param now - Clock in epoch milliseconds; replace it in tests
   * @param sweepIntervalMs - Least time between sweeps that drop expired
   *   entries nobody asked for again. Default one minute.
   */
  constructor(
    private readonly now: () => number = Date.now,
    private readonly sweepIntervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
  ) {
    this.nextSweepAt = this.now() + sweepIntervalMs;
  }

  /**
   * Entries held, including any that have expired but not yet been swept.
   * For diagnostics and tests.
   */
  get size(): number {
    return this.entries.size;
  }

  async get(key: string): Promise<CacheResult<string | undefined>> {
    return { ok: true, value: this.live(key)?.value };
  }

  async set(
    key: string,
    value: string,
    options?: CacheSetOptions,
  ): Promise<CacheResult<void>> {
    this.sweepIfDue();
    this.entries.set(key, this.entryOf(value, options));
    return { ok: true, value: undefined };
  }

  async setIfAbsent(
    key: string,
    value: string,
    options?: CacheSetOptions,
  ): Promise<CacheResult<boolean>> {
    this.sweepIfDue();
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

  /**
   * Drops every expired entry, at most once per interval. An expired entry is
   * otherwise removed only when its own key is read again, so one-time keys
   * that are never redeemed would stay in memory for the life of the process.
   * Sweeping on writes means no timer to start, stop, or keep a process alive,
   * and the cost is one pass over the entries per interval.
   */
  private sweepIfDue(): void {
    const current = this.now();
    if (current < this.nextSweepAt) {
      return;
    }
    this.nextSweepAt = current + this.sweepIntervalMs;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= current) {
        this.entries.delete(key);
      }
    }
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
