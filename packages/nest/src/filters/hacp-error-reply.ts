import { HttpException } from '@nestjs/common';
import { formatHacpResponse } from '@richardmcquiston01/reactive-lms-core';
import {
  AICC_ERROR,
  ATTEMPT_NOT_FOUND,
  LmsError,
} from '@richardmcquiston01/reactive-lms-shared';
import type { Response } from 'express';
import { clientErrorStatus } from './client-error';

const HACP_PATH = '/aicc/hacp';

/**
 * True when a request is for the HACP route, whatever route prefix the host
 * uses. Checked from the URL because an error raised by a body parser happens
 * before any route is chosen.
 *
 * @param request - The Express request, or anything with an `originalUrl`
 */
export function isHacpRequest(request: unknown): boolean {
  const url = (request as { originalUrl?: unknown } | undefined)?.originalUrl;
  if (typeof url !== 'string') {
    return false;
  }
  const path = (url.split('?', 1)[0] ?? '').replace(/\/+$/, '').toLowerCase();
  return path.endsWith(HACP_PATH);
}

/**
 * Answers a client error on the HACP route the way HACP does: HTTP 200 with
 * the result in the body. HACP reports every outcome that way, so a request
 * this LMS cannot accept (a body that cannot be read or is too large, an
 * unexpected method) gets `error=1` and the reason, not an HTTP error that
 * the content would read as a network failure.
 *
 * A server fault is not an outcome HACP defines, so it is left alone.
 *
 * @param exception - Thrown value
 * @param response - The Express response
 * @returns `true` when the reply was written, `false` when the error is not a
 *   client error and should be handled as usual
 */
export function writeHacpClientError(
  exception: unknown,
  response: Response,
): boolean {
  const status = clientStatusOf(exception);
  if (status === undefined) {
    return false;
  }
  const gone =
    exception instanceof LmsError && exception.code === ATTEMPT_NOT_FOUND;
  response
    .status(200)
    .type('text/plain; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .send(
      formatHacpResponse({
        errorCode: gone ? AICC_ERROR.invalidSession : AICC_ERROR.invalidCommand,
        errorText: gone
          ? 'Invalid Session ID'
          : `Invalid Command: ${reasonFor(status, exception)}`,
        version: '3.5',
        aiccData: '',
      }),
    );
  return true;
}

function clientStatusOf(exception: unknown): number | undefined {
  if (exception instanceof LmsError) {
    return exception.status < 500 ? exception.status : undefined;
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return status < 500 ? status : undefined;
  }
  return clientErrorStatus(exception);
}

function reasonFor(status: number, exception: unknown): string {
  if (status === 413) {
    return 'the request is larger than this LMS accepts.';
  }
  if (status === 404) {
    return 'HACP requests must be sent with POST.';
  }
  const message = exception instanceof Error ? exception.message : '';
  return message === ''
    ? 'the request could not be read.'
    : `the request could not be read (${message}).`;
}
