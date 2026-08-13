import { randomUUID } from 'node:crypto';
import {
  ActivityNode,
  Attempt,
  ContentPackage,
  CourseModule,
  NormalizedProgress as NormalizedProgressRow,
  Registration,
} from '@reactive-lms/persistence';
import type {
  ContentRuntime,
  LaunchDescriptor,
  LaunchRequest,
  StorageAdapter,
} from '@reactive-lms/shared';
import {
  LAUNCH_NOT_IMPLEMENTED,
  LmsError,
  MODULE_NOT_FOUND,
  REGISTRATION_NOT_FOUND,
  httpStatusForLmsCode,
} from '@reactive-lms/shared';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../audit/event-log.service';
import { Html5Runtime } from '../runtimes/html5/html5-runtime';
import type { AvailabilityProgress } from './availability';
import { assertAvailable } from './availability';

/**
 * Creates an attempt, checks availability, and asks the matching
 * content runtime for a launch descriptor. HTML5 is the only runtime
 * implemented in this slice.
 */
export class LaunchService {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource
   * @param storage - Blob store used to resolve the HTML5 content URL
   * @param runtimes - Registered content runtimes (HTML5 required)
   * @param events - Audit writer; constructed from `dataSource` when omitted
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageAdapter,
    private readonly runtimes: ContentRuntime[],
    private readonly events: EventLogService = new EventLogService(dataSource),
  ) {}

  /**
   * Launches a module for an existing registration.
   *
   * @param request - Registration, module, learner, and launch mode
   */
  async launch(request: LaunchRequest): Promise<LaunchDescriptor> {
    return this.dataSource.transaction(async (manager) => {
      const registration = await manager.findOne(Registration, {
        where: { id: request.registrationId },
      });
      if (!registration) {
        throw new LmsError({
          status: httpStatusForLmsCode(REGISTRATION_NOT_FOUND),
          code: REGISTRATION_NOT_FOUND,
          message: 'Registration not found.',
          details: { registrationId: request.registrationId },
        });
      }

      const courseModule = await manager.findOne(CourseModule, {
        where: { id: request.courseModuleId },
      });
      if (
        !courseModule ||
        courseModule.courseSectionId !== registration.courseSectionId
      ) {
        throw new LmsError({
          status: httpStatusForLmsCode(MODULE_NOT_FOUND),
          code: MODULE_NOT_FOUND,
          message: 'Course module not found for this registration.',
          details: { courseModuleId: request.courseModuleId },
        });
      }

      const progressRows = await manager.find(NormalizedProgressRow, {
        where: { registrationId: registration.id },
      });
      assertAvailable(
        courseModule,
        progressMapFromRows(progressRows),
        new Date(),
      );

      const contentPackage = await manager.findOne(ContentPackage, {
        where: { id: courseModule.contentPackageId },
      });
      const runtime = this.runtimes.find(
        (entry) => entry.packageType === contentPackage?.packageType,
      );
      if (
        !contentPackage ||
        !runtime ||
        contentPackage.packageType !== 'html5'
      ) {
        throw new LmsError({
          status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
          code: LAUNCH_NOT_IMPLEMENTED,
          message:
            'Launch is not implemented for ' +
            `${contentPackage?.packageType ?? 'missing package'}.`,
          details: {
            contentPackageId: courseModule.contentPackageId,
            packageType: contentPackage?.packageType,
          },
        });
      }

      const nodeId =
        request.activityNodeId ?? courseModule.activityNodeId ?? undefined;
      const activityNode = nodeId
        ? await manager.findOne(ActivityNode, {
            where: { id: nodeId },
          })
        : null;
      const entryHref = activityNode?.href ?? contentPackage.entryHref;
      const extractedKey = contentPackage.extractedKey;
      if (!extractedKey || !entryHref) {
        throw new LmsError({
          status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
          code: LAUNCH_NOT_IMPLEMENTED,
          message: 'Package has no extracted entry to launch.',
          details: {
            contentPackageId: contentPackage.id,
            extractedKey,
            entryHref,
          },
        });
      }

      const openAttempts = await manager.find(Attempt, {
        where: {
          registrationId: registration.id,
          courseModuleId: courseModule.id,
          termination: 'still_open',
        },
      });
      const closedAt = new Date();
      for (const open of openAttempts) {
        open.termination = 'abandoned';
        open.endedAt = closedAt;
        await manager.save(open);
      }

      const sessionId = randomUUID();
      const attempt = manager.create(Attempt, {
        id: randomUUID(),
        registrationId: registration.id,
        courseModuleId: courseModule.id,
        activityNodeId: activityNode?.id ?? null,
        sessionId,
        launchMode: request.launchMode,
        startedAt: closedAt,
        termination: 'still_open',
      });
      await manager.save(attempt);

      const html5 =
        runtime instanceof Html5Runtime ? runtime : new Html5Runtime();
      const descriptor = await html5.createLaunch(request, {
        attemptId: attempt.id,
        sessionId: attempt.sessionId,
        extractedKey,
        entryHref,
        getPublicUrl: (key) => this.storage.getPublicUrl(key),
      });

      await this.events.record(
        {
          personId: registration.personId,
          action: 'launch.started',
          subjectType: 'attempt',
          subjectId: attempt.id,
          payload: {
            registrationId: registration.id,
            courseModuleId: courseModule.id,
            sessionId: attempt.sessionId,
            packageType: contentPackage.packageType,
          },
        },
        manager,
      );

      return descriptor;
    });
  }
}

function progressMapFromRows(
  rows: NormalizedProgressRow[],
): Map<string, AvailabilityProgress> {
  const map = new Map<string, AvailabilityProgress>();
  for (const row of rows) {
    const current = map.get(row.courseModuleId);
    const score =
      row.scoreScaled == null ? undefined : Number(row.scoreScaled);
    const next: AvailabilityProgress = {
      completionStatus: row.completionStatus,
      scoreScaled: Number.isFinite(score) ? score : undefined,
    };
    if (!current) {
      map.set(row.courseModuleId, next);
      continue;
    }
    map.set(row.courseModuleId, {
      completionStatus:
        current.completionStatus === 'completed' ||
        next.completionStatus === 'completed'
          ? 'completed'
          : (next.completionStatus ?? current.completionStatus),
      scoreScaled: maxOptional(current.scoreScaled, next.scoreScaled),
    });
  }
  return map;
}

function maxOptional(
  left?: number,
  right?: number,
): number | undefined {
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.max(left, right);
  }
  return left ?? right;
}
