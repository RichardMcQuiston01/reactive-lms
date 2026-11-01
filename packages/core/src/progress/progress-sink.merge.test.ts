import { describe, expect, test } from 'bun:test';
import {
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
const MODULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NODE_ID = '44444444-4444-4444-8444-444444444444';
const REG_ID = '22222222-2222-4222-8222-222222222222';
const PERSON_ID = '33333333-3333-4333-8333-333333333333';

function setup(): {
  ds: ReturnType<typeof createMockDataSource>;
  sink: ProgressSinkService;
  slot: {
    registrationId: string;
    courseModuleId: string;
    activityNodeId: string;
  };
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
    contentPackageId: '11111111-1111-4111-8111-111111111111',
    title: 'Module',
    sortOrder: 0,
  });
  ds.seed(Registration, {
    id: REG_ID,
    personId: PERSON_ID,
    courseSectionId: SECTION_ID,
    status: 'not_started',
  });
  return {
    ds,
    sink: new ProgressSinkService(
      ds as unknown as DataSource,
      new EventLogService(ds as unknown as DataSource),
    ),
    slot: {
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      activityNodeId: NODE_ID,
    },
  };
}

const row = (ds: ReturnType<typeof createMockDataSource>) =>
  ds.rowsOf(NormalizedProgress)[0];

describe('ProgressSinkService.upsert keeps what a report leaves out', () => {
  test('a completion-only report keeps the saved score, bookmark, time, and suspend data', async () => {
    const { ds, sink, slot } = setup();
    await sink.upsert({
      ...slot,
      completionStatus: 'incomplete',
      successStatus: 'unknown',
      scoreRaw: 80,
      scoreScaled: 0.8,
      location: 'page-3',
      totalTime: 'PT1M',
      suspendData: 'state',
    });

    await sink.upsert({
      ...slot,
      completionStatus: 'completed',
      successStatus: 'unknown',
    });

    expect(ds.rowsOf(NormalizedProgress)).toHaveLength(1);
    expect(row(ds)).toMatchObject({
      completionStatus: 'completed',
      scoreRaw: '80',
      scoreScaled: '0.8',
      location: 'page-3',
      totalTimeIso8601: 'PT1M',
      suspendData: 'state',
    });
  });

  test('a bookmark-only report does not undo completion', async () => {
    const { ds, sink, slot } = setup();
    await sink.upsert({
      ...slot,
      completionStatus: 'completed',
      successStatus: 'passed',
    });

    await sink.upsert({
      ...slot,
      completionStatus: 'unknown',
      successStatus: 'unknown',
      location: 'page-9',
    });

    expect(row(ds)).toMatchObject({
      completionStatus: 'completed',
      successStatus: 'passed',
      location: 'page-9',
    });
    expect(ds.rowsOf(Registration)[0]?.status).toBe('passed');
  });

  test('values that are reported replace the stored ones', async () => {
    const { ds, sink, slot } = setup();
    await sink.upsert({
      ...slot,
      completionStatus: 'incomplete',
      successStatus: 'failed',
      scoreRaw: 40,
    });

    await sink.upsert({
      ...slot,
      completionStatus: 'completed',
      successStatus: 'passed',
      scoreRaw: 90,
    });

    expect(row(ds)).toMatchObject({
      completionStatus: 'completed',
      successStatus: 'passed',
      scoreRaw: '90',
    });
  });

  test('an empty string clears text that was stored, since it is a reported value', async () => {
    const { ds, sink, slot } = setup();
    await sink.upsert({
      ...slot,
      completionStatus: 'incomplete',
      successStatus: 'unknown',
      suspendData: 'state',
    });

    await sink.upsert({
      ...slot,
      completionStatus: 'unknown',
      successStatus: 'unknown',
      suspendData: '',
    });

    expect(row(ds)?.suspendData).toBe('');
  });

  test('a first report stores omitted fields as null', async () => {
    const { ds, sink, slot } = setup();

    await sink.upsert({
      ...slot,
      completionStatus: 'incomplete',
      successStatus: 'unknown',
    });

    expect(row(ds)).toMatchObject({
      scoreRaw: null,
      location: null,
      totalTimeIso8601: null,
      suspendData: null,
    });
  });

  test('a registration that does not exist is a 404, not a database error', async () => {
    const { ds, sink, slot } = setup();

    const result = sink.upsert({
      ...slot,
      registrationId: '88888888-8888-4888-8888-888888888888',
      completionStatus: 'completed',
      successStatus: 'unknown',
    });

    await expect(result).rejects.toMatchObject({
      code: 'REGISTRATION_NOT_FOUND',
      status: 404,
    });
    expect(ds.rowsOf(NormalizedProgress)).toHaveLength(0);
  });
});
