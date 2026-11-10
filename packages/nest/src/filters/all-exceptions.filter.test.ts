import { describe, expect, test } from 'bun:test';
import {
  BadRequestException,
  HttpException,
  type ArgumentsHost,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { clientErrorStatus } from './client-error';

function hostOf(collected: { status?: number; body?: unknown }): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/lms/packages' }),
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

describe('AllExceptionsFilter: errors raised outside Nest', () => {
  const bodyParserError = (status: number, message: string) =>
    Object.assign(new Error(message), {
      status,
      statusCode: status,
      expose: true,
      type: 'entity.too.large',
    });

  test('a body parser refusal keeps its 4xx status instead of becoming a 500', () => {
    const collected: { status?: number; body?: unknown } = {};
    new AllExceptionsFilter().catch(
      bodyParserError(413, 'request entity too large'),
      hostOf(collected),
    );

    expect(collected.status).toBe(413);
    expect(collected.body).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'request entity too large',
    });
  });

  test('clientErrorStatus reads only exposed 4xx errors', () => {
    expect(clientErrorStatus(bodyParserError(400, 'bad'))).toBe(400);
    expect(
      clientErrorStatus(
        Object.assign(new Error('x'), { statusCode: 422, expose: true }),
      ),
    ).toBe(422);
    expect(
      clientErrorStatus(Object.assign(new Error('x'), { status: 400 })),
    ).toBeUndefined();
    expect(
      clientErrorStatus(
        Object.assign(new Error('x'), { status: 500, expose: true }),
      ),
    ).toBeUndefined();
    expect(clientErrorStatus(new Error('x'))).toBeUndefined();
    expect(clientErrorStatus('text')).toBeUndefined();
    expect(clientErrorStatus(null)).toBeUndefined();
  });
});
