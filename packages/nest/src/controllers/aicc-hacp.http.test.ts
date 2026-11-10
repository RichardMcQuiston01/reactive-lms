import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import {
  AiccHacpService,
  LaunchService,
} from '@richardmcquiston01/reactive-lms-core';
import type { HacpResponseDto } from '@richardmcquiston01/reactive-lms-shared';
import { afterEach, describe, expect, test } from 'bun:test';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { LmsExceptionFilter } from '../filters/lms-exception.filter';
import { LmsRequestService } from '../identity/lms-request.service';
import { RegistrationAccess } from '../identity/registration-access';
import { RLMS_MODULE_OPTIONS } from '../tokens';
import { AiccHacpController } from './aicc-hacp.controller';
import { LaunchesController } from './launches.controller';

interface Harness {
  baseUrl: string;
  forms: Record<string, unknown>[];
  launches: Array<{ callbackBaseUrl?: string }>;
  close: () => Promise<void>;
}

/**
 * Boots the HACP controller and the launch controller over HTTP. There is no
 * identity adapter at all: HACP is identified by its session id alone.
 */
async function startHarness(publicBaseUrl?: string): Promise<Harness> {
  const forms: Record<string, unknown>[] = [];
  const launches: Array<{ callbackBaseUrl?: string }> = [];
  const reply: HacpResponseDto = {
    errorCode: 0,
    errorText: 'Successful',
    version: '3.5',
    aiccData: '[Core]\r\nLesson_Location=p4\r\n',
  };

  @Module({
    controllers: [AiccHacpController, LaunchesController],
    providers: [
      {
        provide: AiccHacpService,
        useValue: {
          handle: async (form: Record<string, unknown>) => {
            forms.push(form);
            return reply;
          },
        },
      },
      {
        provide: LaunchService,
        useValue: {
          launch: async (request: { callbackBaseUrl?: string }) => {
            launches.push(request);
            return { attemptId: 'a1', playerKind: 'iframe' };
          },
        },
      },
      {
        provide: LmsRequestService,
        useValue: {
          resolveLearner: async () => ({ externalId: 'u', displayName: 'U' }),
        },
      },
      {
        provide: RegistrationAccess,
        useValue: { assertRegistration: async () => undefined },
      },
      { provide: RLMS_MODULE_OPTIONS, useValue: { publicBaseUrl } },
      { provide: APP_FILTER, useClass: LmsExceptionFilter },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  })
  class TestModule {}

  const app: INestApplication = await NestFactory.create(TestModule, {
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    forms,
    launches,
    close: () => app.close(),
  };
}

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('POST /aicc/hacp', () => {
  test('reads the form, answers 200 with the reply as plain text, and needs no sign-in', async () => {
    harness = await startHarness();

    const response = await fetch(`${harness.baseUrl}/aicc/hacp`, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({
        command: 'PutParam',
        version: '3.5',
        session_id: 'sess-1',
        aicc_data: '[Core]\r\nLesson_Location=p4\r\n',
      }).toString(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(
      'error=0\r\nerror_text=Successful\r\nversion=3.5\r\naicc_data=[Core]\r\nLesson_Location=p4\r\n',
    );
    expect(harness.forms).toEqual([
      {
        command: 'PutParam',
        version: '3.5',
        session_id: 'sess-1',
        aicc_data: '[Core]\r\nLesson_Location=p4\r\n',
      },
    ]);
  });

  test('a request with no form still gets a HACP answer from the service', async () => {
    harness = await startHarness();

    const response = await fetch(`${harness.baseUrl}/aicc/hacp`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(harness.forms).toEqual([{}]);
  });

  test('other methods are not accepted', async () => {
    harness = await startHarness();

    const response = await fetch(`${harness.baseUrl}/aicc/hacp`);

    expect(response.status).toBe(404);
    expect(harness.forms).toEqual([]);
  });
});

describe('POST /registrations/:id/launches', () => {
  const launch = (url: string, host?: string) =>
    fetch(`${url}/registrations/r1/launches`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(host ? { host } : {}),
      },
      body: JSON.stringify({ courseModuleId: 'm1' }),
    });

  test('tells the launch service where the content can call back', async () => {
    harness = await startHarness();

    await launch(harness.baseUrl);

    expect(harness.launches).toHaveLength(1);
    expect(harness.launches[0]?.callbackBaseUrl).toBe(harness.baseUrl);
  });

  test('uses publicBaseUrl in place of the request host when one is set', async () => {
    harness = await startHarness('https://lms.example.com');

    await launch(harness.baseUrl);

    expect(harness.launches[0]?.callbackBaseUrl).toBe(
      'https://lms.example.com',
    );
  });
});
