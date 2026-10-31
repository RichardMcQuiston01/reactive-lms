import {
  Catch,
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
 * Maps {@link LmsError} to `{ code, message }` using `LmsError.status`.
 */
@Catch(LmsError)
export class LmsExceptionFilter implements ExceptionFilter<LmsError> {
  /**
   * @param errorSink - Receives 5xx errors; defaults to the console sink
   */
  constructor(
    @Optional()
    @Inject(RLMS_ERROR_SINK)
    private readonly errorSink: ErrorSink = consoleErrorSink,
  ) {}

  /**
   * Writes the LMS JSON error body and HTTP status.
   *
   * @param exception - Domain error thrown by a core service
   * @param host - Nest arguments host
   */
  catch(exception: LmsError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception.status >= 500) {
      void reportError(
        this.errorSink,
        errorSinkEntryOf(exception, 'nest.LmsExceptionFilter'),
      );
    }
    response.status(exception.status).json({
      code: exception.code,
      message: exception.message,
    });
  }
}
