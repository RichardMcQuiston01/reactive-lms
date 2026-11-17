import { describe, expect, test } from 'bun:test';
import {
  ActivityNode,
  Attempt,
  CourseModule,
  CourseSection,
  InteractionResponse,
  NormalizedProgress,
  Person,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  CmiStore,
  LmsError,
  type CmiValues,
} from '@richardmcquiston01/reactive-lms-shared';
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
  nodeMetadata: Record<string, unknown> = { launchData: 'hole=1' },
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
    metadataJson: nodeMetadata,
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

  test('entry is empty, not ab-initio, after a session that was not suspended', async () => {
    const ds = createMockDataSource();
    seedAttempt(ds, {
      cmi: {
        'cmi.core.lesson_location': 'page-2',
        'cmi.core.lesson_status': 'incomplete',
      },
    });

    const { values } = await service(ds).getCmi(ATTEMPT_ID);

    expect(values['cmi.core.entry']).toBe('');
  });

  test('a suspended session does not make every later session a resume', async () => {
    const ds = createMockDataSource();
    seedAttempt(ds, {
      cmi: {
        'cmi.core.lesson_status': 'incomplete',
        'cmi.core.exit': 'suspend',
      },
    });
    const cmi = service(ds);

    expect((await cmi.getCmi(ATTEMPT_ID)).values['cmi.core.entry']).toBe(
      'resume',
    );
    // This session finishes normally and does not set an exit.
    await cmi.putCmi(ATTEMPT_ID, {
      values: { 'cmi.core.lesson_status': 'completed' },
      finished: true,
    });

    const after = await cmi.getCmi(ATTEMPT_ID);
    expect(after.values['cmi.core.entry']).toBe('');
    expect(after.values['cmi.core.exit']).toBeUndefined();
  });

  test('a score with no range is read as a percentage', async () => {
    const ds = createMockDataSource();
    seedAttempt(ds);

    await service(ds).putCmi(ATTEMPT_ID, {
      values: {
        'cmi.core.lesson_status': 'completed',
        'cmi.core.score.raw': '85',
      },
    });

    expect(ds.rowsOf(NormalizedProgress)[0]?.scoreScaled).toBe('0.85');
  });

  describe('mastery score', () => {
    const withMastery = {
      masteryScore: 80,
      maxTimeAllowed: '00:30:00',
      timeLimitAction: 'exit,message',
    };
    const finishWith = (
      raw: string,
      status = 'completed',
      extra: Record<string, string> = {},
    ) => ({
      values: {
        'cmi.core.score.raw': raw,
        'cmi.core.lesson_status': status,
        ...extra,
      },
      finished: true,
    });

    test('the SCO can read the mastery score and time limits the manifest set', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, undefined, withMastery);

      const { values } = await service(ds).getCmi(ATTEMPT_ID);

      expect(values['cmi.student_data.mastery_score']).toBe('80');
      expect(values['cmi.student_data.max_time_allowed']).toBe('00:30:00');
      expect(values['cmi.student_data.time_limit_action']).toBe('exit,message');
    });

    test('a score at or above it passes, whatever status the SCO wrote', async () => {
      for (const written of ['completed', 'incomplete', 'failed']) {
        const ds = createMockDataSource();
        seedAttempt(ds, undefined, withMastery);

        const { values } = await service(ds).putCmi(
          ATTEMPT_ID,
          finishWith('80', written),
        );

        expect(values['cmi.core.lesson_status']).toBe('passed');
        expect(ds.rowsOf(NormalizedProgress)[0]).toMatchObject({
          completionStatus: 'completed',
          successStatus: 'passed',
        });
        expect(ds.rowsOf(Registration)[0]?.status).toBe('passed');
      }
    });

    test('a score below it fails, even when the SCO wrote passed', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, undefined, withMastery);

      const { values } = await service(ds).putCmi(
        ATTEMPT_ID,
        finishWith('79.5', 'passed'),
      );

      expect(values['cmi.core.lesson_status']).toBe('failed');
      expect(ds.rowsOf(NormalizedProgress)[0]?.successStatus).toBe('failed');
      expect(ds.rowsOf(Registration)[0]?.status).toBe('failed');
    });

    test('the verdict is what the next launch reads', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, undefined, withMastery);
      const cmi = service(ds);
      await cmi.putCmi(ATTEMPT_ID, finishWith('90'));

      const { values } = await cmi.getCmi(ATTEMPT_ID);

      expect(values['cmi.core.lesson_status']).toBe('passed');
    });

    test('is applied when the SCO finishes, not on every commit', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, undefined, withMastery);

      const { values } = await service(ds).putCmi(ATTEMPT_ID, {
        values: {
          'cmi.core.score.raw': '95',
          'cmi.core.lesson_status': 'incomplete',
        },
      });

      expect(values['cmi.core.lesson_status']).toBe('incomplete');
    });

    test('changes nothing without a raw score', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, undefined, withMastery);

      const { values } = await service(ds).putCmi(ATTEMPT_ID, {
        values: { 'cmi.core.lesson_status': 'completed' },
        finished: true,
      });

      expect(values['cmi.core.lesson_status']).toBe('completed');
    });

    test('changes nothing when the manifest set no mastery score', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);

      const { values } = await service(ds).putCmi(
        ATTEMPT_ID,
        finishWith('10', 'completed'),
      );

      expect(values['cmi.core.lesson_status']).toBe('completed');
      expect(values['cmi.student_data.mastery_score']).toBe('');
    });

    test('a suspended session keeps its status, and the next one that ends normally is judged', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, undefined, withMastery);

      const suspended = await service(ds).putCmi(
        ATTEMPT_ID,
        finishWith('40', 'incomplete', { 'cmi.core.exit': 'suspend' }),
      );

      expect(suspended.values['cmi.core.lesson_status']).toBe('incomplete');
      expect(ds.rowsOf(NormalizedProgress)[0]).toMatchObject({
        completionStatus: 'incomplete',
        successStatus: 'unknown',
      });
      expect(ds.rowsOf(Registration)[0]?.status).not.toBe('failed');

      const finished = await service(ds).putCmi(
        ATTEMPT_ID,
        finishWith('90', 'completed', { 'cmi.core.exit': 'logout' }),
      );

      expect(finished.values['cmi.core.lesson_status']).toBe('passed');
    });

    test('a SCO cannot change it', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, undefined, withMastery);

      const { values } = await service(ds).putCmi(
        ATTEMPT_ID,
        finishWith('50', 'completed', {
          'cmi.student_data.mastery_score': '10',
        }),
      );

      expect(values['cmi.student_data.mastery_score']).toBe('80');
      expect(values['cmi.core.lesson_status']).toBe('failed');
    });
  });

  describe('interactions', () => {
    const quiz = {
      'cmi.interactions.0.id': 'q1',
      'cmi.interactions.0.type': 'choice',
      'cmi.interactions.0.student_response': 'b',
      'cmi.interactions.0.result': 'correct',
      'cmi.interactions.1.id': 'q2',
      'cmi.interactions.1.result': 'wrong',
    };
    const storedCmi = (ds: ReturnType<typeof createMockDataSource>) =>
      (ds.rowsOf(NormalizedProgress)[0]?.extrasJson as { cmi: CmiValues }).cmi;

    test('are saved with the attempt', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);

      await service(ds).putCmi(ATTEMPT_ID, {
        values: { 'cmi.core.lesson_status': 'incomplete', ...quiz },
      });

      expect(storedCmi(ds)).toMatchObject(quiz);
    });

    test('are not read back to the SCO, which cannot read them anyway', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);
      const cmi = service(ds);
      await cmi.putCmi(ATTEMPT_ID, {
        values: { 'cmi.core.lesson_status': 'incomplete', ...quiz },
      });

      const { values } = await cmi.getCmi(ATTEMPT_ID);

      expect(
        Object.keys(values).filter((key) =>
          key.startsWith('cmi.interactions.'),
        ),
      ).toEqual([]);
    });

    test('a later session that records some replaces the earlier ones', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);
      const cmi = service(ds);
      await cmi.putCmi(ATTEMPT_ID, {
        values: { 'cmi.core.lesson_status': 'incomplete', ...quiz },
      });

      await cmi.putCmi(ATTEMPT_ID, {
        values: {
          'cmi.core.lesson_status': 'completed',
          'cmi.interactions.0.id': 'retake-1',
          'cmi.interactions.0.result': 'correct',
        },
      });

      const stored = storedCmi(ds);
      expect(stored['cmi.interactions.0.id']).toBe('retake-1');
      expect(stored['cmi.interactions.1.id']).toBeUndefined();
      expect(stored['cmi.interactions.0.student_response']).toBeUndefined();
    });

    test('a later session that records none keeps the earlier ones', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);
      const cmi = service(ds);
      await cmi.putCmi(ATTEMPT_ID, {
        values: { 'cmi.core.lesson_status': 'incomplete', ...quiz },
      });

      await cmi.putCmi(ATTEMPT_ID, {
        values: { 'cmi.core.lesson_status': 'completed' },
        finished: true,
      });

      expect(storedCmi(ds)).toMatchObject(quiz);
    });

    describe('answer rows', () => {
      const answers = (ds: ReturnType<typeof createMockDataSource>) =>
        ds.rowsOf(InteractionResponse);

      test('are written one per interaction, tied to the attempt', async () => {
        const ds = createMockDataSource();
        seedAttempt(ds);

        await service(ds).putCmi(ATTEMPT_ID, {
          values: { 'cmi.core.lesson_status': 'incomplete', ...quiz },
        });

        expect(answers(ds)).toHaveLength(2);
        expect(answers(ds)[0]).toMatchObject({
          attemptId: ATTEMPT_ID,
          registrationId: REG_ID,
          courseModuleId: MODULE_ID,
          activityNodeId: NODE_ID,
          interactionIndex: 0,
          interactionId: 'q1',
          interactionType: 'choice',
          studentResponse: 'b',
          result: 'correct',
        });
        expect(answers(ds)[1]).toMatchObject({
          interactionIndex: 1,
          interactionId: 'q2',
          result: 'wrong',
        });
      });

      test('are replaced, not duplicated, when the attempt reports again', async () => {
        const ds = createMockDataSource();
        seedAttempt(ds);
        const cmi = service(ds);
        await cmi.putCmi(ATTEMPT_ID, { values: quiz });

        await cmi.putCmi(ATTEMPT_ID, {
          values: {
            'cmi.interactions.0.id': 'retake-1',
            'cmi.interactions.0.result': 'correct',
          },
        });

        expect(answers(ds).map((row) => row.interactionId)).toEqual([
          'retake-1',
        ]);
      });

      test('are left alone by a save that reports none', async () => {
        const ds = createMockDataSource();
        seedAttempt(ds);
        const cmi = service(ds);
        await cmi.putCmi(ATTEMPT_ID, { values: quiz });

        await cmi.putCmi(ATTEMPT_ID, {
          values: { 'cmi.core.lesson_status': 'completed' },
          finished: true,
        });

        expect(answers(ds)).toHaveLength(2);
      });

      test('are not written when the SCO reports no interactions at all', async () => {
        const ds = createMockDataSource();
        seedAttempt(ds);

        await service(ds).putCmi(ATTEMPT_ID, {
          values: { 'cmi.core.lesson_status': 'incomplete' },
        });

        expect(answers(ds)).toEqual([]);
      });
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

  describe('server-side validation of the browser snapshot', () => {
    /** Runs a commit that is expected to be refused and returns the error. */
    const refusal = async (
      cmi: ScormCmiService,
      values: Record<string, unknown>,
      finished = false,
    ): Promise<LmsError> => {
      try {
        await cmi.putCmi(ATTEMPT_ID, {
          values: values as Record<string, string>,
          finished,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(LmsError);
        return error as LmsError;
      }
      throw new Error('expected the commit to be refused');
    };

    test.each([
      [
        'a score over 100',
        { 'cmi.core.score.raw': '999' },
        'cmi.core.score.raw "999"',
        '405',
      ],
      [
        'a score that is not a number',
        { 'cmi.core.score.raw': 'lots' },
        'cmi.core.score.raw "lots"',
        '405',
      ],
      [
        'a location that is too long',
        { 'cmi.core.lesson_location': 'x'.repeat(5000) },
        'cmi.core.lesson_location',
        '405',
      ],
      [
        'suspend data that is too long',
        { 'cmi.suspend_data': 'x'.repeat(5000) },
        'cmi.suspend_data',
        '405',
      ],
      [
        'a status outside the vocabulary',
        { 'cmi.core.lesson_status': 'bogus' },
        'cmi.core.lesson_status "bogus"',
        '405',
      ],
      [
        'an exit outside the vocabulary',
        { 'cmi.core.exit': 'quit' },
        'cmi.core.exit "quit"',
        '405',
      ],
      [
        'a time that is not a time',
        { 'cmi.core.session_time': 'soon' },
        'cmi.core.session_time "soon"',
        '405',
      ],
      [
        'an element that does not exist',
        { 'cmi.core.nonsense': '1' },
        'cmi.core.nonsense',
        '401',
      ],
      [
        'an array index past the limit',
        { 'cmi.interactions.99999.id': 'q' },
        'cmi.interactions.99999.id',
        '201',
      ],
      [
        'an interaction type outside the vocabulary',
        { 'cmi.interactions.0.type': 'essay' },
        'cmi.interactions.0.type "essay"',
        '405',
      ],
    ])(
      'refuses %s, naming the element and the SCORM error, and saves nothing',
      async (_name, values, named, code) => {
        const ds = createMockDataSource();
        seedAttempt(ds);

        const error = await refusal(service(ds), values);

        expect(error.code).toBe('CMI_VALUE_INVALID');
        expect(error.status).toBe(400);
        expect(error.message).toContain('was not saved');
        expect(error.message).toContain(named);
        expect(error.message).toContain(`error ${code}`);
        expect(ds.rowsOf(NormalizedProgress)).toEqual([]);
        expect(ds.rowsOf(Attempt)[0]).toMatchObject({
          termination: 'still_open',
        });
      },
    );

    test('a value that is not text or a number is refused', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);

      const error = await refusal(service(ds), {
        'cmi.core.score.raw': { nested: true },
      });

      expect(error.message).toContain('not text or a number');
    });

    test('one bad value refuses the whole commit, and every bad value is named', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);

      const error = await refusal(service(ds), {
        'cmi.core.lesson_status': 'completed',
        'cmi.core.score.raw': '999',
        'cmi.core.lesson_status.extra': 'x',
        'cmi.core.lesson_location': 'x'.repeat(300),
      });

      expect(error.message).toContain('cmi.core.score.raw');
      expect(error.message).toContain('cmi.core.lesson_status.extra');
      expect(error.message).toContain('cmi.core.lesson_location');
      expect(ds.rowsOf(NormalizedProgress)).toEqual([]);
    });

    test('a long list is cut in the message and kept in the details', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);
      const bad = Object.fromEntries(
        Array.from({ length: 25 }, (_, index) => [
          `cmi.nonsense.${index}`,
          'x',
        ]),
      );

      const error = await refusal(service(ds), bad);

      expect(error.message).toContain('and 15 more');
      expect((error.details as { refused: unknown[] }).refused).toHaveLength(
        25,
      );
    });

    test('read-only values the browser sends back are ignored, not saved and not refused', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, undefined, { masteryScore: 80 });
      const cmi = service(ds);

      await cmi.putCmi(ATTEMPT_ID, {
        values: {
          'cmi.core.student_id': 'hacker',
          'cmi.core.credit': 'no-credit',
          'cmi.core.lesson_mode': 'browse',
          'cmi.core.total_time': '9999:00:00.00',
          'cmi.student_data.mastery_score': '0',
          'cmi.core.lesson_location': 'page 2',
        },
      });

      const { values } = await cmi.getCmi(ATTEMPT_ID);
      expect(values['cmi.core.student_id']).toBe('u1');
      expect(values['cmi.core.credit']).toBe('credit');
      expect(values['cmi.core.lesson_mode']).toBe('normal');
      expect(values['cmi.core.total_time']).toBe('0000:00:00.00');
      expect(values['cmi.student_data.mastery_score']).toBe('80');
      expect(values['cmi.core.lesson_location']).toBe('page 2');
    });

    test('the total time is worked out from the session time, not taken from the browser', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);

      await service(ds).putCmi(ATTEMPT_ID, {
        values: {
          'cmi.core.session_time': '00:01:00.00',
          'cmi.core.total_time': '9999:00:00.00',
          'cmi.core.lesson_status': 'completed',
        },
        finished: true,
      });

      expect(ds.rowsOf(NormalizedProgress)[0]?.totalTimeIso8601).toBe('PT1M');
    });

    test('a finish that is sent again for a closed attempt does not add the session time again', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds);
      const cmi = service(ds);
      const finish = {
        values: {
          'cmi.core.session_time': '00:01:00.00',
          'cmi.core.lesson_status': 'completed',
        },
        finished: true,
      };

      await cmi.putCmi(ATTEMPT_ID, finish);
      await cmi.putCmi(ATTEMPT_ID, finish);

      expect(ds.rowsOf(NormalizedProgress)[0]?.totalTimeIso8601).toBe('PT1M');
    });

    test('a value the server already holds is accepted when it comes back, even if the store would not take it now', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, {
        cmi: { 'legacy.key': 'kept', 'cmi.core.lesson_status': 'incomplete' },
      });

      await service(ds).putCmi(ATTEMPT_ID, {
        values: { 'legacy.key': 'kept', 'cmi.core.lesson_location': 'p2' },
      });

      const stored = ds.rowsOf(NormalizedProgress)[0]?.extrasJson as {
        cmi: CmiValues;
      };
      expect(stored.cmi['legacy.key']).toBe('kept');
      expect(stored.cmi['cmi.core.lesson_location']).toBe('p2');
    });

    test('a real browser-side session is accepted and saves what the SCO reported', async () => {
      const ds = createMockDataSource();
      seedAttempt(ds, undefined, { masteryScore: 80 });
      const cmi = service(ds);
      // What the player bridge does: seed a store from the hydrate, run the SCO's calls, commit.
      const { values: hydrated } = await cmi.getCmi(ATTEMPT_ID);
      const browser = new CmiStore({ values: hydrated });
      expect(browser.LMSInitialize('')).toBe('true');
      const calls: Array<[string, string]> = [
        ['cmi.core.lesson_location', 'page 4'],
        ['cmi.core.score.raw', '90'],
        ['cmi.core.score.min', '0'],
        ['cmi.core.score.max', '100'],
        ['cmi.suspend_data', 'a=1&b=2'],
        ['cmi.core.session_time', '00:05:10.00'],
        ['cmi.core.exit', 'logout'],
        ['cmi.core.lesson_status', 'completed'],
        ['cmi.objectives.0.id', 'obj-1'],
        ['cmi.objectives.0.status', 'passed'],
        ['cmi.interactions.0.id', 'q1'],
        ['cmi.interactions.0.type', 'choice'],
        ['cmi.interactions.0.student_response', 'b'],
        ['cmi.interactions.0.result', 'correct'],
        ['cmi.comments', 'nice course'],
      ];
      for (const [element, value] of calls) {
        expect(browser.LMSSetValue(element, value)).toBe('true');
      }
      expect(browser.LMSFinish('')).toBe('true');

      const saved = await cmi.putCmi(ATTEMPT_ID, {
        values: browser.snapshot(),
        finished: true,
      });

      // The server reaches the same state the browser did: same total time, and
      // the mastery score has turned "completed" into "passed" (90 is at least 80).
      expect(saved.values['cmi.core.total_time']).toBe(
        browser.snapshot()['cmi.core.total_time'],
      );
      expect(saved.values['cmi.core.lesson_status']).toBe('passed');
      expect(saved.values['cmi.core.lesson_location']).toBe('page 4');
      expect(saved.values['cmi.suspend_data']).toBe('a=1&b=2');
      expect(saved.values['cmi.objectives.0.id']).toBe('obj-1');
      expect(saved.values['cmi.interactions.0.result']).toBe('correct');
      expect(ds.rowsOf(NormalizedProgress)[0]).toMatchObject({
        completionStatus: 'completed',
        successStatus: 'passed',
        totalTimeIso8601: 'PT5M10S',
      });
      expect(ds.rowsOf(Attempt)[0]).toMatchObject({
        termination: 'terminated',
      });
    });
  });
});
