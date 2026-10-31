import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import {
  LaunchService,
  ProgressSinkService,
  ScormCmiService,
} from '@richardmcquiston01/reactive-lms-core';
import {
  Attempt,
  Person,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import type {
  CapabilityAdapter,
  IdentityAdapter,
  LmsAction,
} from '@richardmcquiston01/reactive-lms-shared';
import { afterEach, describe, expect, test } from 'bun:test';
import { CatalogService } from '../catalog/catalog.service';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { LmsExceptionFilter } from '../filters/lms-exception.filter';
import { LmsRequestService } from '../identity/lms-request.service';
import { PersonDirectory } from '../identity/person-directory';
import { RegistrationAccess } from '../identity/registration-access';
import {
  RLMS_CAPABILITY_ADAPTER,
  RLMS_DATA_SOURCE,
  RLMS_IDENTITY_ADAPTER,
} from '../tokens';
import { LaunchesController } from './launches.controller';
import { ProgressController } from './progress.controller';
import { ScormRuntimeController } from './scorm-runtime.controller';

interface Harness {
  baseUrl: string;
  persons: Record<string, unknown>[];
  launched: string[];
  progressWrites: string[];
  cmiWrites: string[];
  close: () => Promise<void>;
}

/**
 * Boots the three learner-facing controllers with the real access checks
 * (`LmsRequestService`, `PersonDirectory`, `RegistrationAccess`) over an
 * in-memory database, and fake services behind them. The caller is named by
 * the `x-learner` header.
 */
async function startHarness(capability?: CapabilityAdapter): Promise<Harness> {
  const persons: Record<string, unknown>[] = [
    { id: 'p-alice', externalId: 'alice' },
    { id: 'p-bob', externalId: 'bob' },
  ];
  const tables: Record<string, Record<string, unknown>[]> = {
    Person: persons,
    Registration: [{ id: 'r-alice', personId: 'p-alice' }],
    Attempt: [{ id: 'a-alice', registrationId: 'r-alice' }],
  };
  const dataSource = {
    manager: {
      findOne: async (
        entity: { name: string },
        options: { where: Record<string, unknown> },
      ) =>
        (tables[entity.name] ?? []).find((row) =>
          Object.entries(options.where).every(
            ([key, value]) => row[key] === value,
          ),
        ) ?? null,
    },
  };
  // Make sure the entity classes the services look up are the ones we keyed.
  expect([Person.name, Registration.name, Attempt.name]).toEqual([
    'Person',
    'Registration',
    'Attempt',
  ]);

  const launched: string[] = [];
  const progressWrites: string[] = [];
  const cmiWrites: string[] = [];
  const identity: IdentityAdapter = {
    resolveLearner: async (request) => {
      const externalId = String(
        (request as { headers: Record<string, string> }).headers['x-learner'],
      );
      return { externalId, displayName: externalId };
    },
  } as IdentityAdapter;

  @Module({
    controllers: [
      LaunchesController,
      ProgressController,
      ScormRuntimeController,
    ],
    providers: [
      { provide: RLMS_DATA_SOURCE, useValue: dataSource },
      { provide: RLMS_IDENTITY_ADAPTER, useValue: identity },
      ...(capability
        ? [{ provide: RLMS_CAPABILITY_ADAPTER, useValue: capability }]
        : []),
      LmsRequestService,
      PersonDirectory,
      RegistrationAccess,
      {
        provide: LaunchService,
        useValue: {
          launch: async (request: { registrationId: string }) => {
            launched.push(request.registrationId);
            return { attemptId: 'a-alice', playerKind: 'iframe' };
          },
        },
      },
      {
        provide: ProgressSinkService,
        useValue: {
          upsertFromLaunch: async (input: { registrationId: string }) => {
            progressWrites.push(input.registrationId);
          },
        },
      },
      {
        provide: CatalogService,
        useValue: { listProgress: async () => [] },
      },
      {
        provide: ScormCmiService,
        useValue: {
          getCmi: async () => ({ values: {} }),
          putCmi: async (id: string, body: unknown) => {
            cmiWrites.push(id);
            return body;
          },
        },
      },
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
    persons,
    launched,
    progressWrites,
    cmiWrites,
    close: () => app.close(),
  };
}

const JSON_HEADERS = { 'content-type': 'application/json' };

function as(learner: string, body?: unknown): RequestInit {
  return {
    headers: { ...JSON_HEADERS, 'x-learner': learner },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('registration ownership without a capability adapter', () => {
  test('the owner can launch, report progress, read progress, and use CMI', async () => {
    harness = await startHarness();
    const url = harness.baseUrl;

    const launch = await fetch(`${url}/registrations/r-alice/launches`, {
      method: 'POST',
      ...as('alice', { courseModuleId: 'm1' }),
    });
    const write = await fetch(`${url}/registrations/r-alice/progress`, {
      method: 'POST',
      ...as('alice', { courseModuleId: 'm1', completionStatus: 'completed' }),
    });
    const read = await fetch(
      `${url}/registrations/r-alice/progress`,
      as('alice'),
    );
    const getCmi = await fetch(
      `${url}/scorm/attempts/a-alice/cmi`,
      as('alice'),
    );
    const putCmi = await fetch(`${url}/scorm/attempts/a-alice/cmi`, {
      method: 'PUT',
      ...as('alice', { values: {} }),
    });

    expect([
      launch.status,
      write.status,
      read.status,
      getCmi.status,
      putCmi.status,
    ]).toEqual([201, 204, 200, 200, 200]);
    expect(harness.launched).toEqual(['r-alice']);
    expect(harness.progressWrites).toEqual(['r-alice']);
    expect(harness.cmiWrites).toEqual(['a-alice']);
  });

  test("another learner cannot touch someone else's registration or attempt", async () => {
    harness = await startHarness();
    const url = harness.baseUrl;

    const responses = await Promise.all([
      fetch(`${url}/registrations/r-alice/launches`, {
        method: 'POST',
        ...as('bob', { courseModuleId: 'm1' }),
      }),
      fetch(`${url}/registrations/r-alice/progress`, {
        method: 'POST',
        ...as('bob', { courseModuleId: 'm1', completionStatus: 'completed' }),
      }),
      fetch(`${url}/registrations/r-alice/progress`, as('bob')),
      fetch(`${url}/scorm/attempts/a-alice/cmi`, as('bob')),
      fetch(`${url}/scorm/attempts/a-alice/cmi`, {
        method: 'PUT',
        ...as('bob', { values: {} }),
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403, 403, 403,
    ]);
    expect(await responses[0]?.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(harness.launched).toEqual([]);
    expect(harness.progressWrites).toEqual([]);
    expect(harness.cmiWrites).toEqual([]);
  });

  test('a caller with no person row is refused and no row is created for them', async () => {
    harness = await startHarness();

    const response = await fetch(
      `${harness.baseUrl}/registrations/r-alice/progress`,
      {
        method: 'POST',
        ...as('carol', { courseModuleId: 'm1' }),
      },
    );

    expect(response.status).toBe(403);
    expect(harness.persons).toHaveLength(2);
  });

  test('an unknown registration or attempt is 404, not 403', async () => {
    harness = await startHarness();
    const url = harness.baseUrl;

    const registration = await fetch(
      `${url}/registrations/nope/progress`,
      as('alice'),
    );
    const attempt = await fetch(`${url}/scorm/attempts/nope/cmi`, as('alice'));

    expect(registration.status).toBe(404);
    expect(await registration.json()).toMatchObject({
      code: 'REGISTRATION_NOT_FOUND',
    });
    expect(attempt.status).toBe(404);
    expect(await attempt.json()).toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
  });
});

describe('registration ownership with a capability adapter', () => {
  test('the host decides: staff it allows can act for a learner', async () => {
    const asked: string[] = [];
    harness = await startHarness({
      can: async (learner, action: LmsAction, resource) => {
        asked.push(
          `${learner.externalId}:${action}:${resource.type}:${resource.id}`,
        );
        return learner.externalId === 'bob';
      },
    });

    const response = await fetch(
      `${harness.baseUrl}/registrations/r-alice/launches`,
      {
        method: 'POST',
        ...as('bob', { courseModuleId: 'm1' }),
      },
    );

    expect(response.status).toBe(201);
    expect(asked).toEqual(['bob:launch:registration:r-alice']);
  });

  test('being the owner does not bypass a host that denies', async () => {
    harness = await startHarness({ can: async () => false });

    const response = await fetch(
      `${harness.baseUrl}/registrations/r-alice/launches`,
      {
        method: 'POST',
        ...as('alice', { courseModuleId: 'm1' }),
      },
    );

    expect(response.status).toBe(403);
    expect(harness.launched).toEqual([]);
  });
});
