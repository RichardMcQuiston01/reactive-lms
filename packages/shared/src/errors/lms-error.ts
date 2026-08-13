/**
 * Readable LMS error codes used in API responses and logs.
 * Extend {@link LMS_ERROR_HTTP_STATUS} when adding new codes.
 */
export type LmsErrorCode =
  | typeof PACKAGE_NOT_DETECTED
  | typeof LAUNCH_SESSION_OPEN
  | typeof CMI5_TOKEN_USED
  | (string & {});

/** Package import could not detect a supported format. */
export const PACKAGE_NOT_DETECTED = 'PACKAGE_NOT_DETECTED';

/** A launch was refused because another session is still open. */
export const LAUNCH_SESSION_OPEN = 'LAUNCH_SESSION_OPEN';

/** cmi5 one-time fetch token was already consumed. */
export const CMI5_TOKEN_USED = 'CMI5_TOKEN_USED';

/**
 * Default HTTP status for known LMS error codes.
 * Keep extendable: add entries as new codes are introduced.
 */
export const LMS_ERROR_HTTP_STATUS: Readonly<Record<string, number>> = {
  [PACKAGE_NOT_DETECTED]: 400,
  [CMI5_TOKEN_USED]: 400,
  [LAUNCH_SESSION_OPEN]: 409,
};

/**
 * Maps an LMS error code to an HTTP status.
 * Unknown codes fall back to 500.
 *
 * @param code - Readable error code (e.g. `PACKAGE_NOT_DETECTED`)
 * @returns HTTP status number
 */
export function httpStatusForLmsCode(code: string): number {
  return LMS_ERROR_HTTP_STATUS[code] ?? 500;
}

/** Constructor fields carried by {@link LmsError}. */
export interface LmsErrorOptions {
  /** HTTP status associated with this error. */
  status: number;
  /** Machine-readable error code. */
  code: string;
  /** Human-readable message. */
  message: string;
  /** Optional structured context for clients or logs. */
  details?: unknown;
}

/**
 * Domain error with HTTP status, code, message, and optional details.
 * Prefer constructing with a known code and {@link httpStatusForLmsCode}.
 */
export class LmsError extends Error {
  /** HTTP status associated with this error. */
  readonly status: number;

  /** Machine-readable error code. */
  readonly code: string;

  /** Optional structured context for clients or logs. */
  readonly details?: unknown;

  /**
   * @param options - status, code, message, and optional details
   */
  constructor(options: LmsErrorOptions) {
    super(options.message);
    this.name = 'LmsError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}
