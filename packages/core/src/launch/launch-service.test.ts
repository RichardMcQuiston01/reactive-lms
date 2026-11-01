import { describe, expect, test } from 'bun:test';
import {
  ActivityNode,
  Attempt,
  ContentPackage,
  CourseModule,
  Membership,
  EventLog,
  NormalizedProgress,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  LmsError,
  type LaunchRequest,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../audit/event-log.service';
import { Html5Runtime } from '../runtimes/html5/html5-runtime';
import { Scorm12Runtime } from '../runtimes/scorm/scorm-12-runtime';
import { createMockDataSource } from '../test/mock-data-source';
import { LaunchService } from './launch-service';

const SECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PERSON_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REG_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MODULE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PRIOR_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PACKAGE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const NODE_ID = '12121212-1212-4121-8121-121212121212';

const GROUP_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const REQUEST: LaunchRequest = {
  registrationId: REG_ID,
  courseModuleId: MODULE_ID,
  learner: { externalId: 'u1', displayName: 'Ada' },
  launchMode: 'Normal',
};

function launchService(
  ds: ReturnType<typeof createMockDataSource>,
): LaunchService {
  return new LaunchService(
    ds as unknown as DataSource,
    [new Html5Runtime(), new Scorm12Runtime()],
    {},
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

  test('launches a SCORM 1.2 module as a scorm-frame', async () => {
    const ds = createMockDataSource();
    seedLaunchable(ds);
    const pkg = ds.rowsOf(ContentPackage)[0];
    if (pkg) {
      pkg.packageType = 'scorm_12';
      pkg.entryHref = 'sco.html';
    }
    const node = ds.rowsOf(ActivityNode)[0];
    if (node) {
      node.href = 'sco.html';
    }

    const descriptor = await launchService(ds).launch(REQUEST);
    expect(descriptor.packageType).toBe('scorm_12');
    expect(descriptor.playerKind).toBe('scorm-frame');
    expect(descriptor.contentUrl).toBe(
      `/lms/content/packages/${PACKAGE_ID}/content/sco.html`,
    );
    expect(descriptor.runtimeConfig['activityNodeId']).toBe(NODE_ID);
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

  test('launches when the learner belongs to the required group', async () => {
    const ds = createMockDataSource();
    seedLaunchable(ds, {
      version: 1,
      all: [{ type: 'group_member', groupId: GROUP_ID }],
    });
    ds.seed(Membership, {
      personId: PERSON_ID,
      collectionType: 'group',
      collectionId: GROUP_ID,
      role: 'learner',
    });

    const descriptor = await launchService(ds).launch(REQUEST);

    expect(descriptor.playerKind).toBe('iframe');
  });

  test('refuses launch when the learner is not in the required group', async () => {
    const ds = createMockDataSource();
    seedLaunchable(ds, {
      version: 1,
      all: [{ type: 'group_member', groupId: GROUP_ID }],
    });
    ds.seed(Membership, {
      personId: PERSON_ID,
      collectionType: 'group',
      collectionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      role: 'learner',
    });

    await expect(launchService(ds).launch(REQUEST)).rejects.toMatchObject({
      code: 'MODULE_NOT_AVAILABLE',
      status: 403,
    });
    expect(ds.rowsOf(Attempt)).toEqual([]);
  });

  test('ignores course-section memberships when checking a group', async () => {
    const ds = createMockDataSource();
    seedLaunchable(ds, {
      version: 1,
      all: [{ type: 'group_member', groupId: GROUP_ID }],
    });
    ds.seed(Membership, {
      personId: PERSON_ID,
      collectionType: 'course_section',
      collectionId: GROUP_ID,
      role: 'learner',
    });

    await expect(launchService(ds).launch(REQUEST)).rejects.toMatchObject({
      code: 'MODULE_NOT_AVAILABLE',
    });
  });

  describe('activity node scoping', () => {
    const OTHER_PACKAGE_ID = '99999999-9999-4999-8999-999999999999';
    const FOREIGN_NODE_ID = '98989898-9898-4989-8989-989898989898';
    const SECOND_NODE_ID = '97979797-9797-4979-8979-979797979797';

    function seedForeignNode(
      ds: ReturnType<typeof createMockDataSource>,
    ): void {
      ds.seed(ContentPackage, {
        id: OTHER_PACKAGE_ID,
        packageType: 'html5',
        title: 'Other',
        entryHref: 'other.html',
        extractedKey: `packages/${OTHER_PACKAGE_ID}/content`,
        storageKey: `packages/${OTHER_PACKAGE_ID}/original.zip`,
        manifestJson: {},
      });
      ds.seed(ActivityNode, {
        id: FOREIGN_NODE_ID,
        contentPackageId: OTHER_PACKAGE_ID,
        title: 'Other package page',
        href: 'other.html',
      });
    }

    test('refuses a node from another package and opens no attempt', async () => {
      const ds = createMockDataSource();
      seedLaunchable(ds);
      seedForeignNode(ds);

      const result = launchService(ds).launch({
        ...REQUEST,
        activityNodeId: FOREIGN_NODE_ID,
      });

      await expect(result).rejects.toMatchObject({
        code: 'ACTIVITY_NODE_INVALID',
        status: 400,
      });
      expect(ds.rowsOf(Attempt)).toHaveLength(0);
    });

    test('refuses a module whose own stored node belongs to another package', async () => {
      const ds = createMockDataSource();
      seedLaunchable(ds);
      seedForeignNode(ds);
      const moduleRow = ds.rowsOf(CourseModule)[0];
      if (moduleRow) {
        moduleRow.activityNodeId = FOREIGN_NODE_ID;
      }

      const result = launchService(ds).launch(REQUEST);

      await expect(result).rejects.toMatchObject({
        code: 'ACTIVITY_NODE_INVALID',
      });
    });

    test('launches a different node of the module package and records it', async () => {
      const ds = createMockDataSource();
      seedLaunchable(ds);
      ds.seed(ActivityNode, {
        id: SECOND_NODE_ID,
        contentPackageId: PACKAGE_ID,
        title: 'Second page',
        href: 'second.html',
      });

      await launchService(ds).launch({
        ...REQUEST,
        activityNodeId: SECOND_NODE_ID,
      });

      expect(ds.rowsOf(Attempt)[0]?.activityNodeId).toBe(SECOND_NODE_ID);
    });
  });

  describe('module tree', () => {
    const BLOCK_ID = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
    const OUTER_ID = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';

    function seedBlock(
      ds: ReturnType<typeof createMockDataSource>,
      id: string,
      options: {
        parentModuleId?: string;
        availability?: CourseModule['availabilityJson'];
      } = {},
    ): void {
      ds.seed(CourseModule, {
        id,
        courseSectionId: SECTION_ID,
        parentModuleId: options.parentModuleId ?? null,
        contentPackageId: null,
        activityNodeId: null,
        title: 'Chapter',
        sortOrder: 0,
        availabilityJson: options.availability ?? null,
      });
    }

    function putInBlock(
      ds: ReturnType<typeof createMockDataSource>,
      parentModuleId: string,
    ): void {
      const row = ds
        .rowsOf(CourseModule)
        .find((entry) => entry.id === MODULE_ID);
      if (row) {
        row.parentModuleId = parentModuleId;
      }
    }

    test('a block cannot be launched', async () => {
      const ds = createMockDataSource();
      seedLaunchable(ds);
      seedBlock(ds, BLOCK_ID);

      await expect(
        launchService(ds).launch({ ...REQUEST, courseModuleId: BLOCK_ID }),
      ).rejects.toMatchObject({ code: 'MODULE_NOT_LAUNCHABLE', status: 409 });
      expect(ds.rowsOf(Attempt)).toEqual([]);
    });

    test('a module inside an open block launches', async () => {
      const ds = createMockDataSource();
      seedLaunchable(ds);
      seedBlock(ds, BLOCK_ID);
      putInBlock(ds, BLOCK_ID);

      const descriptor = await launchService(ds).launch(REQUEST);

      expect(descriptor.playerKind).toBe('iframe');
    });

    test('a closed block gates the modules inside it and names the block', async () => {
      const ds = createMockDataSource();
      seedLaunchable(ds);
      seedBlock(ds, BLOCK_ID, {
        availability: {
          version: 1,
          all: [{ type: 'date_window', from: '2999-01-01T00:00:00.000Z' }],
        },
      });
      putInBlock(ds, BLOCK_ID);

      const attempt = launchService(ds).launch(REQUEST);

      await expect(attempt).rejects.toMatchObject({
        code: 'MODULE_NOT_AVAILABLE',
        status: 403,
      });
      await expect(attempt).rejects.toThrow(
        'A containing block is not available',
      );
      await expect(attempt).rejects.toMatchObject({
        details: expect.objectContaining({
          blockModuleId: BLOCK_ID,
          moduleId: MODULE_ID,
        }),
      });
      expect(ds.rowsOf(Attempt)).toEqual([]);
    });

    test('rules on an outer block apply through a nested block', async () => {
      const ds = createMockDataSource();
      seedLaunchable(ds);
      seedBlock(ds, OUTER_ID, {
        availability: {
          version: 1,
          all: [{ type: 'group_member', groupId: GROUP_ID }],
        },
      });
      seedBlock(ds, BLOCK_ID, { parentModuleId: OUTER_ID });
      putInBlock(ds, BLOCK_ID);

      await expect(launchService(ds).launch(REQUEST)).rejects.toMatchObject({
        code: 'MODULE_NOT_AVAILABLE',
        details: expect.objectContaining({ blockModuleId: OUTER_ID }),
      });

      ds.seed(Membership, {
        personId: PERSON_ID,
        collectionType: 'group',
        collectionId: GROUP_ID,
        role: 'learner',
      });
      const descriptor = await launchService(ds).launch(REQUEST);
      expect(descriptor.playerKind).toBe('iframe');
    });

    test("the module's own rules still apply inside an open block", async () => {
      const ds = createMockDataSource();
      seedLaunchable(ds, {
        version: 1,
        all: [{ type: 'date_window', from: '2999-01-01T00:00:00.000Z' }],
      });
      seedBlock(ds, BLOCK_ID);
      putInBlock(ds, BLOCK_ID);

      const attempt = launchService(ds).launch(REQUEST);

      await expect(attempt).rejects.toMatchObject({
        code: 'MODULE_NOT_AVAILABLE',
      });
      await expect(attempt).rejects.toThrow('Module is not yet available.');
    });
  });
});
