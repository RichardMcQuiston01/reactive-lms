import { describe, expect, test } from 'bun:test';
import {
  BadRequestException,
  HttpException,
  type ArgumentsHost,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function hostOf(collected: { status?: number; body?: unknown }): ArgumentsHost {
  return {
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
}

describe('AllExceptionsFilter', () => {
  test('maps HttpException to { code, message } without statusCode', () => {
    const collected: { status?: number; body?: unknown } = {};
    new AllExceptionsFilter().catch(
      new BadRequestException('file is required'),
      hostOf(collected),
    );

    expect(collected.status).toBe(400);
    expect(collected.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'file is required',
    });
  });

  test('maps validation-style message arrays', () => {
    const collected: { status?: number; body?: unknown } = {};
    new AllExceptionsFilter().catch(
      new HttpException(
        { statusCode: 400, message: ['title should not be empty'] },
        400,
      ),
      hostOf(collected),
    );

    expect(collected.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'title should not be empty',
    });
  });

  test('maps unexpected errors to INTERNAL_ERROR', () => {
    const collected: { status?: number; body?: unknown } = {};
    new AllExceptionsFilter().catch(
      new Error('relation "rlms_content_package" does not exist'),
      hostOf(collected),
    );

    expect(collected.status).toBe(500);
    expect(collected.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'relation "rlms_content_package" does not exist',
    });
  });
});

describe('AllExceptionsFilter error sink', () => {
  test('reports unexpected errors but not client errors', () => {
    const reported: string[] = [];
    const filter = new AllExceptionsFilter((entry) => {
      reported.push(`${entry.code}:${entry.source}`);
    });

    filter.catch(new Error('db down'), hostOf({}));
    filter.catch(new BadRequestException('nope'), hostOf({}));

    expect(reported).toEqual(['INTERNAL_ERROR:nest.AllExceptionsFilter']);
  });
});
