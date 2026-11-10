import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ActivityNode,
  Attempt,
  CourseModule,
  CourseOffering,
  CourseSection,
  CourseTemplate,
  NormalizedProgress,
  Person,
  Registration,
  createPersistenceDataSource,
} from '@richardmcquiston01/reactive-lms-persistence';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { EventLogService } from './audit/event-log.service';
import { PackageImporter } from './import/package-importer';
import { LaunchService } from './launch/launch-service';
import { ProgressSinkService } from './progress/progress-sink';
import { AiccHacpService } from './runtimes/aicc/aicc-hacp.service';
import { AiccRuntime } from './runtimes/aicc/aicc-runtime';
import { parseAiccData } from './runtimes/aicc/hacp-data';
import { Html5Runtime } from './runtimes/html5/html5-runtime';
import { Scorm12Runtime } from './runtimes/scorm/scorm-12-runtime';
import { ScormCmiService } from './runtimes/scorm/scorm-cmi.service';
import { FilesystemBlobStorageAdapter } from './storage/filesystem-blob-storage.adapter';
import { zipAiccFixture } from './testing/aicc-fixtures';

/**
 * Runs only against a real Postgres (`RLMS_TEST_DATABASE_URL`). It imports an
 * AICC package, launches it, and plays a whole HACP session the way the
 * content would, so the database sees real attempts, progress, and totals.
 */
const databaseUrl = process.env['RLMS_TEST_DATABASE_URL'];

let ds: DataSource;
let dataRoot: string;

beforeAll(async () => {
  if (!databaseUrl) {
    return;
  }
  ds = createPersistenceDataSource({ url: databaseUrl, migrationsRun: true });
  await ds.initialize();
  dataRoot = await mkdtemp(path.join(tmpdir(), 'rlms-aicc-'));
});

afterAll(async () => {
  if (ds?.isInitialized) {
    await ds.destroy();
  }
  if (dataRoot) {
    await rm(dataRoot, { recursive: true, force: true });
  }
});

const hacp = (): AiccHacpService => {
  const sink = new ProgressSinkService(ds, new EventLogService(ds));
  return new AiccHacpService(ds, new ScormCmiService(ds, sink));
};

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

const core = (data: string): Record<string, string> => {
  const lines = parseAiccData(data).find((s) => s.name === 'core')?.lines ?? [];
  return Object.fromEntries(
    lines
      .filter((line) => line.includes('='))
      .map((line) => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ]),
  );
};

describe.skipIf(!databaseUrl)('AICC end to end (real Postgres)', () => {
  test('import, launch, play a HACP session, exit, and resume in a second launch', async () => {
    const suffix = randomUUID();
    const sink = new ProgressSinkService(ds, new EventLogService(ds));
    const importer = new PackageImporter(
      ds,
      new FilesystemBlobStorageAdapter(dataRoot),
      [new Html5Runtime(), new Scorm12Runtime(), new AiccRuntime()],
    );
    const imported = await importer.import(zipAiccFixture('single-au'));
    expect(imported.packageType).toBe('aicc');

    const person = await ds.getRepository(Person).save({
      externalId: `ext-${suffix}`,
      displayName: 'Lovelace, Ada',
    });
    const template = await ds
      .getRepository(CourseTemplate)
      .save({ code: `T-${suffix}`, title: 'Template' });
    const offering = await ds
      .getRepository(CourseOffering)
      .save({ courseTemplateId: template.id, title: 'Offering' });
    const section = await ds.getRepository(CourseSection).save({
      courseOfferingId: offering.id,
      title: 'Section',
      completionRule: { allModules: true },
    });
    const node = await ds
      .getRepository(ActivityNode)
      .findOneByOrFail({ id: imported.activityNodeId });
    const courseModule = await ds.getRepository(CourseModule).save({
      courseSectionId: section.id,
      contentPackageId: imported.packageId,
      activityNodeId: node.id,
      title: 'Unit',
      sortOrder: 0,
    });
    const registration = await ds.getRepository(Registration).save({
      personId: person.id,
      courseSectionId: section.id,
      status: 'not_started',
    });

    const launches = new LaunchService(
      ds,
      [new Html5Runtime(), new Scorm12Runtime(), new AiccRuntime()],
      {},
      new EventLogService(ds),
      sink,
    );
    const launch = () =>
      launches.launch({
        registrationId: registration.id,
        courseModuleId: courseModule.id,
        learner: { externalId: person.externalId, displayName: 'Ada' },
        launchMode: 'Normal',
        callbackBaseUrl: 'http://localhost:3000/lms',
      });

    // First launch: the content is given a session and the endpoint address.
    const first = await launch();
    const contentUrl = new URL(first.contentUrl, 'http://localhost:3000');
    const sessionId = contentUrl.searchParams.get('AICC_SID') as string;
    expect(sessionId).toBe(first.sessionId);
    expect(contentUrl.searchParams.get('AICC_URL')).toBe(
      'http://localhost:3000/lms/aicc/hacp',
    );

    const service = hacp();
    const fresh = await service.handle(request('GetParam', sessionId));
    expect(core(fresh.aiccData)).toMatchObject({
      Student_ID: person.externalId,
      Lesson_Status: 'Not Attempted',
    });

    await service.handle(
      request(
        'PutParam',
        sessionId,
        '[Core]\r\nLesson_Location=page 4\r\nLesson_Status=Incomplete,Suspend\r\nTime=00:05:10\r\n[Core_Lesson]\r\nstate=1\r\n',
      ),
    );
    const bad = await service.handle(
      request('PutParam', sessionId, '[Core]\r\nScore=999\r\n'),
    );
    expect(bad.errorCode).toBe(1);
    expect((await service.handle(request('ExitAU', sessionId))).errorCode).toBe(
      0,
    );
    expect(
      (await service.handle(request('GetParam', sessionId))).errorCode,
    ).toBe(3);

    const attempts = await ds
      .getRepository(Attempt)
      .find({ where: { registrationId: registration.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.termination).toBe('terminated');

    // Second launch resumes where the first stopped, and passes the unit.
    const second = await launch();
    const resumed = await service.handle(request('GetParam', second.sessionId));
    expect(core(resumed.aiccData)).toMatchObject({
      Lesson_Location: 'page 4',
      Lesson_Status: 'Incomplete',
      Score: '',
      Time: '00:05:10',
    });
    await service.handle(
      request(
        'PutParam',
        second.sessionId,
        '[Core]\r\nLesson_Status=Completed\r\nScore=90,100,0\r\nTime=00:01:00\r\n',
      ),
    );
    await service.handle(request('ExitAU', second.sessionId));

    const progress = await ds.getRepository(NormalizedProgress).find({
      where: { registrationId: registration.id },
    });
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({
      completionStatus: 'completed',
      successStatus: 'passed',
      totalTimeIso8601: 'PT6M10S',
    });
    expect(Number(progress[0]?.scoreScaled)).toBeCloseTo(0.9);
    const reloaded = await ds
      .getRepository(Registration)
      .findOneByOrFail({ id: registration.id });
    expect(reloaded.status).toBe('passed');
  });
});
