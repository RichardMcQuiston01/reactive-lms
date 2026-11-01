/**
 * Runs async tasks one at a time, in the order they were added.
 *
 * Use it for requests whose order matters, such as progress reports: two
 * requests sent together can arrive in either order, and a late older report
 * would then overwrite a newer one. A task that fails does not stop the ones
 * behind it; its own promise rejects so its caller can report the error.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  /**
   * Adds a task to the end of the queue.
   *
   * @param task - Starts the work; called only after earlier tasks settle
   * @returns The task's own result or rejection
   */
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
