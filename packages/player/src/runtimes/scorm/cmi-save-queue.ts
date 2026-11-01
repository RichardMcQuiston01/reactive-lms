import type { ScormCmiDto } from '@richardmcquiston01/reactive-lms-shared';

/**
 * Callbacks for save outcomes.
 */
export interface CmiSaveQueueHooks {
  /** A save failed; the snapshot is kept and retried on the next save. */
  onError?: (error: unknown) => void;
  /** A save succeeded after one or more failures, so nothing is left unsaved. */
  onRecovered?: () => void;
}

/**
 * Sends SCORM CMI snapshots to the server one at a time, newest last.
 *
 * Every snapshot is the whole CMI, so while one save is in flight only the
 * newest waiting snapshot matters: older ones are replaced, never sent late.
 * That keeps a slow commit from landing after `LMSFinish` and overwriting the
 * final bookmark, score, or completion.
 *
 * A failed save keeps its snapshot. The next `save`, or `retry`, sends the
 * newest one again, so nothing the lesson reported is dropped. The queue never
 * rejects; failures go to the `onError` hook.
 */
export class CmiSaveQueue {
  private waiting: ScormCmiDto | null = null;
  private running: Promise<void> | null = null;
  private failed = false;

  /**
   * @param put - Sends one snapshot; may reject
   * @param hooks - Failure and recovery callbacks
   */
  constructor(
    private readonly put: (snapshot: ScormCmiDto) => Promise<void>,
    private readonly hooks: CmiSaveQueueHooks = {},
  ) {}

  /** True while a snapshot is waiting to be saved or has failed to save. */
  get hasUnsaved(): boolean {
    return this.waiting !== null;
  }

  /**
   * Queues a snapshot and starts sending if nothing is in flight.
   *
   * @param snapshot - The whole CMI as it is now
   * @returns Resolves when the queue is idle; never rejects
   */
  save(snapshot: ScormCmiDto): Promise<void> {
    this.waiting = {
      values: snapshot.values,
      // Once finished, always finished: a replaced snapshot cannot un-finish.
      finished: snapshot.finished === true || this.waiting?.finished === true,
    };
    return this.start();
  }

  /**
   * Sends whatever is still unsaved, such as after a failed save.
   *
   * If a save is already in flight this waits for it, and when that one fails
   * it tries once more, so a caller that must not leave anything behind (a
   * rebind or a destroy) gets a fresh attempt rather than the failure it just
   * joined.
   *
   * @returns Resolves when the queue is idle; never rejects
   */
  async retry(): Promise<void> {
    const joinedInFlight = this.running !== null;
    await this.start();
    if (joinedInFlight && this.waiting) {
      await this.start();
    }
  }

  private start(): Promise<void> {
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    while (this.waiting) {
      const next = this.waiting;
      this.waiting = null;
      try {
        await this.put(next);
      } catch (error) {
        // Keep it for a retry. If a newer snapshot arrived meanwhile it wins,
        // but a finished flag already reported is never lost.
        // (`save` may have replaced `waiting` while the request was in flight,
        // which the compiler cannot see across the await.)
        const newer = this.waiting as ScormCmiDto | null;
        this.waiting = {
          values: newer?.values ?? next.values,
          finished: next.finished === true || newer?.finished === true,
        };
        this.failed = true;
        this.hooks.onError?.(error);
        return;
      }
      if (this.failed && !this.waiting) {
        this.failed = false;
        this.hooks.onRecovered?.();
      }
    }
  }
}
