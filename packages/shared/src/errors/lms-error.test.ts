import { describe, expect, test } from 'bun:test';
import {
  CMI5_TOKEN_USED,
  LAUNCH_SESSION_OPEN,
  LmsError,
  PACKAGE_NOT_DETECTED,
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

  test('maps CMI5_TOKEN_USED to 400', () => {
    expect(httpStatusForLmsCode(CMI5_TOKEN_USED)).toBe(400);
  });

  test('maps LAUNCH_SESSION_OPEN to 409', () => {
    expect(httpStatusForLmsCode(LAUNCH_SESSION_OPEN)).toBe(409);
  });
});
