import { describe, expect, test } from 'bun:test';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ATTEMPT_NOT_FOUND,
  LmsError,
} from '@richardmcquiston01/reactive-lms-shared';
import type { Response } from 'express';
import { isHacpRequest, writeHacpClientError } from './hacp-error-reply';

interface Sent {
  status?: number;
  type?: string;
  headers: Record<string, string>;
  body?: string;
}

function responseOf(sent: Sent): Response {
  const response = {
    status(code: number) {
      sent.status = code;
      return response;
    },
    type(value: string) {
      sent.type = value;
      return response;
    },
    set(name: string, value: string) {
      sent.headers[name] = value;
      return response;
    },
    send(body: string) {
      sent.body = body;
      return response;
    },
  };
  return response as unknown as Response;
}

const write = (exception: unknown): { written: boolean; sent: Sent } => {
  const sent: Sent = { headers: {} };
  return { written: writeHacpClientError(exception, responseOf(sent)), sent };
};

describe('isHacpRequest', () => {
  test.each([
    ['/lms/aicc/hacp', true],
    ['/aicc/hacp', true],
    ['/api/v2/lms/aicc/hacp?x=1', true],
    ['/lms/AICC/HACP/', true],
    ['/lms/aicc/hacp/extra', false],
    ['/lms/packages', false],
    ['/lms/aicc', false],
  ])('%s is %p', (url, expected) => {
    expect(isHacpRequest({ originalUrl: url })).toBe(expected);
  });

  test('is false when there is no URL to read', () => {
    expect(isHacpRequest(undefined)).toBe(false);
    expect(isHacpRequest({})).toBe(false);
    expect(isHacpRequest({ originalUrl: 42 })).toBe(false);
  });
});

describe('writeHacpClientError', () => {
  test('answers a client error with error 1 and the reason, at HTTP 200', () => {
    const { written, sent } = write(new BadRequestException('nope'));

    expect(written).toBe(true);
    expect(sent.status).toBe(200);
    expect(sent.type).toBe('text/plain; charset=utf-8');
    expect(sent.headers['Cache-Control']).toBe('no-store');
    expect(sent.body).toBe(
      'error=1\r\nerror_text=Invalid Command: the request could not be read (nope).\r\nversion=3.5\r\naicc_data=',
    );
  });

  test('says too large for a 413, and POST for a 404', () => {
    const tooLarge = Object.assign(new Error('x'), {
      status: 413,
      expose: true,
    });
    expect(write(tooLarge).sent.body).toContain('larger than this LMS accepts');
    const missing = new LmsError({ status: 404, code: 'X', message: 'm' });
    expect(write(missing).sent.body).toContain('must be sent with POST');
  });

  test('a vanished attempt is error 3 with the same words as any bad session', () => {
    const { sent } = write(
      new LmsError({ status: 404, code: ATTEMPT_NOT_FOUND, message: 'gone' }),
    );

    expect(sent.status).toBe(200);
    expect(sent.body).toStartWith(
      'error=3\r\nerror_text=Invalid Session ID\r\n',
    );
  });

  test('leaves a server fault alone, so it stays a 5xx', () => {
    for (const fault of [
      new Error('boom'),
      new InternalServerErrorException('boom'),
      new LmsError({ status: 503, code: 'X', message: 'm' }),
      Object.assign(new Error('x'), { status: 500, expose: true }),
    ]) {
      const { written, sent } = write(fault);
      expect(written).toBe(false);
      expect(sent.status).toBeUndefined();
    }
  });

  test('flattens line breaks in a message so it cannot add keys to the reply', () => {
    const { sent } = write(new BadRequestException('a\r\nerror=0'));
    expect(sent.body?.split('\r\n')).toHaveLength(4);
  });
});
