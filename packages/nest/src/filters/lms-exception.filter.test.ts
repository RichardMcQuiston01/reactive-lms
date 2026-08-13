import { describe, expect, test } from 'bun:test';
import type { ArgumentsHost } from '@nestjs/common';
import { LmsError, PACKAGE_NOT_FOUND } from '@reactive-lms/shared';
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
