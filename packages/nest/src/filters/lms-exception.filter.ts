import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { LmsError } from '@reactive-lms/shared';
import type { Response } from 'express';

/**
 * Maps {@link LmsError} to `{ code, message }` using `LmsError.status`.
 */
@Catch(LmsError)
export class LmsExceptionFilter implements ExceptionFilter<LmsError> {
  /**
   * Writes the LMS JSON error body and HTTP status.
   *
   * @param exception - Domain error thrown by a core service
   * @param host - Nest arguments host
   */
  catch(exception: LmsError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.status).json({
      code: exception.code,
      message: exception.message,
    });
  }
}
