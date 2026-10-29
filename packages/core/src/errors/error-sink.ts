import {
  LmsError,
  type ErrorSink,
  type ErrorSinkEntry,
} from '@richardmcquiston01/reactive-lms-shared';

/**
 * Built-in sink used when the host injects none: one JSON line per error on
 * `console.error`, so logs stay greppable and structured.
 *
 * @param entry - Error report
 */
export const consoleErrorSink: ErrorSink = (entry) => {
  console.error(
    JSON.stringify({
      code: entry.code,
      message: entry.message,
      source: entry.source,
      cause: describeCause(entry.cause),
    }),
  );
};

/**
 * Builds a report from a thrown value.
 *
 * @param error - Thrown value
 * @param source - Where it was caught
 */
export function errorSinkEntryOf(
  error: unknown,
  source: string,
): ErrorSinkEntry {
  if (error instanceof LmsError) {
    return { code: error.code, message: error.message, cause: error, source };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : String(error),
    cause: error,
    source,
  };
}

/**
 * Reports an error without ever throwing: a sink that throws or rejects is
 * itself written to `console.error`, so reporting cannot change an outcome.
 *
 * @param sink - Where to report
 * @param entry - Error report
 */
export async function reportError(
  sink: ErrorSink,
  entry: ErrorSinkEntry,
): Promise<void> {
  try {
    await sink(entry);
  } catch (sinkFailure) {
    console.error(
      `Error sink failed while reporting ${entry.code} from ${entry.source}: ${describeCause(sinkFailure)}`,
    );
  }
}

function describeCause(cause: unknown): string | undefined {
  if (cause === undefined) {
    return undefined;
  }
  if (cause instanceof Error) {
    return cause.stack ?? `${cause.name}: ${cause.message}`;
  }
  return String(cause);
}
