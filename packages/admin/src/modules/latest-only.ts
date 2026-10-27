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
}
