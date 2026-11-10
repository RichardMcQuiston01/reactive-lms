import { describe, expect, test } from 'bun:test';
import {
  ActivityNode,
  Attempt,
  ContentPackage,
  CourseModule,
  CourseSection,
  NormalizedProgress,
  Person,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../../audit/event-log.service';
import { ProgressSinkService } from '../../progress/progress-sink';
import { createMockDataSource } from '../../test/mock-data-source';
import { ScormCmiService } from '../scorm/scorm-cmi.service';
import { AiccHacpService } from './aicc-hacp.service';
import { parseAiccData } from './hacp-data';

const REG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MODULE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NODE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PERSON_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SECTION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const PACKAGE_ID = '11111111-1111-4111-8111-111111111111';

type MockDs = ReturnType<typeof createMockDataSource>;

function build(ds: MockDs): AiccHacpService {
  const sink = new ProgressSinkService(
    ds as unknown as DataSource,
    new EventLogService(ds as unknown as DataSource),
  );
  const cmi = new ScormCmiService(ds as unknown as DataSource, sink);
  return new AiccHacpService(ds as unknown as DataSource, cmi);
}

function seedCourse(
  ds: MockDs,
  metadata: Record<string, unknown> = {
    masteryScore: 80,
    launchData: 'stage=2',
  },
  packageType = 'aicc',
): void {
  ds.seed(Person, {
    id: PERSON_ID,
    externalId: 'u1',
    displayName: 'Lovelace, Ada',
  });
  ds.seed(CourseSection, {
    id: SECTION_ID,
    title: 'Section',
    completionRule: { allModules: true },
  });
  ds.seed(ContentPackage, {
    id: PACKAGE_ID,
    packageType,
    title: 'Course',
    entryHref: 'index.html',
    extractedKey: 'k',
    storageKey: 's',
    manifestJson: {},
  });
  ds.seed(ActivityNode, {
    id: NODE_ID,
    contentPackageId: PACKAGE_ID,
    title: 'Unit',
    href: 'index.html',
    metadataJson: metadata,
  });
  ds.seed(CourseModule, {
    id: MODULE_ID,
    courseSectionId: SECTION_ID,
    contentPackageId: PACKAGE_ID,
    activityNodeId: NODE_ID,
    title: 'Unit',
    sortOrder: 0,
  });
  ds.seed(Registration, {
    id: REG_ID,
    personId: PERSON_ID,
    courseSectionId: SECTION_ID,
    status: 'not_started',
  });
}

function seedAttempt(
  ds: MockDs,
  sessionId: string,
  extras: Partial<Record<string, unknown>> = {},
): void {
  ds.seed(Attempt, {
    id: `attempt-${sessionId}`,
    registrationId: REG_ID,
    courseModuleId: MODULE_ID,
    activityNodeId: NODE_ID,
    sessionId,
    launchMode: 'Normal',
    termination: 'still_open',
    ...extras,
  });
}

const put = (...lines: string[]): string => `${lines.join('\r\n')}\r\n`;
const request = (
  command: string,
  sessionId: string,
  data?: string,
): Record<string, string> => ({
  command,
  version: '3.5',
  session_id: sessionId,
  ...(data === undefined ? {} : { aicc_data: data }),
});

/** Key=value pairs of one section of a GetParam reply. */
function section(data: string, name: string): Record<string, string> {
  const found = parseAiccData(data).find((entry) => entry.name === name);
  return Object.fromEntries(
    (found?.lines ?? [])
      .filter((line) => line.includes('='))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
}

describe('AiccHacpService: requests', () => {
  test('a request with no command, or an unknown one, is error 1 before any session check', async () => {
    const service = build(createMockDataSource());

    const none = await service.handle({ session_id: 'x' });
    expect(none.errorCode).toBe(1);
    expect(none.errorText).toContain('no command');

    const unknown = await service.handle(request('DeleteEverything', 'x'));
    expect(unknown.errorCode).toBe(1);
    expect(unknown.errorText).toContain('"deleteeverything"');
  });

  test('field names and the command match without regard to case', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');

    const reply = await build(ds).handle({
      COMMAND: 'GETPARAM',
      Session_ID: 's1',
      VERSION: '3.4',
    });
    expect(reply.errorCode).toBe(0);
    expect(reply.version).toBe('3.4');
  });

  test('a form value sent twice uses the last one', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');

    const reply = await build(ds).handle({
      command: 'GetParam',
      session_id: ['nope', 's1'],
    });
    expect(reply.errorCode).toBe(0);
  });

  test('the Put* commands that are not used answer success and change nothing', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');

    for (const command of [
      'PutComments',
      'PutObjectives',
      'PutInteractions',
      'PutPath',
      'PutPerformance',
    ]) {
      const reply = await build(ds).handle(
        request(command, 's1', put('[Comments]', 'x')),
      );
      expect(reply.errorCode).toBe(0);
    }
    expect(ds.rowsOf(NormalizedProgress)).toEqual([]);
  });
});

describe('AiccHacpService: sessions', () => {
  test.each([
    ['an empty id', ''],
    ['an unknown id', 'nope'],
    ['an id that is far too long', 'x'.repeat(500)],
  ])('%s is error 3', async (_name, sessionId) => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');

    const reply = await build(ds).handle(request('GetParam', sessionId));
    expect(reply).toMatchObject({
      errorCode: 3,
      errorText: 'Invalid Session ID',
    });
  });

  test('a missing session_id is error 3', async () => {
    const reply = await build(createMockDataSource()).handle({
      command: 'GetParam',
    });
    expect(reply.errorCode).toBe(3);
  });

  test.each([
    ['ended', { termination: 'terminated' }],
    ['replaced by a newer launch', { termination: 'abandoned' }],
  ])(
    'a session that has %s is error 3, with the same words as an unknown one',
    async (_n, extras) => {
      const ds = createMockDataSource();
      seedCourse(ds);
      seedAttempt(ds, 's1', extras);

      const reply = await build(ds).handle(
        request('PutParam', 's1', put('[Core]', 'Lesson_Location=x')),
      );
      expect(reply).toMatchObject({
        errorCode: 3,
        errorText: 'Invalid Session ID',
      });
      expect(ds.rowsOf(NormalizedProgress)).toEqual([]);
    },
  );

  test('the session of a SCORM attempt cannot be used on this endpoint', async () => {
    const ds = createMockDataSource();
    seedCourse(ds, {}, 'scorm_12');
    seedAttempt(ds, 's1');

    expect((await build(ds).handle(request('GetParam', 's1'))).errorCode).toBe(
      3,
    );
  });
});

describe('AiccHacpService: GetParam', () => {
  test('a first launch gives the learner, the unit settings, and a fresh state', async () => {
    const ds = createMockDataSource();
    seedCourse(ds, {
      masteryScore: 80,
      launchData: 'stage=2',
      maxTimeAllowed: '00:45:00',
      timeLimitAction: 'continue,no message',
    });
    seedAttempt(ds, 's1');

    const reply = await build(ds).handle(request('GetParam', 's1'));
    expect(reply).toMatchObject({ errorCode: 0, errorText: 'Successful' });
    expect(section(reply.aiccData, 'core')).toMatchObject({
      Student_ID: 'u1',
      Student_Name: 'Lovelace, Ada',
      Lesson_Location: '',
      Credit: 'C',
      Lesson_Status: 'Not Attempted',
      Score: '',
      Time: '00:00:00',
      Lesson_Mode: 'Normal',
    });
    expect(
      parseAiccData(reply.aiccData).find((s) => s.name === 'core_vendor')
        ?.lines[0],
    ).toBe('stage=2');
    expect(section(reply.aiccData, 'student_data')).toEqual({
      Mastery_Score: '80',
      Max_Time_Allowed: '00:45:00',
      Time_Limit_Action: 'C,N',
    });
  });
});

describe('AiccHacpService: PutParam', () => {
  test('stores what the content reports, and GetParam gives it back', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');
    const service = build(ds);

    const stored = await service.handle(
      request(
        'PutParam',
        's1',
        put(
          '[Core]',
          'Lesson_Location=page 4',
          'Lesson_Status=Incomplete',
          'Score=50,100,0',
          'Time=00:05:10',
          '[Core_Lesson]',
          'abc=1',
        ),
      ),
    );
    expect(stored.errorCode).toBe(0);

    const reply = await service.handle(request('GetParam', 's1'));
    expect(section(reply.aiccData, 'core')).toMatchObject({
      Lesson_Location: 'page 4',
      Lesson_Status: 'Incomplete',
      Score: '50,100,0',
    });
    expect(
      parseAiccData(reply.aiccData)
        .find((s) => s.name === 'core_lesson')
        ?.lines.join('\n')
        .trim(),
    ).toBe('abc=1');
  });

  test('rolls the status and score into progress', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');

    await build(ds).handle(
      request(
        'PutParam',
        's1',
        put('[Core]', 'Lesson_Status=Incomplete', 'Score=50,100,0'),
      ),
    );

    expect(ds.rowsOf(NormalizedProgress)).toEqual([
      expect.objectContaining({
        registrationId: REG_ID,
        courseModuleId: MODULE_ID,
        activityNodeId: NODE_ID,
        completionStatus: 'incomplete',
        scoreRaw: '50',
      }),
    ]);
  });

  test.each([
    ['a score that is not a number', 'Score=abc', 'Score (raw) "abc"'],
    ['a score over 100', 'Score=150,100,0', 'Score (raw) "150"'],
    ['a time that is not a time', 'Time=soon', 'Time "soon"'],
    [
      'a status AICC does not define',
      'Lesson_Status=Done',
      'Lesson_Status "Done"',
    ],
    [
      'an exit flag AICC does not define',
      'Lesson_Status=Passed,Quit',
      '"Quit"',
    ],
    [
      'a location that is too long',
      `Lesson_Location=${'x'.repeat(300)}`,
      'Lesson_Location',
    ],
  ])(
    '%s is error 1 naming the value, and nothing is saved',
    async (_name, line, reason) => {
      const ds = createMockDataSource();
      seedCourse(ds);
      seedAttempt(ds, 's1');

      const reply = await build(ds).handle(
        request(
          'PutParam',
          's1',
          put('[Core]', 'Lesson_Status=Incomplete', line),
        ),
      );

      expect(reply.errorCode).toBe(1);
      expect(reply.errorText).toContain(reason);
      expect(ds.rowsOf(NormalizedProgress)).toEqual([]);
    },
  );

  test('suspend data over the limit is refused', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');

    const reply = await build(ds).handle(
      request('PutParam', 's1', put('[Core_Lesson]', 'x'.repeat(5000))),
    );
    expect(reply.errorCode).toBe(1);
    expect(reply.errorText).toContain('[Core_Lesson]');
  });

  test('empty data is error 1', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');

    for (const data of [undefined, '', '  \r\n']) {
      const reply = await build(ds).handle(request('PutParam', 's1', data));
      expect(reply.errorCode).toBe(1);
      expect(reply.errorText).toContain('aicc_data');
    }
  });

  test('the content cannot change what only the LMS sets', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');
    const service = build(ds);

    await service.handle(
      request(
        'PutParam',
        's1',
        put(
          '[Core]',
          'Student_ID=hacker',
          'Credit=N',
          'Lesson_Location=ok',
          '[Student_Data]',
          'Mastery_Score=0',
        ),
      ),
    );

    const reply = await service.handle(request('GetParam', 's1'));
    const core = section(reply.aiccData, 'core');
    expect(core['Student_ID']).toBe('u1');
    expect(core['Credit']).toBe('C');
    expect(core['Lesson_Location']).toBe('ok');
    expect(section(reply.aiccData, 'student_data')['Mastery_Score']).toBe('80');
  });
});

describe('AiccHacpService: ExitAU', () => {
  test('ends the session, adds its time to the total, and refuses further requests', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');
    const service = build(ds);
    await service.handle(
      request(
        'PutParam',
        's1',
        put('[Core]', 'Lesson_Status=Incomplete', 'Time=00:05:10'),
      ),
    );

    const exit = await service.handle(request('ExitAU', 's1'));

    expect(exit.errorCode).toBe(0);
    expect(ds.rowsOf(Attempt)[0]).toMatchObject({ termination: 'terminated' });
    expect(ds.rowsOf(Attempt)[0]?.endedAt).toBeInstanceOf(Date);
    expect(ds.rowsOf(NormalizedProgress)[0]?.totalTimeIso8601).toBe('PT5M10S');
    for (const command of ['GetParam', 'PutParam', 'ExitAU']) {
      const refused = await service.handle(
        request(command, 's1', put('[Core]', 'Lesson_Location=x')),
      );
      expect(refused).toMatchObject({
        errorCode: 3,
        errorText: 'Invalid Session ID',
      });
    }
    expect(ds.rowsOf(NormalizedProgress)[0]?.totalTimeIso8601).toBe('PT5M10S');
  });

  test('the mastery score decides pass or fail, whatever status the content wrote', async () => {
    const run = async (raw: string): Promise<unknown> => {
      const ds = createMockDataSource();
      seedCourse(ds);
      seedAttempt(ds, 's1');
      const service = build(ds);
      await service.handle(
        request(
          'PutParam',
          's1',
          put('[Core]', 'Lesson_Status=Completed', `Score=${raw},100,0`),
        ),
      );
      await service.handle(request('ExitAU', 's1'));
      return ds.rowsOf(NormalizedProgress)[0]?.successStatus;
    };

    expect(await run('90')).toBe('passed');
    expect(await run('50')).toBe('failed');
  });

  test('completing the unit completes the registration', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');
    const service = build(ds);
    await service.handle(
      request(
        'PutParam',
        's1',
        put('[Core]', 'Lesson_Status=Completed', 'Score=90,100,0'),
      ),
    );
    await service.handle(request('ExitAU', 's1'));

    expect(ds.rowsOf(Registration)[0]?.status).toBe('passed');
  });

  test('a session left with a Suspend flag resumes in the next one, and time carries on', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');
    const service = build(ds);
    await service.handle(
      request(
        'PutParam',
        's1',
        put(
          '[Core]',
          'Lesson_Location=page 4',
          'Lesson_Status=Incomplete,Suspend',
          'Time=00:05:10',
          '[Core_Lesson]',
          'abc=1',
        ),
      ),
    );
    await service.handle(request('ExitAU', 's1'));

    // The learner comes back: a new launch makes a new attempt and session.
    seedAttempt(ds, 's2');
    const reply = await service.handle(request('GetParam', 's2'));
    expect(section(reply.aiccData, 'core')).toMatchObject({
      Lesson_Location: 'page 4',
      Lesson_Status: 'Incomplete',
      Time: '00:05:10',
    });
    expect(
      parseAiccData(reply.aiccData)
        .find((s) => s.name === 'core_lesson')
        ?.lines.join('')
        .trim(),
    ).toBe('abc=1');

    await service.handle(
      request('PutParam', 's2', put('[Core]', 'Time=00:02:00')),
    );
    await service.handle(request('ExitAU', 's2'));
    expect(ds.rowsOf(NormalizedProgress)[0]?.totalTimeIso8601).toBe('PT7M10S');
  });

  test('an exit with no time reported adds no time', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');
    const service = build(ds);

    await service.handle(request('ExitAU', 's1'));

    expect(ds.rowsOf(Attempt)[0]).toMatchObject({ termination: 'terminated' });
    expect(ds.rowsOf(NormalizedProgress)[0]?.totalTimeIso8601).toBe('PT0S');
  });

  test('values a later partial PutParam leaves out are kept for the session: time and the exit flag survive to ExitAU', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');
    const service = build(ds);
    await service.handle(
      request(
        'PutParam',
        's1',
        put('[Core]', 'Lesson_Status=Incomplete,Suspend', 'Time=00:05:10'),
      ),
    );
    // A second report that says nothing about time or how the unit is leaving.
    await service.handle(
      request('PutParam', 's1', put('[Core]', 'Lesson_Location=page 9')),
    );

    await service.handle(request('ExitAU', 's1'));

    expect(ds.rowsOf(NormalizedProgress)[0]?.totalTimeIso8601).toBe('PT5M10S');
    expect(
      (
        ds.rowsOf(NormalizedProgress)[0]?.extrasJson as {
          cmi: Record<string, string>;
        }
      ).cmi['cmi.core.exit'],
    ).toBe('suspend');
  });

  test('a new session does not inherit time or the exit flag from an earlier one', async () => {
    const ds = createMockDataSource();
    seedCourse(ds);
    seedAttempt(ds, 's1');
    const service = build(ds);
    await service.handle(
      request(
        'PutParam',
        's1',
        put('[Core]', 'Lesson_Status=Incomplete,Suspend', 'Time=00:05:10'),
      ),
    );
    // The first session ends without ExitAU: the learner launches again.
    ds.rowsOf(Attempt)[0]!.termination = 'abandoned';
    seedAttempt(ds, 's2');

    await service.handle(
      request('PutParam', 's2', put('[Core]', 'Lesson_Location=page 2')),
    );
    await service.handle(request('ExitAU', 's2'));

    expect(ds.rowsOf(NormalizedProgress)[0]?.totalTimeIso8601).toBe('PT0S');
    expect(
      (
        ds.rowsOf(NormalizedProgress)[0]?.extrasJson as {
          cmi: Record<string, string>;
        }
      ).cmi['cmi.core.exit'] ?? '',
    ).toBe('');
  });
});
