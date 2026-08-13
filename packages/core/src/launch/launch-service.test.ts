import { describe, expect, test } from 'bun:test';
import {
  ActivityNode,
  Attempt,
  ContentPackage,
  CourseModule,
  EventLog,
  NormalizedProgress,
  Registration,
} from '@reactive-lms/persistence';
import { LmsError, type LaunchRequest, type StorageAdapter } from '@reactive-lms/shared';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../audit/event-log.service';
import { Html5Runtime } from '../runtimes/html5/html5-runtime';
import { createMockDataSource } from '../test/mock-data-source';
import { LaunchService } from './launch-service';

const SECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSON_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REG_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MODULE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PRIOR_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PACKAGE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const NODE_ID = '12121212-1212-4121-8121-121212121212';

const REQUEST: LaunchRequest = {
  registrationId: REG_ID,
  courseModuleId: MODULE_ID,
  learner: { externalId: 'u1', displayName: 'Ada' },
  launchMode: 'Normal',
};

function storage(): StorageAdapter {
  return {
    put: async () => undefined,
    get: async () => new Uint8Array(),
    getPublicUrl: async (key) => `/lms/content/${key}`,
    extractZip: async () => [],
    remove: async () => undefined,
  };
}

function launchService(ds: ReturnType<typeof createMockDataSource>): LaunchService {
  return new LaunchService(
    ds as unknown as DataSource,
    storage(),
    [new Html5Runtime()],
    new EventLogService(ds as unknown as DataSource),
  );
}

function seedLaunchable(
  ds: ReturnType<typeof createMockDataSource>,
  availability?: CourseModule['availabilityJson'],
): void {
  ds.seed(Registration, {
    id: REG_ID,
    personId: PERSON_ID,
    courseSectionId: SECTION_ID,
    status: 'not_started',
  });
  ds.seed(ContentPackage, {
    id: PACKAGE_ID,
    packageType: 'html5',
    title: 'Demo',
    entryHref: 'index.html',
    extractedKey: `packages/${PACKAGE_ID}/content`,
    storageKey: `packages/${PACKAGE_ID}/original.zip`,
    manifestJson: {},
  });
  ds.seed(ActivityNode, {
    id: NODE_ID,
    contentPackageId: PACKAGE_ID,
    title: 'Demo',
    href: 'index.html',
  });
  ds.seed(CourseModule, {
    id: MODULE_ID,
    courseSectionId: SECTION_ID,
    contentPackageId: PACKAGE_ID,
    activityNodeId: NODE_ID,
    title: 'Module 1',
    sortOrder: 0,
    availabilityJson: availability ?? null,
  });
}

describe('LaunchService', () => {
  test('creates an attempt and returns an HTML5 iframe descriptor', async () => {
    const ds = createMockDataSource();
    seedLaunchable(ds);

    const descriptor = await launchService(ds).launch(REQUEST);

    expect(descriptor.packageType).toBe('html5');
    expect(descriptor.playerKind).toBe('iframe');
    expect(descriptor.contentUrl).toBe(
      `/lms/content/packages/${PACKAGE_ID}/content/index.html`,
    );
    expect(descriptor.attemptId).toBeDefined();
    expect(descriptor.sessionId).toBeDefined();
    expect(descriptor.runtimeConfig['activityNodeId']).toBe(NODE_ID);

    const attempts = ds.rowsOf(Attempt);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      id: descriptor.attemptId,
      sessionId: descriptor.sessionId,
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      termination: 'still_open',
      launchMode: 'Normal',
    });

    expect(ds.rowsOf(EventLog)).toEqual([
      expect.objectContaining({
        personId: PERSON_ID,
        action: 'launch.started',
        subjectType: 'attempt',
        subjectId: descriptor.attemptId,
      }),
    ]);
  });

  test('puts the package entry node on launch when the module has none', async () => {
    const ds = createMockDataSource();
    seedLaunchable(ds);
    const moduleRow = ds.rowsOf(CourseModule)[0];
    if (moduleRow) {
      moduleRow.activityNodeId = null;
    }

    const descriptor = await launchService(ds).launch(REQUEST);

    expect(descriptor.runtimeConfig['activityNodeId']).toBe(NODE_ID);
    expect(ds.rowsOf(Attempt)[0]?.activityNodeId).toBe(NODE_ID);
  });

  test('abandons a still_open attempt before opening a new one', async () => {
    const ds = createMockDataSource();
    seedLaunchable(ds);
    ds.seed(Attempt, {
      id: 'abababab-abab-4bab-8bab-abababababab',
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      sessionId: 'old-session',
      launchMode: 'Normal',
      termination: 'still_open',
    });

    const descriptor = await launchService(ds).launch(REQUEST);
    const attempts = ds.rowsOf(Attempt);
    expect(attempts).toHaveLength(2);
    const abandoned = attempts.find(
      (row) => row.id === 'abababab-abab-4bab-8bab-abababababab',
    );
    expect(abandoned).toMatchObject({
      termination: 'abandoned',
    });
    expect(abandoned?.endedAt).toBeInstanceOf(Date);
    expect(
      attempts.find((row) => row.id === descriptor.attemptId)?.termination,
    ).toBe('still_open');
  });

  test('throws MODULE_NOT_AVAILABLE when the prerequisite is incomplete', async () => {
    const ds = createMockDataSource();
    seedLaunchable(ds, { afterModuleId: PRIOR_ID });

    try {
      await launchService(ds).launch(REQUEST);
      throw new Error('expected launch to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'MODULE_NOT_AVAILABLE',
        status: 403,
      });
    }
    expect(ds.rowsOf(Attempt)).toEqual([]);
  });

  test('allows launch after the prerequisite module is completed', async () => {
    const ds = createMockDataSource();
    seedLaunchable(ds, { afterModuleId: PRIOR_ID });
    ds.seed(NormalizedProgress, {
      registrationId: REG_ID,
      courseModuleId: PRIOR_ID,
      activityNodeId: NODE_ID,
      completionStatus: 'completed',
      successStatus: 'unknown',
    });

    const descriptor = await launchService(ds).launch(REQUEST);
    expect(descriptor.playerKind).toBe('iframe');
  });

  test('throws REGISTRATION_NOT_FOUND when the registration is missing', async () => {
    const ds = createMockDataSource();
    try {
      await launchService(ds).launch(REQUEST);
      throw new Error('expected launch to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'REGISTRATION_NOT_FOUND',
        status: 404,
      });
    }
  });
});
