import {
  ActivityNode,
  Attempt,
  NormalizedProgress as NormalizedProgressRow,
  Person,
  Registration,
} from '@reactive-lms/persistence';
import {
  ATTEMPT_NOT_FOUND,
  CmiStore,
  LmsError,
  httpStatusForLmsCode,
  mapCmiToProgress,
  type CmiValues,
  type LaunchMode,
  type ScormCmiDto,
} from '@reactive-lms/shared';
import type { DataSource } from 'typeorm';
import { ProgressSinkService } from '../../progress/progress-sink';

/**
 * Hydrates and commits SCORM 1.2 CMI for an attempt, mapping
 * `lesson_status` and score onto {@link ProgressSinkService}.
 */
export class ScormCmiService {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource
   * @param sink - Format-agnostic progress writer
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly sink: ProgressSinkService,
  ) {}

  /**
   * Returns the CMI map for an attempt (student fields + persisted values).
   *
   * @param attemptId - Attempt id from launch
   */
  async getCmi(attemptId: string): Promise<ScormCmiDto> {
    const ctx = await this.loadContext(attemptId);
    return { values: this.seedStore(ctx).snapshot() };
  }

  /**
   * Persists a CMI snapshot and rolls it into {@link ProgressSinkService}.
   *
   * @param attemptId - Attempt id from launch
   * @param body - Committed CMI values; `finished` closes the attempt
   */
  async putCmi(attemptId: string, body: ScormCmiDto): Promise<ScormCmiDto> {
    const ctx = await this.loadContext(attemptId);
    const store = this.seedStore(ctx);
    store.loadValues(body.values ?? {});
    const values = store.snapshot();
    const activityNodeId = ctx.activityNodeId;
    if (!activityNodeId) {
      throw new LmsError({
        status: httpStatusForLmsCode(ATTEMPT_NOT_FOUND),
        code: ATTEMPT_NOT_FOUND,
        message: 'Attempt has no activity node to record CMI against.',
        details: { attemptId },
      });
    }

    await this.sink.upsert(
      mapCmiToProgress(values, {
        registrationId: ctx.attempt.registrationId,
        courseModuleId: ctx.attempt.courseModuleId,
        activityNodeId,
      }),
    );

    if (body.finished) {
      ctx.attempt.termination = 'terminated';
      ctx.attempt.endedAt = new Date();
      await this.dataSource.manager.save(ctx.attempt);
    }

    return { values };
  }

  private seedStore(ctx: CmiContext): CmiStore {
    const persisted = { ...ctx.persisted };
    delete persisted['cmi.core.session_time'];
    const exit = persisted['cmi.core.exit'];
    const store = new CmiStore({
      studentId: ctx.studentId,
      studentName: ctx.studentName,
      lessonMode: lessonModeFrom(ctx.attempt.launchMode),
      launchData: ctx.launchData,
      values: persisted,
    });
    store.loadValues({
      'cmi.core.entry': exit === 'suspend' ? 'resume' : 'ab-initio',
    });
    return store;
  }

  private async loadContext(attemptId: string): Promise<CmiContext> {
    const attempt = await this.dataSource.manager.findOne(Attempt, {
      where: { id: attemptId },
    });
    if (!attempt) {
      throw new LmsError({
        status: httpStatusForLmsCode(ATTEMPT_NOT_FOUND),
        code: ATTEMPT_NOT_FOUND,
        message: 'Attempt not found.',
        details: { attemptId },
      });
    }

    const registration = await this.dataSource.manager.findOne(Registration, {
      where: { id: attempt.registrationId },
    });
    const person = registration
      ? await this.dataSource.manager.findOne(Person, {
          where: { id: registration.personId },
        })
      : null;

    const activityNodeId = attempt.activityNodeId ?? undefined;
    const activityNode = activityNodeId
      ? await this.dataSource.manager.findOne(ActivityNode, {
          where: { id: activityNodeId },
        })
      : null;

    const progress = activityNodeId
      ? await this.dataSource.manager.findOne(NormalizedProgressRow, {
          where: {
            registrationId: attempt.registrationId,
            courseModuleId: attempt.courseModuleId,
            activityNodeId,
          },
        })
      : null;

    const extras = progress?.extrasJson ?? null;
    const persisted = extractCmi(extras);

    return {
      attempt,
      activityNodeId,
      studentId: person?.externalId ?? '',
      studentName: person?.displayName ?? '',
      launchData: launchDataFrom(activityNode?.metadataJson),
      persisted,
    };
  }
}

interface CmiContext {
  attempt: Attempt;
  activityNodeId?: string;
  studentId: string;
  studentName: string;
  launchData?: string;
  persisted: CmiValues;
}

function extractCmi(extras: Record<string, unknown> | null): CmiValues {
  if (!extras) {
    return {};
  }
  const cmi = extras.cmi;
  if (cmi && typeof cmi === 'object' && !Array.isArray(cmi)) {
    const values: CmiValues = {};
    for (const [key, value] of Object.entries(
      cmi as Record<string, unknown>,
    )) {
      if (typeof value === 'string') {
        values[key] = value;
      }
    }
    return values;
  }
  return {};
}

function launchDataFrom(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  const value = metadata?.['launchData'];
  return typeof value === 'string' ? value : undefined;
}

function lessonModeFrom(mode: LaunchMode): string {
  if (mode === 'Browse') {
    return 'browse';
  }
  if (mode === 'Review') {
    return 'review';
  }
  return 'normal';
}
