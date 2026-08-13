/**
 * Readable LMS error codes used in API responses and logs.
 * Extend {@link LMS_ERROR_HTTP_STATUS} when adding new codes.
 */
export type LmsErrorCode =
  | typeof PACKAGE_NOT_DETECTED
  | typeof PACKAGE_TYPE_UNSUPPORTED
  | typeof PACKAGE_INVALID_ZIP
  | typeof PACKAGE_ZIP_BOMB
  | typeof STORAGE_KEY_NOT_FOUND
  | typeof STORAGE_KEY_INVALID
  | typeof LAUNCH_NOT_IMPLEMENTED
  | typeof LAUNCH_SESSION_OPEN
  | typeof CMI5_TOKEN_USED
  | (string & {});

/** Package import could not detect a supported format. */
export const PACKAGE_NOT_DETECTED = 'PACKAGE_NOT_DETECTED';

/** Detected package type cannot be imported in this version. */
export const PACKAGE_TYPE_UNSUPPORTED = 'PACKAGE_TYPE_UNSUPPORTED';

/** Uploaded bytes are not a readable ZIP archive. */
export const PACKAGE_INVALID_ZIP = 'PACKAGE_INVALID_ZIP';

/** Archive exceeds uncompressed-size or file-count limits. */
export const PACKAGE_ZIP_BOMB = 'PACKAGE_ZIP_BOMB';

/** No object exists at the requested storage key. */
export const STORAGE_KEY_NOT_FOUND = 'STORAGE_KEY_NOT_FOUND';

/** Storage key would escape the configured data root. */
export const STORAGE_KEY_INVALID = 'STORAGE_KEY_INVALID';

/** Requested launch path is not implemented in this version. */
export const LAUNCH_NOT_IMPLEMENTED = 'LAUNCH_NOT_IMPLEMENTED';

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
  [PACKAGE_INVALID_ZIP]: 400,
  [PACKAGE_ZIP_BOMB]: 400,
  [STORAGE_KEY_INVALID]: 400,
  [CMI5_TOKEN_USED]: 400,
  [PACKAGE_TYPE_UNSUPPORTED]: 422,
  [STORAGE_KEY_NOT_FOUND]: 404,
  [LAUNCH_SESSION_OPEN]: 409,
  [LAUNCH_NOT_IMPLEMENTED]: 501,
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
