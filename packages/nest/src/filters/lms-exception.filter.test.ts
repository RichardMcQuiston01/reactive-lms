import { describe, expect, test } from 'bun:test';
import type { ArgumentsHost } from '@nestjs/common';
import {
  LmsError,
  PACKAGE_NOT_FOUND,
} from '@richardmcquiston01/reactive-lms-shared';
import { LmsExceptionFilter } from './lms-exception.filter';

describe('LmsExceptionFilter', () => {
  test('writes { code, message } with LmsError.status', () => {
    const collected: { status?: number; body?: unknown } = {};
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status(code: number) {
            collected.status = code;
            return this;
          },
          json(body: unknown) {
            collected.body = body;
            return this;
          },
        }),
      }),
    } as ArgumentsHost;

    new LmsExceptionFilter().catch(
      new LmsError({
        status: 404,
        code: PACKAGE_NOT_FOUND,
        message: 'Content package not found.',
      }),
      host,
    );

    expect(collected.status).toBe(404);
    expect(collected.body).toEqual({
      code: PACKAGE_NOT_FOUND,
      message: 'Content package not found.',
    });
  });
});

describe('LmsExceptionFilter error sink', () => {
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({
        status() {
          return this;
        },
        json() {
          return this;
        },
      }),
    }),
  } as unknown as ArgumentsHost;

  test('reports server errors with their own code, not client errors', () => {
    const reported: string[] = [];
    const filter = new LmsExceptionFilter((entry) => {
      reported.push(entry.code);
    });

    filter.catch(
      new LmsError({ status: 500, code: 'STORAGE_IO_ERROR', message: 'disk' }),
      host,
    );
    filter.catch(
      new LmsError({ status: 404, code: PACKAGE_NOT_FOUND, message: 'gone' }),
      host,
    );

    expect(reported).toEqual(['STORAGE_IO_ERROR']);
  });
});
