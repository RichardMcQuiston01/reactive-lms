/**
 * What to do with the result of a {@link LatestOnly.load}.
 */
export interface LoadOutcome<T> {
  /** Called with the data when this is still the newest request. */
  onData: (value: T) => void;
  /** Called with the failure when this is still the newest request. */
  onFailure: (failure: unknown) => void;
  /** Called after success or failure when this is still the newest request. */
  onSettled?: () => void;
}

/**
 * Lets only the newest of several overlapping requests apply its result.
 *
 * Call {@link LatestOnly.begin} when a request starts; the returned function
 * reports whether that request is still the newest. A response that arrives
 * after a newer request started is stale and must be dropped, or it would
 * overwrite fresher data.
 */
export class LatestOnly {
  private latest = 0;

  /**
   * Marks a new request as the newest.
   *
   * @returns A check that is `true` only while no newer request has begun
   */
  begin(): () => boolean {
    this.latest += 1;
    const mine = this.latest;
    return () => mine === this.latest;
  }

  /**
   * Runs a load and applies its outcome only while it is still the newest.
   * A stale success, failure, or completion changes nothing, so an old
   * request can neither overwrite newer data nor show its error or clear a
   * newer request's loading state.
   *
   * @param fetch - Starts the request
   * @param outcome - Callbacks for success, failure, and completion
   */
  async load<T>(
    fetch: () => Promise<T>,
    outcome: LoadOutcome<T>,
  ): Promise<void> {
    const isCurrent = this.begin();
    try {
      const value = await fetch();
      if (isCurrent()) {
        outcome.onData(value);
      }
    } catch (failure) {
      if (isCurrent()) {
        outcome.onFailure(failure);
      }
    } finally {
      if (isCurrent()) {
        outcome.onSettled?.();
      }
    }
  }
}
