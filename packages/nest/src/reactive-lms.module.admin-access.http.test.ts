import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { CapabilityAdapter } from '@richardmcquiston01/reactive-lms-shared';
import { afterEach, describe, expect, test } from 'bun:test';
import type { DataSource } from 'typeorm';
import {
  ReactiveLmsModule,
  type ReactiveLmsModuleOptions,
} from './reactive-lms.module';

let app: INestApplication | undefined;
let dataRoot: string | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  if (dataRoot) {
    await rm(dataRoot, { recursive: true, force: true });
    dataRoot = undefined;
  }
});

/**
 * Boots the real `ReactiveLmsModule` (providers, controllers, filters) with a
 * stub database, so what is checked is how the module options reach the
 * request service. A request that is refused never touches the database.
 */
async function start(
  extra: Partial<ReactiveLmsModuleOptions>,
): Promise<string> {
  dataRoot = await mkdtemp(path.join(tmpdir(), 'rlms-admin-access-'));
  @Module({
    imports: [
      ReactiveLmsModule.register({
        identityAdapter: {
          resolveLearner: async () => ({
            externalId: 'learner-1',
            displayName: 'Learner',
          }),
        },
        dataSource: {} as DataSource,
        dataRoot,
        routePrefix: 'lms',
        errorSink: () => undefined,
        ...extra,
      }),
    ],
  })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${port}/lms`;
}

async function createSection(baseUrl: string): Promise<Response> {
  return fetch(`${baseUrl}/course-sections`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ courseOfferingId: 'off-1', title: 'S' }),
  });
}

describe('administrative routes without a capability adapter', () => {
  test('are refused by default, with a message that names the fix', async () => {
    const baseUrl = await start({});

    const response = await createSection(baseUrl);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { message: string; code: string };
    expect(body.code).toBe('FORBIDDEN');
    expect(body.message).toContain('allowUnrestrictedAdmin');
  });

  test('every administrative route is refused', async () => {
    const baseUrl = await start({});
    const routes: Array<[string, string]> = [
      ['GET', '/course-sections'],
      ['POST', '/course-templates'],
      ['POST', '/course-sections/sec-1/modules'],
      ['PATCH', '/course-modules/mod-1'],
      ['DELETE', '/course-modules/mod-1'],
      ['GET', '/course-sections/sec-1/registrations'],
      ['POST', '/course-sections/sec-1/memberships'],
      ['GET', '/people'],
      ['GET', '/packages'],
      ['DELETE', '/packages/pkg-1'],
    ];

    for (const [method, route] of routes) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      });
      expect(`${method} ${route} -> ${response.status}`).toBe(
        `${method} ${route} -> 403`,
      );
    }
  });

  test('are passed through when the host opts in', async () => {
    const baseUrl = await start({ allowUnrestrictedAdmin: true });

    const response = await createSection(baseUrl);

    // Past the capability check; the stub database then fails the request.
    expect(response.status).not.toBe(403);
  });

  test('are decided by the adapter when one is set, whatever the opt-in', async () => {
    const deny: CapabilityAdapter = { can: async () => false };
    const baseUrl = await start({
      capabilityAdapter: deny,
      allowUnrestrictedAdmin: true,
    });

    const response = await createSection(baseUrl);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { message: string };
    expect(body.message).not.toContain('allowUnrestrictedAdmin');
  });

  test('an allowing adapter needs no opt-in', async () => {
    const allow: CapabilityAdapter = { can: async () => true };
    const baseUrl = await start({ capabilityAdapter: allow });

    const response = await createSection(baseUrl);

    expect(response.status).not.toBe(403);
  });
});
