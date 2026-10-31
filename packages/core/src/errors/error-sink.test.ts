import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  LmsError,
  type ErrorSinkEntry,
} from '@richardmcquiston01/reactive-lms-shared';
import { errorSinkEntryOf, reportError } from './error-sink';

describe('errorSinkEntryOf', () => {
  test('keeps the code of an LmsError', () => {
    const error = new LmsError({
      status: 404,
      code: 'MODULE_NOT_FOUND',
      message: 'Course module not found.',
    });

    const entry = errorSinkEntryOf(error, 'test');

    expect(entry).toMatchObject({
      code: 'MODULE_NOT_FOUND',
      message: 'Course module not found.',
      source: 'test',
      cause: error,
    });
  });

  test('reports anything else as INTERNAL_ERROR', () => {
    expect(errorSinkEntryOf(new Error('boom'), 's').code).toBe(
      'INTERNAL_ERROR',
    );
    expect(errorSinkEntryOf('text', 's').message).toBe('text');
  });
});

describe('reportError', () => {
  const originalError = console.error;
  let logged: string[] = [];
  beforeEach(() => {
    logged = [];
    console.error = (message: string): void => {
      logged.push(message);
    };
  });
  afterEach(() => {
    console.error = originalError;
  });

  const entry: ErrorSinkEntry = { code: 'X', message: 'm', source: 's' };

  test('delivers the entry to the sink', async () => {
    const seen: ErrorSinkEntry[] = [];
    await reportError((reported) => {
      seen.push(reported);
    }, entry);
    expect(seen).toEqual([entry]);
  });

  test('swallows a throwing sink and says so on the console', async () => {
    await reportError(() => {
      throw new Error('disk full');
    }, entry);
    expect(logged[0]).toContain('Error sink failed while reporting X');
    expect(logged[0]).toContain('disk full');
  });

  test('swallows a rejecting sink', async () => {
    await reportError(() => Promise.reject(new Error('offline')), entry);
    expect(logged[0]).toContain('offline');
  });
});
