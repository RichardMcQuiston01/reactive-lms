import {
  Attempt,
  CourseModule,
  CourseSection,
  NormalizedProgress as NormalizedProgressRow,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  ACTIVITY_NODE_INVALID,
  LAUNCH_REQUIRED,
  LmsError,
  MODULE_NOT_FOUND,
  MODULE_NOT_LAUNCHABLE,
  REGISTRATION_NOT_FOUND,
  httpStatusForLmsCode,
  type NormalizedProgress,
  type ProgressSink,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../audit/event-log.service';
import { contentModules, isBlockModule } from '../courses/module-tree';
import { computeRegistrationStatus } from './course-completion';
import type { ModuleProgressSnapshot } from './course-completion';

/**
 * Progress reported by content that is running in a launched attempt (for
 * example an HTML5 `postMessage`). The caller names the module; everything
 * else that identifies where the progress belongs is checked against the
 * launch, never trusted.
 */
export type LaunchProgressInput = Omit<NormalizedProgress, 'activityNodeId'> & {
  /** Optional; must equal the node that was launched when given. */
  activityNodeId?: string;
};

/**
 * Persists format-agnostic progress and rolls up `registration.status`.
 */
export class ProgressSinkService implements ProgressSink {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource
   * @param events - Audit writer; constructed from `dataSource` when omitted
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly events: EventLogService = new EventLogService(dataSource),
  ) {}

  /**
   * Records progress that content reported from a launch, after checking that
   * it can only describe a module the learner has actually launched.
   *
   * The registration must exist, the module must be a content module of the
   * registration's section, and that module must have an open attempt for the
   * registration. The activity node comes from that attempt, so content
   * cannot move progress to a different node or package. Availability was
   * enforced when the attempt was created, so a locked module cannot reach
   * this point without a launch.
   *
   * @param input - Progress as reported by the content
   * @throws {LmsError} `REGISTRATION_NOT_FOUND`, `MODULE_NOT_FOUND` (also for a
   *   module of another section), `MODULE_NOT_LAUNCHABLE` for a block,
   *   `LAUNCH_REQUIRED` without an open attempt, or `ACTIVITY_NODE_INVALID`
   */
  async upsertFromLaunch(input: LaunchProgressInput): Promise<void> {
    const { manager } = this.dataSource;
    const registration = await manager.findOne(Registration, {
      where: { id: input.registrationId },
    });
    if (!registration) {
      throw new LmsError({
        status: httpStatusForLmsCode(REGISTRATION_NOT_FOUND),
        code: REGISTRATION_NOT_FOUND,
        message: 'Registration not found.',
        details: { registrationId: input.registrationId },
      });
    }

    const courseModule = await manager.findOne(CourseModule, {
      where: { id: input.courseModuleId },
    });
    if (
      !courseModule ||
      courseModule.courseSectionId !== registration.courseSectionId
    ) {
      throw new LmsError({
        status: httpStatusForLmsCode(MODULE_NOT_FOUND),
        code: MODULE_NOT_FOUND,
        message: "Course module not found in this registration's section.",
        details: {
          registrationId: registration.id,
          courseModuleId: input.courseModuleId,
        },
      });
    }
    if (isBlockModule(courseModule)) {
      throw new LmsError({
        status: httpStatusForLmsCode(MODULE_NOT_LAUNCHABLE),
        code: MODULE_NOT_LAUNCHABLE,
        message: `"${courseModule.title}" is a block and has no progress to report.`,
        details: { courseModuleId: courseModule.id },
      });
    }

    const openAttempts = await manager.find(Attempt, {
      where: {
        registrationId: registration.id,
        courseModuleId: courseModule.id,
        termination: 'still_open',
      },
    });
    const attempt = openAttempts[0];
    if (!attempt) {
      throw new LmsError({
        status: httpStatusForLmsCode(LAUNCH_REQUIRED),
        code: LAUNCH_REQUIRED,
        message: `Launch "${courseModule.title}" before reporting progress for it.`,
        details: {
          registrationId: registration.id,
          courseModuleId: courseModule.id,
        },
      });
    }

    const launchedNodeId = attempt.activityNodeId ?? undefined;
    if (
      launchedNodeId === undefined ||
      (input.activityNodeId !== undefined &&
        input.activityNodeId !== launchedNodeId)
    ) {
      throw new LmsError({
        status: httpStatusForLmsCode(ACTIVITY_NODE_INVALID),
        code: ACTIVITY_NODE_INVALID,
        message:
          launchedNodeId === undefined
            ? 'The launched attempt has no activity node to record progress against.'
            : 'The activity node does not match the one launched for this module.',
        details: {
          courseModuleId: courseModule.id,
          launchedActivityNodeId: launchedNodeId,
          suppliedActivityNodeId: input.activityNodeId,
        },
      });
    }

    await this.upsert({ ...input, activityNodeId: launchedNodeId });
  }

  /**
   * Upserts {@link NormalizedProgress} for a registration × module × node,
   * then recomputes the registration status from the section rule.
   *
   * @param progress - Format-agnostic progress payload
   */
  async upsert(progress: NormalizedProgress): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(NormalizedProgressRow, {
        where: {
          registrationId: progress.registrationId,
          courseModuleId: progress.courseModuleId,
          activityNodeId: progress.activityNodeId,
        },
      });

      const fields = {
        completionStatus: progress.completionStatus,
        successStatus: progress.successStatus,
        scoreScaled: toNumeric(progress.scoreScaled),
        scoreRaw: toNumeric(progress.scoreRaw),
        scoreMin: toNumeric(progress.scoreMin),
        scoreMax: toNumeric(progress.scoreMax),
        progressMeasure: toNumeric(progress.progressMeasure),
        location: progress.location ?? null,
        totalTimeIso8601: progress.totalTime ?? null,
        suspendData: progress.suspendData ?? null,
        extrasJson: progress.extras ?? existing?.extrasJson ?? null,
      };

      if (existing) {
        Object.assign(existing, fields);
        await manager.save(existing);
      } else {
        const row = manager.create(NormalizedProgressRow, {
          registrationId: progress.registrationId,
          courseModuleId: progress.courseModuleId,
          activityNodeId: progress.activityNodeId,
          ...fields,
        });
        await manager.save(row);
      }

      const registration = await manager.findOne(Registration, {
        where: { id: progress.registrationId },
      });
      if (!registration) {
        return;
      }

      let nextStatus = registration.status;
      if (registration.status !== 'waived') {
        const section = await manager.findOne(CourseSection, {
          where: { id: registration.courseSectionId },
        });
        const modules = await manager.find(CourseModule, {
          where: { courseSectionId: registration.courseSectionId },
          order: { sortOrder: 'ASC' },
        });
        const rows = await manager.find(NormalizedProgressRow, {
          where: { registrationId: progress.registrationId },
        });
        nextStatus = computeRegistrationStatus({
          rule: section?.completionRule,
          moduleIds: contentModules(modules).map((entry) => entry.id),
          progressByModuleId: mergeProgressByModule(rows),
        });
        if (nextStatus !== registration.status) {
          registration.status = nextStatus;
          await manager.save(registration);
        }
      }

      await this.events.record(
        {
          personId: registration.personId,
          action: 'progress.committed',
          subjectType: 'registration',
          subjectId: registration.id,
          payload: {
            courseModuleId: progress.courseModuleId,
            activityNodeId: progress.activityNodeId,
            completionStatus: progress.completionStatus,
            successStatus: progress.successStatus,
            registrationStatus: nextStatus,
          },
        },
        manager,
      );
    });
  }
}

function toNumeric(value: number | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : null;
}

function mergeProgressByModule(
  rows: NormalizedProgressRow[],
): Map<string, ModuleProgressSnapshot> {
  const byModule = new Map<string, ModuleProgressSnapshot>();
  for (const row of rows) {
    const current = byModule.get(row.courseModuleId);
    if (!current) {
      byModule.set(row.courseModuleId, {
        completionStatus: row.completionStatus,
        successStatus: row.successStatus,
      });
      continue;
    }
    byModule.set(row.courseModuleId, {
      completionStatus: preferCompletion(
        current.completionStatus,
        row.completionStatus,
      ),
      successStatus: preferSuccess(current.successStatus, row.successStatus),
    });
  }
  return byModule;
}

function preferCompletion(
  left: ModuleProgressSnapshot['completionStatus'],
  right: ModuleProgressSnapshot['completionStatus'],
): ModuleProgressSnapshot['completionStatus'] {
  if (left === 'completed' || right === 'completed') {
    return 'completed';
  }
  if (left === 'incomplete' || right === 'incomplete') {
    return 'incomplete';
  }
  if (left === 'not_attempted' || right === 'not_attempted') {
    return 'not_attempted';
  }
  return left;
}

function preferSuccess(
  left: ModuleProgressSnapshot['successStatus'],
  right: ModuleProgressSnapshot['successStatus'],
): ModuleProgressSnapshot['successStatus'] {
  if (left === 'failed' || right === 'failed') {
    return 'failed';
  }
  if (left === 'passed' || right === 'passed') {
    return 'passed';
  }
  return left;
}
