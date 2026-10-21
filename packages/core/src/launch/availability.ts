import type { CourseModule } from '@richardmcquiston01/reactive-lms-persistence';
import type {
  AvailabilityCondition,
  AvailabilityNode,
  AvailabilityV0,
  AvailabilityV1,
  CompletionStatus,
} from '@richardmcquiston01/reactive-lms-shared';
import {
  AVAILABILITY_INVALID,
  LmsError,
  MODULE_NOT_AVAILABLE,
  httpStatusForLmsCode,
  parseAvailability,
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
 * Everything a rule set is evaluated against.
 */
export interface AvailabilityContext {
  /** The module the rules are attached to. */
  moduleId: string;
  /** Evaluation instant. */
  now: Date;
  /** Progress keyed by course module id. */
  progressByModuleId: ReadonlyMap<string, AvailabilityProgress>;
  /** Ids of the LIS groups the learner belongs to. */
  groupIds: ReadonlySet<string>;
}

/**
 * Why one condition was not met.
 */
export interface UnmetCondition {
  /** Human-readable reason. */
  message: string;
  /** Structured facts about the failure, for the caller and the logs. */
  details: Record<string, unknown>;
}

/**
 * Outcome of {@link evaluateAvailability}.
 */
export type AvailabilityEvaluation =
  { available: true } | { available: false; unmet: UnmetCondition[] };

/**
 * Evaluates a rule set: an `all` group needs every child to hold, an `any`
 * group needs at least one. No rules means the module is available.
 *
 * @param rules - Parsed version 1 rules, or `null` for none
 * @param context - Learner state and the evaluation instant
 */
export function evaluateAvailability(
  rules: AvailabilityV1 | null,
  context: AvailabilityContext,
): AvailabilityEvaluation {
  if (!rules) {
    return { available: true };
  }
  const unmet = evaluateNode(rules, context);
  return unmet.length === 0 ? { available: true } : { available: false, unmet };
}

/**
 * The groups a module's rules refer to are loaded by the caller; this returns
 * the rules a stored `availabilityJson` value resolves to.
 *
 * @param value - Stored availability value (version 0 or 1)
 * @throws LmsError `MODULE_NOT_AVAILABLE` when the stored rules are invalid,
 *   so a damaged rule set fails closed instead of opening the module
 */
export function readStoredAvailability(
  moduleId: string,
  value: CourseModule['availabilityJson'],
): AvailabilityV1 | null {
  const parsed = parseAvailability(value);
  if (!parsed.ok) {
    throw unavailable(
      'This module has invalid availability rules and cannot be launched until an instructor fixes them.',
      { moduleId, errors: parsed.errors },
    );
  }
  return parsed.value;
}

/**
 * Availability a caller may submit: version 1 rules, or the older single-object
 * (version 0) form.
 */
export type AvailabilityInput = AvailabilityV1 | AvailabilityV0;

/**
 * Validates availability submitted by an API caller and returns the version 1
 * rules to store, or `null` when the input holds no rules. Version 0 input is
 * upcast, so new writes are always version 1.
 *
 * @param value - Untrusted availability value from a request body
 * @throws LmsError `AVAILABILITY_INVALID` (400) listing every problem
 */
export function normalizeAvailabilityInput(
  value: unknown,
): AvailabilityV1 | null {
  const parsed = parseAvailability(value);
  if (!parsed.ok) {
    throw new LmsError({
      status: httpStatusForLmsCode(AVAILABILITY_INVALID),
      code: AVAILABILITY_INVALID,
      message: `Availability rules are invalid: ${parsed.errors.join(' ')}`,
      details: { errors: parsed.errors },
    });
  }
  return parsed.value;
}

/**
 * Throws {@link LmsError} `MODULE_NOT_AVAILABLE` (403) when the module cannot
 * be launched. The error's message is the first unmet condition and
 * `details.unmet` lists every one.
 *
 * @param module - Course module (or the availability-relevant subset)
 * @param progressByModuleId - Progress keyed by course module id
 * @param now - Evaluation instant
 * @param groupIds - Ids of the LIS groups the learner belongs to
 */
export function assertAvailable(
  module: AvailabilityModule,
  progressByModuleId: ReadonlyMap<string, AvailabilityProgress>,
  now: Date,
  groupIds: ReadonlySet<string> = new Set(),
): void {
  const rules = readStoredAvailability(module.id, module.availabilityJson);
  const evaluation = evaluateAvailability(rules, {
    moduleId: module.id,
    now,
    progressByModuleId,
    groupIds,
  });
  if (evaluation.available) {
    return;
  }
  const [first] = evaluation.unmet;
  throw unavailable(first?.message ?? 'Module is not available.', {
    moduleId: module.id,
    ...first?.details,
    unmet: evaluation.unmet,
  });
}

function evaluateNode(
  node: AvailabilityNode,
  context: AvailabilityContext,
): UnmetCondition[] {
  if ('type' in node) {
    const unmet = evaluateCondition(node, context);
    return unmet ? [unmet] : [];
  }
  if ('all' in node) {
    return node.all.flatMap((child) => evaluateNode(child, context));
  }
  const results = node.any.map((child) => evaluateNode(child, context));
  if (results.some((unmet) => unmet.length === 0)) {
    return [];
  }
  return results.flat();
}

function evaluateCondition(
  condition: AvailabilityCondition,
  context: AvailabilityContext,
): UnmetCondition | undefined {
  switch (condition.type) {
    case 'date_window': {
      const nowMs = context.now.getTime();
      if (condition.from && nowMs < Date.parse(condition.from)) {
        return {
          message: 'Module is not yet available.',
          details: { availableFrom: condition.from },
        };
      }
      if (condition.until && nowMs > Date.parse(condition.until)) {
        return {
          message: 'Module is no longer available.',
          details: { availableUntil: condition.until },
        };
      }
      return undefined;
    }
    case 'module_completed': {
      const prior = context.progressByModuleId.get(condition.moduleId);
      return prior?.completionStatus === 'completed'
        ? undefined
        : {
            message: 'A required previous module is not completed.',
            details: {
              afterModuleId: condition.moduleId,
              moduleId: condition.moduleId,
            },
          };
    }
    case 'min_score': {
      const scoreModuleId = condition.moduleId ?? context.moduleId;
      const score = context.progressByModuleId.get(scoreModuleId)?.scoreScaled;
      return typeof score === 'number' && score >= condition.score
        ? undefined
        : {
            message: 'Minimum score has not been met.',
            details: {
              scoreModuleId,
              minScore: condition.score,
              scoreScaled: score,
            },
          };
    }
    case 'group_member':
      return context.groupIds.has(condition.groupId)
        ? undefined
        : {
            message: 'The learner is not a member of a required group.',
            details: { groupId: condition.groupId },
          };
  }
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
