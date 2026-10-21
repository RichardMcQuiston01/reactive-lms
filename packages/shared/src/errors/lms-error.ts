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
  | typeof MODULE_NOT_AVAILABLE
  | typeof ENROLMENT_METHOD_UNAVAILABLE
  | typeof ENROLMENT_WINDOW_CLOSED
  | typeof ENROLMENT_KEY_REQUIRED
  | typeof ENROLMENT_GROUP_REQUIRED
  | typeof PACKAGE_NOT_FOUND
  | typeof MODULE_NOT_FOUND
  | typeof REGISTRATION_NOT_FOUND
  | typeof ATTEMPT_NOT_FOUND
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

/** Module availability rules block launch (date, prerequisite, score). */
export const MODULE_NOT_AVAILABLE = 'MODULE_NOT_AVAILABLE';

/** No enabled enrolment method matches the requested path. */
export const ENROLMENT_METHOD_UNAVAILABLE = 'ENROLMENT_METHOD_UNAVAILABLE';

/** Self-enrolment is outside its openFrom / openUntil window. */
export const ENROLMENT_WINDOW_CLOSED = 'ENROLMENT_WINDOW_CLOSED';

/** Self-enrolment requires a key that was missing or wrong. */
export const ENROLMENT_KEY_REQUIRED = 'ENROLMENT_KEY_REQUIRED';

/** Group enrolment requires membership in the configured LIS Group. */
export const ENROLMENT_GROUP_REQUIRED = 'ENROLMENT_GROUP_REQUIRED';

/** Content package id does not exist. */
export const PACKAGE_NOT_FOUND = 'PACKAGE_NOT_FOUND';

/** Course module id does not exist (or is not in the section). */
export const MODULE_NOT_FOUND = 'MODULE_NOT_FOUND';

/** Registration id does not exist. */
export const REGISTRATION_NOT_FOUND = 'REGISTRATION_NOT_FOUND';

/** Attempt id does not exist. */
export const ATTEMPT_NOT_FOUND = 'ATTEMPT_NOT_FOUND';

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
  [PACKAGE_NOT_FOUND]: 404,
  [MODULE_NOT_FOUND]: 404,
  [REGISTRATION_NOT_FOUND]: 404,
  [ATTEMPT_NOT_FOUND]: 404,
  [LAUNCH_SESSION_OPEN]: 409,
  [MODULE_NOT_AVAILABLE]: 403,
  [ENROLMENT_METHOD_UNAVAILABLE]: 403,
  [ENROLMENT_WINDOW_CLOSED]: 403,
  [ENROLMENT_KEY_REQUIRED]: 403,
  [ENROLMENT_GROUP_REQUIRED]: 403,
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
