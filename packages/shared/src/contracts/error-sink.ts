/**
 * One error report. The fields line up with `ErrorLogEntry` from
 * `@richardmcquiston01/error-log-adapter`, so a host can pass an adapter's
 * `log` straight in; ReactiveLMS itself does not depend on that package.
 */
export interface ErrorSinkEntry {
  /** Machine-readable error code (e.g. `INTERNAL_ERROR`, `STORAGE_IO_ERROR`). */
  code: string;
  /** Human-readable description. */
  message: string;
  /** Original thrown value, when there was one. */
  cause?: unknown;
  /** Where the error was caught (e.g. `nest.AllExceptionsFilter`). */
  source: string;
}

/**
 * Receives errors worth an operator's attention. A sink must not throw;
 * ReactiveLMS also guards every call, so a failing sink never changes a
 * request's outcome.
 */
export type ErrorSink = (entry: ErrorSinkEntry) => void | Promise<void>;
