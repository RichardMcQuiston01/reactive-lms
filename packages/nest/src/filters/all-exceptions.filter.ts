import {
  Catch,
  HttpException,
  Inject,
  Optional,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  consoleErrorSink,
  errorSinkEntryOf,
  reportError,
} from '@richardmcquiston01/reactive-lms-core';
import {
  LmsError,
  type ErrorSink,
} from '@richardmcquiston01/reactive-lms-shared';
import type { Response } from 'express';
import { RLMS_ERROR_SINK } from '../tokens';

/**
 * Catch-all filter so every error body is `{ code, message }`.
 * Nest `HttpException`, TypeORM, and unexpected errors do not leak
 * `{ statusCode, message }`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /**
   * @param errorSink - Receives 5xx errors; defaults to the console sink
   */
  constructor(
    @Optional()
    @Inject(RLMS_ERROR_SINK)
    private readonly errorSink: ErrorSink = consoleErrorSink,
  ) {}

  /**
   * Writes `{ code, message }` for any thrown value.
   *
   * @param exception - Thrown value
   * @param host - Nest arguments host
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof LmsError) {
      this.report(exception, exception.status);
      response.status(exception.status).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.report(exception, status);
      response.status(status).json({
        code: httpExceptionCode(status),
        message: httpExceptionMessage(exception),
      });
      return;
    }
    this.report(exception, 500);
    const message =
      exception instanceof Error ? exception.message : 'Internal server error';
    response.status(500).json({
      code: 'INTERNAL_ERROR',
      message,
    });
  }

  /**
   * Reports server-side failures; 4xx responses are caller mistakes and stay
   * out of the error log.
   */
  private report(exception: unknown, status: number): void {
    if (status < 500) {
      return;
    }
    void reportError(
      this.errorSink,
      errorSinkEntryOf(exception, 'nest.AllExceptionsFilter'),
    );
  }
}

function httpExceptionMessage(exception: HttpException): string {
  const payload = exception.getResponse();
  if (typeof payload === 'string' && payload.length > 0) {
    return payload;
  }
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const raw = (payload as { message: unknown }).message;
    if (typeof raw === 'string' && raw.length > 0) {
      return raw;
    }
    if (Array.isArray(raw)) {
      return raw.map(String).join(', ');
    }
  }
  return exception.message;
}

function httpExceptionCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
  }
}
