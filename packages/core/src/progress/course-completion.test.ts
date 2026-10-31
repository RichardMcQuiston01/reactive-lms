import { describe, expect, test } from 'bun:test';
import {
  CourseModule,
  CourseSection,
  EventLog,
  NormalizedProgress,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../audit/event-log.service';
import { createMockDataSource } from '../test/mock-data-source';
import { computeRegistrationStatus } from './course-completion';
import type { ModuleProgressSnapshot } from './course-completion';
import { ProgressSinkService } from './progress-sink';

const MODULE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MODULE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MODULE_IDS = [MODULE_A, MODULE_B];

function progress(
  entries: Array<[string, ModuleProgressSnapshot]>,
): ReadonlyMap<string, ModuleProgressSnapshot> {
  return new Map(entries);
}

describe('computeRegistrationStatus', () => {
  test('is not_started when no module has progress', () => {
    const status = computeRegistrationStatus({
      rule: { allModules: true },
      moduleIds: MODULE_IDS,
      progressByModuleId: new Map(),
    });
    expect(status).toBe('not_started');
  });

  test('is in_progress when only the first of two modules is completed', () => {
    const status = computeRegistrationStatus({
      rule: { allModules: true },
      moduleIds: MODULE_IDS,
      progressByModuleId: progress([
        [MODULE_A, { completionStatus: 'completed', successStatus: 'unknown' }],
      ]),
    });
    expect(status).toBe('in_progress');
  });

  test('is completed when both modules are completed and none report success', () => {
    const status = computeRegistrationStatus({
      rule: { allModules: true },
      moduleIds: MODULE_IDS,
      progressByModuleId: progress([
        [MODULE_A, { completionStatus: 'completed', successStatus: 'unknown' }],
        [MODULE_B, { completionStatus: 'completed', successStatus: 'unknown' }],
      ]),
    });
    expect(status).toBe('completed');
  });

  test('defaults to allModules when rule is omitted', () => {
    const status = computeRegistrationStatus({
      moduleIds: MODULE_IDS,
      progressByModuleId: progress([
        [MODULE_A, { completionStatus: 'completed', successStatus: 'unknown' }],
        [MODULE_B, { completionStatus: 'completed', successStatus: 'unknown' }],
      ]),
    });
    expect(status).toBe('completed');
  });

  test('is passed when every module that reports success has passed', () => {
    const status = computeRegistrationStatus({
      rule: { allModules: true },
      moduleIds: MODULE_IDS,
      progressByModuleId: progress([
        [MODULE_A, { completionStatus: 'completed', successStatus: 'passed' }],
        [MODULE_B, { completionStatus: 'completed', successStatus: 'unknown' }],
      ]),
    });
    expect(status).toBe('passed');
  });

  test('is failed when any reporting module failed', () => {
    const status = computeRegistrationStatus({
      rule: { allModules: true },
      moduleIds: MODULE_IDS,
      progressByModuleId: progress([
        [MODULE_A, { completionStatus: 'completed', successStatus: 'passed' }],
        [MODULE_B, { completionStatus: 'completed', successStatus: 'failed' }],
      ]),
    });
    expect(status).toBe('failed');
  });

  test('is in_progress when a module has started but none are complete', () => {
    const status = computeRegistrationStatus({
      rule: { allModules: true },
      moduleIds: MODULE_IDS,
      progressByModuleId: progress([
        [
          MODULE_A,
          { completionStatus: 'incomplete', successStatus: 'unknown' },
        ],
      ]),
    });
    expect(status).toBe('in_progress');
  });
});

const SECTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REG_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PERSON_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NODE_A = '12121212-1212-4121-8121-121212121212';
const NODE_B = '34343434-3434-4343-8343-343434343434';

describe('ProgressSinkService', () => {
  test('first module complete leaves in_progress; both complete → completed', async () => {
    const ds = createMockDataSource();
    ds.seed(CourseSection, {
      id: SECTION_ID,
      courseOfferingId: '00000000-0000-4000-8000-000000000000',
      title: 'Section',
      completionRule: { allModules: true },
    });
    ds.seed(CourseModule, {
      id: MODULE_A,
      courseSectionId: SECTION_ID,
      contentPackageId: '11111111-1111-4111-8111-111111111111',
      title: 'A',
      sortOrder: 0,
    });
    ds.seed(CourseModule, {
      id: MODULE_B,
      courseSectionId: SECTION_ID,
      contentPackageId: '11111111-1111-4111-8111-111111111111',
      title: 'B',
      sortOrder: 1,
    });
    ds.seed(Registration, {
      id: REG_ID,
      personId: PERSON_ID,
      courseSectionId: SECTION_ID,
      status: 'not_started',
    });

    const sink = new ProgressSinkService(
      ds as unknown as DataSource,
      new EventLogService(ds as unknown as DataSource),
    );

    await sink.upsert({
      registrationId: REG_ID,
      courseModuleId: MODULE_A,
      activityNodeId: NODE_A,
      completionStatus: 'completed',
      successStatus: 'unknown',
    });
    expect(ds.rowsOf(Registration)[0]?.status).toBe('in_progress');

    await sink.upsert({
      registrationId: REG_ID,
      courseModuleId: MODULE_B,
      activityNodeId: NODE_B,
      completionStatus: 'completed',
      successStatus: 'unknown',
    });
    expect(ds.rowsOf(Registration)[0]?.status).toBe('completed');
    expect(ds.rowsOf(NormalizedProgress)).toHaveLength(2);
    expect(ds.rowsOf(EventLog).map((row) => row.action)).toEqual([
      'progress.committed',
      'progress.committed',
    ]);
  });

  test('blocks do not count toward section completion', async () => {
    const ds = createMockDataSource();
    const BLOCK = '99999999-9999-4999-8999-999999999999';
    ds.seed(CourseSection, {
      id: SECTION_ID,
      courseOfferingId: '00000000-0000-4000-8000-000000000000',
      title: 'Section',
      completionRule: { allModules: true },
    });
    ds.seed(CourseModule, {
      id: BLOCK,
      courseSectionId: SECTION_ID,
      contentPackageId: null,
      title: 'Chapter',
      sortOrder: 0,
    });
    ds.seed(CourseModule, {
      id: MODULE_A,
      courseSectionId: SECTION_ID,
      parentModuleId: BLOCK,
      contentPackageId: '11111111-1111-4111-8111-111111111111',
      title: 'A',
      sortOrder: 0,
    });
    ds.seed(Registration, {
      id: REG_ID,
      personId: PERSON_ID,
      courseSectionId: SECTION_ID,
      status: 'not_started',
    });
    const sink = new ProgressSinkService(
      ds as unknown as DataSource,
      new EventLogService(ds as unknown as DataSource),
    );

    await sink.upsert({
      registrationId: REG_ID,
      courseModuleId: MODULE_A,
      activityNodeId: NODE_A,
      completionStatus: 'completed',
      successStatus: 'unknown',
    });

    // The block has no progress row and never will; it must not hold the
    // section open.
    expect(ds.rowsOf(Registration)[0]?.status).toBe('completed');
  });
});
