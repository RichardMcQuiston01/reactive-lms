import {
  LmsError,
  STORAGE_IO_ERROR,
  STORAGE_KEY_INVALID,
  STORAGE_KEY_NOT_FOUND,
  STORAGE_RANGE_INVALID,
  httpStatusForLmsCode,
  type BlobError,
  type BlobResult,
} from '@richardmcquiston01/reactive-lms-shared';

/**
 * Converts a blob store error into the `LmsError` the HTTP layer understands.
 *
 * @param error - Failure reported by a `BlobStorageAdapter`
 */
export function blobErrorToLmsError(error: BlobError): LmsError {
  const code =
    error.code === 'not_found'
      ? STORAGE_KEY_NOT_FOUND
      : error.code === 'invalid_key'
        ? STORAGE_KEY_INVALID
        : error.code === 'invalid_range'
          ? STORAGE_RANGE_INVALID
          : STORAGE_IO_ERROR;
  return new LmsError({
    status: httpStatusForLmsCode(code),
    code,
    message: error.message,
    details: error.key === undefined ? undefined : { key: error.key },
  });
}

/**
 * Unwraps a blob result at a domain boundary, throwing an `LmsError` for a
 * failure. Adapters return results; services that already report errors as
 * `LmsError` use this to bridge the two.
 *
 * @param result - Outcome of a `BlobStorageAdapter` call
 */
export function requireBlob<T>(result: BlobResult<T>): T {
  if (!result.ok) {
    throw blobErrorToLmsError(result.error);
  }
  return result.value;
}
