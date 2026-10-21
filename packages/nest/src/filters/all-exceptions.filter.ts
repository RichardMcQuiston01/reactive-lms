import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { LmsError } from '@richardmcquiston01/reactive-lms-shared';
import type { Response } from 'express';

/**
 * Catch-all filter so every error body is `{ code, message }`.
 * Nest `HttpException`, TypeORM, and unexpected errors do not leak
 * `{ statusCode, message }`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /**
   * Writes `{ code, message }` for any thrown value.
   *
   * @param exception - Thrown value
   * @param host - Nest arguments host
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof LmsError) {
      response.status(exception.status).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        code: httpExceptionCode(status),
        message: httpExceptionMessage(exception),
      });
      return;
    }
    const message =
      exception instanceof Error ? exception.message : 'Internal server error';
    response.status(500).json({
      code: 'INTERNAL_ERROR',
      message,
    });
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
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
  }
}
