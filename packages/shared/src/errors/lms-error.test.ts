import { describe, expect, test } from 'bun:test';
import {
  CMI5_TOKEN_USED,
  LAUNCH_NOT_IMPLEMENTED,
  LAUNCH_SESSION_OPEN,
  LmsError,
  PACKAGE_INVALID_ZIP,
  PACKAGE_NOT_DETECTED,
  PACKAGE_TYPE_UNSUPPORTED,
  PACKAGE_ZIP_BOMB,
  STORAGE_KEY_INVALID,
  STORAGE_KEY_NOT_FOUND,
  httpStatusForLmsCode,
} from './lms-error';

describe('LmsError', () => {
  test('constructs with code, message, and status', () => {
    const err = new LmsError({
      status: 400,
      code: PACKAGE_NOT_DETECTED,
      message: 'No supported package type found',
      details: { paths: ['readme.txt'] },
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LmsError);
    expect(err.name).toBe('LmsError');
    expect(err.status).toBe(400);
    expect(err.code).toBe(PACKAGE_NOT_DETECTED);
    expect(err.message).toBe('No supported package type found');
    expect(err.details).toEqual({ paths: ['readme.txt'] });
  });

  test('details is optional', () => {
    const err = new LmsError({
      status: 409,
      code: LAUNCH_SESSION_OPEN,
      message: 'An open launch session already exists',
    });

    expect(err.details).toBeUndefined();
  });
});

describe('httpStatusForLmsCode', () => {
  test('maps PACKAGE_NOT_DETECTED to 400', () => {
    expect(httpStatusForLmsCode(PACKAGE_NOT_DETECTED)).toBe(400);
  });

  test('maps PACKAGE_TYPE_UNSUPPORTED to 422', () => {
    expect(httpStatusForLmsCode(PACKAGE_TYPE_UNSUPPORTED)).toBe(422);
  });

  test('maps PACKAGE_INVALID_ZIP and PACKAGE_ZIP_BOMB to 400', () => {
    expect(httpStatusForLmsCode(PACKAGE_INVALID_ZIP)).toBe(400);
    expect(httpStatusForLmsCode(PACKAGE_ZIP_BOMB)).toBe(400);
  });

  test('maps STORAGE_KEY_INVALID to 400 and STORAGE_KEY_NOT_FOUND to 404', () => {
    expect(httpStatusForLmsCode(STORAGE_KEY_INVALID)).toBe(400);
    expect(httpStatusForLmsCode(STORAGE_KEY_NOT_FOUND)).toBe(404);
  });

  test('maps CMI5_TOKEN_USED to 400', () => {
    expect(httpStatusForLmsCode(CMI5_TOKEN_USED)).toBe(400);
  });

  test('maps LAUNCH_SESSION_OPEN to 409', () => {
    expect(httpStatusForLmsCode(LAUNCH_SESSION_OPEN)).toBe(409);
  });

  test('maps LAUNCH_NOT_IMPLEMENTED to 501', () => {
    expect(httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED)).toBe(501);
  });
});
