import { describe, expect, test } from 'bun:test';
import {
  ActivityNode,
  Attempt,
  CourseModule,
  CourseSection,
  NormalizedProgress,
  Person,
  Registration,
} from '@reactive-lms/persistence';
import { LmsError } from '@reactive-lms/shared';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../../audit/event-log.service';
import { ProgressSinkService } from '../../progress/progress-sink';
import { createMockDataSource } from '../../test/mock-data-source';
import { ScormCmiService } from './scorm-cmi.service';

const ATTEMPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MODULE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NODE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PERSON_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SECTION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function service(ds: ReturnType<typeof createMockDataSource>): ScormCmiService {
  const sink = new ProgressSinkService(
    ds as unknown as DataSource,
    new EventLogService(ds as unknown as DataSource),
  );
  return new ScormCmiService(ds as unknown as DataSource, sink);
}

function seedAttempt(
  ds: ReturnType<typeof createMockDataSource>,
  extras?: Record<string, unknown>,
): void {
  ds.seed(Person, {
    id: PERSON_ID,
    externalId: 'u1',
    displayName: 'Ada Lovelace',
  });
  ds.seed(CourseSection, {
    id: SECTION_ID,
    title: 'Section',
    completionRule: { allModules: true },
  });
  ds.seed(CourseModule, {
    id: MODULE_ID,
    courseSectionId: SECTION_ID,
    contentPackageId: '11111111-1111-4111-8111-111111111111',
    activityNodeId: NODE_ID,
    title: 'SCO',
    sortOrder: 0,
  });
  ds.seed(ActivityNode, {
    id: NODE_ID,
    contentPackageId: '11111111-1111-4111-8111-111111111111',
    title: 'Playing',
    href: 'sco.html',
    metadataJson: { launchData: 'hole=1' },
  });
  ds.seed(Registration, {
    id: REG_ID,
    personId: PERSON_ID,
    courseSectionId: SECTION_ID,
    status: 'not_started',
  });
  ds.seed(Attempt, {
    id: ATTEMPT_ID,
    registrationId: REG_ID,
    courseModuleId: MODULE_ID,
    activityNodeId: NODE_ID,
    sessionId: 'sess-1',
    launchMode: 'Normal',
    termination: 'still_open',
  });
  if (extras) {
    ds.seed(NormalizedProgress, {
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      activityNodeId: NODE_ID,
      completionStatus: 'incomplete',
      successStatus: 'unknown',
      extrasJson: extras,
    });
  }
}

describe('ScormCmiService', () => {
  test('hydrates student fields and launch_data', async () => {
    const ds = createMockDataSource();
    seedAttempt(ds);

    const { values } = await service(ds).getCmi(ATTEMPT_ID);
    expect(values['cmi.core.student_id']).toBe('u1');
    expect(values['cmi.core.student_name']).toBe('Ada Lovelace');
    expect(values['cmi.launch_data']).toBe('hole=1');
    expect(values['cmi.core.lesson_mode']).toBe('normal');
    expect(values['cmi.core.entry']).toBe('ab-initio');
  });

  test('hydrates numeric score.raw and overwrites stale LMS-owned keys', async () => {
    const ds = createMockDataSource();
    seedAttempt(ds, {
      cmi: {
        'cmi.core.score.raw': 80,
        'cmi.core.student_id': 'stale-id',
        'cmi.core.student_name': 'Stale Name',
        'cmi.core.lesson_mode': 'browse',
        'cmi.launch_data': 'old',
        'cmi.core.lesson_location': 'page-2',
      },
    });

    const { values } = await service(ds).getCmi(ATTEMPT_ID);
    expect(values['cmi.core.score.raw']).toBe('80');
    expect(values['cmi.core.student_id']).toBe('u1');
    expect(values['cmi.core.student_name']).toBe('Ada Lovelace');
    expect(values['cmi.core.lesson_mode']).toBe('normal');
    expect(values['cmi.launch_data']).toBe('hole=1');
    expect(values['cmi.core.lesson_location']).toBe('page-2');
  });

  test('resumes entry and bookmark after a suspend commit', async () => {
    const ds = createMockDataSource();
    seedAttempt(ds, {
      cmi: {
        'cmi.core.lesson_location': 'page-2',
        'cmi.core.lesson_status': 'incomplete',
        'cmi.suspend_data': 'saved',
        'cmi.core.exit': 'suspend',
      },
    });

    const { values } = await service(ds).getCmi(ATTEMPT_ID);
    expect(values['cmi.core.entry']).toBe('resume');
    expect(values['cmi.core.lesson_location']).toBe('page-2');
    expect(values['cmi.suspend_data']).toBe('saved');
  });

  test('commit of lesson_status=completed updates progress', async () => {
    const ds = createMockDataSource();
    seedAttempt(ds);

    const result = await service(ds).putCmi(ATTEMPT_ID, {
      values: {
        'cmi.core.lesson_status': 'completed',
        'cmi.core.score.raw': '90',
        'cmi.core.score.min': '0',
        'cmi.core.score.max': '100',
      },
      finished: true,
    });

    expect(result.values['cmi.core.lesson_status']).toBe('completed');
    const progress = ds.rowsOf(NormalizedProgress)[0];
    expect(progress).toMatchObject({
      registrationId: REG_ID,
      courseModuleId: MODULE_ID,
      activityNodeId: NODE_ID,
      completionStatus: 'completed',
      scoreRaw: '90',
    });
    const extras = progress?.extrasJson as { cmi?: Record<string, string> };
    expect(extras.cmi?.['cmi.core.lesson_status']).toBe('completed');
    expect(ds.rowsOf(Registration)[0]?.status).toBe('completed');
    expect(ds.rowsOf(Attempt)[0]).toMatchObject({
      termination: 'terminated',
    });
  });

  test('throws ATTEMPT_NOT_FOUND for an unknown attempt', async () => {
    const ds = createMockDataSource();
    try {
      await service(ds).getCmi(ATTEMPT_ID);
      throw new Error('expected getCmi to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'ATTEMPT_NOT_FOUND',
        status: 404,
      });
    }
  });
});
