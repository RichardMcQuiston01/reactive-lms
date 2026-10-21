import {
  CourseModule,
  CourseSection,
  NormalizedProgress as NormalizedProgressRow,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import type {
  NormalizedProgress,
  ProgressSink,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { EventLogService } from '../audit/event-log.service';
import { contentModules } from '../courses/module-tree';
import { computeRegistrationStatus } from './course-completion';
import type { ModuleProgressSnapshot } from './course-completion';

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
