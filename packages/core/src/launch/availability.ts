import type {
  CourseModule,
  ModuleAvailability,
} from '@richardmcquiston01/reactive-lms-persistence';
import type { CompletionStatus } from '@richardmcquiston01/reactive-lms-shared';
import {
  LmsError,
  MODULE_NOT_AVAILABLE,
  httpStatusForLmsCode,
} from '@richardmcquiston01/reactive-lms-shared';

/**
 * Progress snapshot used by {@link assertAvailable}.
 * Keyed by course module id in the caller-supplied map.
 */
export interface AvailabilityProgress {
  /** Completion of the referenced module (typically the prerequisite). */
  completionStatus?: CompletionStatus;
  /** Scaled score 0..1 when known. */
  scoreScaled?: number;
}

/**
 * Module fields required to evaluate availability.
 */
export type AvailabilityModule = Pick<CourseModule, 'id' | 'availabilityJson'>;

/**
 * Throws {@link LmsError} `MODULE_NOT_AVAILABLE` (403) when the module
 * cannot be launched: prerequisite not completed, now outside the date
 * window, or `minScore` not met on the prerequisite (or this module).
 *
 * @param module - Course module (or the availability-relevant subset)
 * @param progressByModuleId - Progress keyed by course module id
 * @param now - Evaluation instant
 */
export function assertAvailable(
  module: AvailabilityModule,
  progressByModuleId: ReadonlyMap<string, AvailabilityProgress>,
  now: Date,
): void {
  const rules = readAvailability(module.availabilityJson);
  if (!rules) {
    return;
  }

  if (rules.availableFrom) {
    const from = parseInstant(rules.availableFrom);
    if (from && now.getTime() < from.getTime()) {
      throw unavailable('Module is not yet available.', {
        moduleId: module.id,
        availableFrom: rules.availableFrom,
      });
    }
  }

  if (rules.availableUntil) {
    const until = parseInstant(rules.availableUntil);
    if (until && now.getTime() > until.getTime()) {
      throw unavailable('Module is no longer available.', {
        moduleId: module.id,
        availableUntil: rules.availableUntil,
      });
    }
  }

  if (rules.afterModuleId) {
    const prior = progressByModuleId.get(rules.afterModuleId);
    if (prior?.completionStatus !== 'completed') {
      throw unavailable('A required previous module is not completed.', {
        moduleId: module.id,
        afterModuleId: rules.afterModuleId,
      });
    }
  }

  if (typeof rules.minScore === 'number') {
    const scoreModuleId = rules.afterModuleId ?? module.id;
    const scored = progressByModuleId.get(scoreModuleId);
    const score = scored?.scoreScaled;
    if (typeof score !== 'number' || score < rules.minScore) {
      throw unavailable('Minimum score has not been met.', {
        moduleId: module.id,
        scoreModuleId,
        minScore: rules.minScore,
        scoreScaled: score,
      });
    }
  }
}

function readAvailability(
  value: CourseModule['availabilityJson'],
): ModuleAvailability | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as ModuleAvailability;
  if (
    !record.afterModuleId &&
    !record.availableFrom &&
    !record.availableUntil &&
    typeof record.minScore !== 'number'
  ) {
    return undefined;
  }
  return record;
}

function parseInstant(value: string): Date | undefined {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function unavailable(
  message: string,
  details: Record<string, unknown>,
): LmsError {
  return new LmsError({
    status: httpStatusForLmsCode(MODULE_NOT_AVAILABLE),
    code: MODULE_NOT_AVAILABLE,
    message,
    details,
  });
}
