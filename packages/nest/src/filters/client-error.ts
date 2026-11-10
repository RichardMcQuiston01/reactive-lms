/**
 * The status of a client error raised outside Nest's own exceptions, such as
 * a body parser refusing a request that is too large or cannot be read. Those
 * errors carry `status` (or `statusCode`) and `expose: true`; without this
 * they would be reported as 500s.
 *
 * @param exception - Thrown value
 * @returns A 4xx status, or `undefined` when it is not such an error
 */
export function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }
  const { status, statusCode, expose } = exception as {
    status?: unknown;
    statusCode?: unknown;
    expose?: unknown;
  };
  const code =
    typeof status === 'number'
      ? status
      : typeof statusCode === 'number'
        ? statusCode
        : undefined;
  return code !== undefined && code >= 400 && code < 500 && expose === true
    ? code
    : undefined;
}
