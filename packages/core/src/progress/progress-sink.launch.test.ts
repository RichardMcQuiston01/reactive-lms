import { describe, expect, test } from 'bun:test';
import {
  Attempt,
  CourseModule,
  CourseSection,
  NormalizedProgress,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../audit/event-log.service';
import { createMockDataSource } from '../test/mock-data-source';
import { ProgressSinkService } from './progress-sink';

const SECTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_SECTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MODULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOCKED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BLOCK_ID = '99999999-9999-4999-8999-999999999999';
const FOREIGN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REG_ID = '22222222-2222-4222-8222-222222222222';
const PERSON_ID = '33333333-3333-4333-8333-333333333333';
const LAUNCHED_NODE = '44444444-4444-4444-8444-444444444444';
const OTHER_NODE = '55555555-5555-4555-8555-555555555555';
const PACKAGE_ID = '11111111-1111-4111-8111-111111111111';

function setup(): {
  ds: ReturnType<typeof createMockDataSource>;
  sink: ProgressSinkService;
} {
  const ds = createMockDataSource();
  ds.seed(CourseSection, {
    id: SECTION_ID,
    courseOfferingId: '00000000-0000-4000-8000-000000000000',
    title: 'Section',
    completionRule: { allModules: true },
  });
  ds.seed(CourseModule, {
    id: MODULE_ID,
    courseSectionId: SECTION_ID,
    contentPackageId: PACKAGE_ID,
    title: 'Open module',
    sortOrder: 0,
  });
  ds.seed(CourseModule, {
    id: LOCKED_ID,
    courseSectionId: SECTION_ID,
    contentPackageId: PACKAGE_ID,
    title: 'Locked module',
    sortOrder: 1,
    availabilityJson: {
      version: 1,
      all: [{ type: 'module_completed', moduleId: MODULE_ID }],
    },
  });
  ds.seed(CourseModule, {
    id: BLOCK_ID,
    courseSectionId: SECTION_ID,
    contentPackageId: null,
    title: 'Chapter',
    sortOrder: 2,
  });
  ds.seed(CourseModule, {
    id: FOREIGN_ID,
    courseSectionId: OTHER_SECTION_ID,
    contentPackageId: PACKAGE_ID,
    title: 'Other section module',
    sortOrder: 0,
  });
  ds.seed(Registration, {
    id: REG_ID,
    personId: PERSON_ID,
    courseSectionId: SECTION_ID,
    status: 'not_started',
  });
  ds.seed(Attempt, {
    id: '66666666-6666-4666-8666-666666666666',
    registrationId: REG_ID,
    courseModuleId: MODULE_ID,
    activityNodeId: LAUNCHED_NODE,
    sessionId: 'session-1',
    termination: 'still_open',
  });
  const sink = new ProgressSinkService(
    ds as unknown as DataSource,
    new EventLogService(ds as unknown as DataSource),
  );
  return { ds, sink };
}

const completed = {
  completionStatus: 'completed' as const,
  successStatus: 'unknown' as const,
};

describe('ProgressSinkService.upsertFromLaunch', () => {
  test('records progress for a launched module against the launched node', async () => {
    const { ds, sink } = setup();

    await sink.upsertFromLaunch({
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      ...completed,
    });

    expect(ds.rowsOf(NormalizedProgress)).toHaveLength(1);
    expect(ds.rowsOf(NormalizedProgress)[0]).toMatchObject({
      courseModuleId: MODULE_ID,
      activityNodeId: LAUNCHED_NODE,
      completionStatus: 'completed',
    });
  });

  test('accepts a supplied node that is the launched one', async () => {
    const { ds, sink } = setup();

    await sink.upsertFromLaunch({
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      activityNodeId: LAUNCHED_NODE,
      ...completed,
    });

    expect(ds.rowsOf(NormalizedProgress)).toHaveLength(1);
  });

  test('refuses a module that was never launched, so a locked module cannot be completed', async () => {
    const { ds, sink } = setup();

    const attempt = sink.upsertFromLaunch({
      registrationId: REG_ID,
      courseModuleId: LOCKED_ID,
      ...completed,
    });

    await expect(attempt).rejects.toMatchObject({
      code: 'LAUNCH_REQUIRED',
      status: 409,
    });
    expect(ds.rowsOf(NormalizedProgress)).toHaveLength(0);
    expect(ds.rowsOf(Registration)[0]?.status).toBe('not_started');
  });

  test('refuses once the attempt is no longer open', async () => {
    const { ds, sink } = setup();
    const attempt = ds.rowsOf(Attempt)[0];
    if (attempt) {
      attempt.termination = 'terminated';
    }

    const result = sink.upsertFromLaunch({
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      ...completed,
    });

    await expect(result).rejects.toMatchObject({ code: 'LAUNCH_REQUIRED' });
  });

  test('refuses a node other than the launched one', async () => {
    const { ds, sink } = setup();

    const result = sink.upsertFromLaunch({
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      activityNodeId: OTHER_NODE,
      ...completed,
    });

    await expect(result).rejects.toMatchObject({
      code: 'ACTIVITY_NODE_INVALID',
      status: 400,
    });
    expect(ds.rowsOf(NormalizedProgress)).toHaveLength(0);
  });

  test('refuses an attempt that recorded no node', async () => {
    const { ds, sink } = setup();
    const attempt = ds.rowsOf(Attempt)[0];
    if (attempt) {
      attempt.activityNodeId = null;
    }

    const result = sink.upsertFromLaunch({
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      ...completed,
    });

    await expect(result).rejects.toMatchObject({
      code: 'ACTIVITY_NODE_INVALID',
    });
  });

  test('refuses a module of another section as not found', async () => {
    const { sink } = setup();

    const result = sink.upsertFromLaunch({
      registrationId: REG_ID,
      courseModuleId: FOREIGN_ID,
      ...completed,
    });

    await expect(result).rejects.toMatchObject({
      code: 'MODULE_NOT_FOUND',
      status: 404,
    });
  });

  test('refuses a block', async () => {
    const { sink } = setup();

    const result = sink.upsertFromLaunch({
      registrationId: REG_ID,
      courseModuleId: BLOCK_ID,
      ...completed,
    });

    await expect(result).rejects.toMatchObject({
      code: 'MODULE_NOT_LAUNCHABLE',
    });
  });

  test('refuses an unknown module and an unknown registration', async () => {
    const { sink } = setup();

    await expect(
      sink.upsertFromLaunch({
        registrationId: REG_ID,
        courseModuleId: '77777777-7777-4777-8777-777777777777',
        ...completed,
      }),
    ).rejects.toMatchObject({ code: 'MODULE_NOT_FOUND' });
    await expect(
      sink.upsertFromLaunch({
        registrationId: '88888888-8888-4888-8888-888888888888',
        courseModuleId: MODULE_ID,
        ...completed,
      }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_NOT_FOUND', status: 404 });
  });
});
