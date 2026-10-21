import type { CompletionRule } from '@reactive-lms/persistence';
import type {
  CompletionStatus,
  RegistrationStatus,
  SuccessStatus,
} from '@reactive-lms/shared';

/**
 * Per-module progress used when rolling up {@link RegistrationStatus}.
 */
export interface ModuleProgressSnapshot {
  /** Whether the module (or its representative node) is complete. */
  completionStatus: CompletionStatus;
  /** Pass/fail when the format reports success. */
  successStatus: SuccessStatus;
}

/**
 * Inputs for {@link computeRegistrationStatus}.
 */
export interface ComputeRegistrationStatusInput {
  /**
   * Section completion rule. Omitted / unknown shapes default to
   * `{ allModules: true }`.
   */
  rule?: CompletionRule | Record<string, unknown> | null;
  /** Module ids that belong to the section (any order). */
  moduleIds: readonly string[];
  /** Progress keyed by course module id. */
  progressByModuleId: ReadonlyMap<string, ModuleProgressSnapshot>;
}

/**
 * Derives `registration.status` from module progress and the section rule.
 * Runtimes never write status directly.
 *
 * Default `{ allModules: true }`: every module completed → `completed`;
 * if any completed module reports success, all those must be `passed`
 * for `passed`, else if any failed → `failed`. Partial work is
 * `in_progress`; no work is `not_started`.
 *
 * @param input - Rule, module ids, and progress map
 */
export function computeRegistrationStatus(
  input: ComputeRegistrationStatusInput,
): RegistrationStatus {
  const { moduleIds, progressByModuleId } = input;
  const rule = normalizeRule(input.rule);

  if (moduleIds.length === 0) {
    return 'completed';
  }

  const completedIds = moduleIds.filter((id) => {
    return progressByModuleId.get(id)?.completionStatus === 'completed';
  });
  const hasStarted = moduleIds.some((id) => {
    const snapshot = progressByModuleId.get(id);
    if (!snapshot) {
      return false;
    }
    return (
      snapshot.completionStatus !== 'unknown' &&
      snapshot.completionStatus !== 'not_attempted'
    );
  });

  if (!isRuleSatisfied(rule, moduleIds, completedIds)) {
    return hasStarted ? 'in_progress' : 'not_started';
  }

  return rollupSuccess(completedIds, progressByModuleId);
}

function normalizeRule(
  rule?: CompletionRule | Record<string, unknown> | null,
): CompletionRule {
  if (rule && typeof rule === 'object') {
    if ('anyOf' in rule && Array.isArray(rule.anyOf)) {
      return {
        anyOf: rule.anyOf.filter((id): id is string => {
          return typeof id === 'string';
        }),
      };
    }
    if (
      'minCompleted' in rule &&
      typeof rule.minCompleted === 'number' &&
      Number.isFinite(rule.minCompleted)
    ) {
      return { minCompleted: rule.minCompleted };
    }
    if ('allModules' in rule && rule.allModules === true) {
      return { allModules: true };
    }
  }
  return { allModules: true };
}

function isRuleSatisfied(
  rule: CompletionRule,
  moduleIds: readonly string[],
  completedIds: readonly string[],
): boolean {
  if ('anyOf' in rule) {
    if (rule.anyOf.length === 0) {
      return completedIds.length > 0;
    }
    return rule.anyOf.some((id) => completedIds.includes(id));
  }
  if ('minCompleted' in rule) {
    return completedIds.length >= rule.minCompleted;
  }
  return completedIds.length === moduleIds.length;
}

function rollupSuccess(
  completedIds: readonly string[],
  progressByModuleId: ReadonlyMap<string, ModuleProgressSnapshot>,
): RegistrationStatus {
  const reported = completedIds
    .map((id) => progressByModuleId.get(id)?.successStatus)
    .filter((status): status is SuccessStatus => {
      return status === 'passed' || status === 'failed';
    });

  if (reported.length === 0) {
    return 'completed';
  }
  if (reported.every((status) => status === 'passed')) {
    return 'passed';
  }
  if (reported.some((status) => status === 'failed')) {
    return 'failed';
  }
  return 'completed';
}
