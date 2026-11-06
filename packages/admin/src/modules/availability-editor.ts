import {
  parseAvailability,
  type AvailabilityCondition,
  type AvailabilityV1,
  type CourseModuleDto,
} from '@richardmcquiston01/reactive-lms-shared';
import {
  buildModuleTree,
  flattenModuleTree,
  type ModuleTreeNode,
} from './module-tree';

/** Kinds of condition the editor offers. */
export type ConditionType = AvailabilityCondition['type'];

/**
 * One condition as the form holds it. Every field is text, exactly as typed,
 * and only the fields for `type` are read.
 */
export interface ConditionDraft {
  /** Kind of condition. */
  type: ConditionType;
  /** Module a `module_completed` or `min_score` condition reads. */
  moduleId: string;
  /** Start of a date window, as a `datetime-local` value; empty for none. */
  from: string;
  /** End of a date window, as a `datetime-local` value; empty for none. */
  until: string;
  /** Minimum score as a percentage, 0 to 100. */
  percent: string;
  /** Group a `group_member` condition checks. */
  groupId: string;
}

/** Whether every condition must hold, or any one of them. */
export type RuleMode = 'all' | 'any';

/**
 * The editable form of a module's availability rules: one flat list of
 * conditions joined by `all` or `any`.
 */
export interface RulesDraft {
  /** How the conditions combine. */
  mode: RuleMode;
  /** Conditions in the order shown. */
  conditions: ConditionDraft[];
}

/** Labels for the condition types, as the form shows them. */
export const CONDITION_LABELS: Record<ConditionType, string> = {
  module_completed: 'Another module is completed',
  min_score: 'Another module is passed with a minimum score',
  date_window: 'Within a date window',
  group_member: 'Learner is in a group',
};

/** Condition types in the order the form offers them. */
export const CONDITION_TYPES: readonly ConditionType[] = [
  'module_completed',
  'min_score',
  'date_window',
  'group_member',
];

/** What reading stored rules into the form can give back. */
export type DraftResult =
  { ok: true; draft: RulesDraft } | { ok: false; reason: string };

/** What turning the form into rules can give back. */
export type BuildResult =
  { ok: true; value: AvailabilityV1 | null } | { ok: false; errors: string[] };

/**
 * A draft with no conditions, which means the module is always open.
 */
export function emptyDraft(): RulesDraft {
  return { mode: 'all', conditions: [] };
}

/**
 * A blank condition of the given type.
 *
 * @param type - Kind of condition
 */
export function newCondition(type: ConditionType): ConditionDraft {
  return { type, moduleId: '', from: '', until: '', percent: '', groupId: '' };
}

/**
 * Reads stored rules into the form. Rules that nest one group inside another
 * cannot be shown in a flat list, so they are reported instead of being
 * flattened, which would change what they mean.
 *
 * @param rules - Rules as the API returns them
 */
export function draftFromAvailability(
  rules: AvailabilityV1 | null,
): DraftResult {
  if (rules === null) {
    return { ok: true, draft: emptyDraft() };
  }
  const mode: RuleMode = 'all' in rules ? 'all' : 'any';
  const children = 'all' in rules ? rules.all : rules.any;
  const conditions: ConditionDraft[] = [];
  for (const child of children) {
    if (!('type' in child)) {
      return {
        ok: false,
        reason:
          'These rules put one group of conditions inside another, which this editor cannot show without changing their meaning.',
      };
    }
    conditions.push(conditionToDraft(child));
  }
  return { ok: true, draft: { mode, conditions } };
}

function conditionToDraft(condition: AvailabilityCondition): ConditionDraft {
  const draft = newCondition(condition.type);
  switch (condition.type) {
    case 'module_completed':
      draft.moduleId = condition.moduleId;
      break;
    case 'min_score':
      draft.moduleId = condition.moduleId ?? '';
      draft.percent = String(Math.round(condition.score * 10000) / 100);
      break;
    case 'date_window':
      draft.from = isoToLocalInput(condition.from);
      draft.until = isoToLocalInput(condition.until);
      break;
    case 'group_member':
      draft.groupId = condition.groupId;
      break;
  }
  return draft;
}

/**
 * Turns a form date and time into the ISO-8601 instant the API stores. The
 * form value is in the browser's time zone.
 *
 * @param text - A `datetime-local` value such as `2026-06-01T09:00`
 * @returns The instant, or `null` when the text is empty or not a date
 */
export function localInputToIso(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Turns a stored instant into a `datetime-local` value in the browser's time
 * zone, to a whole minute.
 *
 * @param iso - ISO-8601 instant, or `undefined` for none
 * @returns The form value, or an empty string when there is none
 */
export function isoToLocalInput(iso: string | undefined): string {
  if (iso === undefined) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const two = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}` +
    `T${two(date.getHours())}:${two(date.getMinutes())}`
  );
}

/**
 * Modules that a condition on `editing` may name: modules with content, other
 * than `editing` itself and, for a block, the modules inside it. Blocks are
 * left out because they never record completion or a score. The order follows
 * the tree, with each module's depth for indenting.
 *
 * @param modules - Every module of the section
 * @param editing - The module whose rules are being edited
 */
export function conditionTargets(
  modules: readonly CourseModuleDto[],
  editing: CourseModuleDto,
): ModuleTreeNode[] {
  const insideEditing = new Set<string>();
  const byParent = new Map<string, CourseModuleDto[]>();
  for (const module of modules) {
    if (module.parentModuleId !== null) {
      const siblings = byParent.get(module.parentModuleId) ?? [];
      siblings.push(module);
      byParent.set(module.parentModuleId, siblings);
    }
  }
  const stack = [editing.id];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const child of byParent.get(id) ?? []) {
      if (!insideEditing.has(child.id)) {
        insideEditing.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return flattenModuleTree(buildModuleTree(modules)).filter(
    (node) =>
      !node.module.isBlock &&
      node.module.id !== editing.id &&
      !insideEditing.has(node.module.id),
  );
}

/**
 * Checks the form and builds the rules to send. Problems are listed together,
 * each naming its condition by position, so the administrator can fix them in
 * one pass. The server still has the last word, for example on modules that
 * would wait on each other.
 *
 * @param draft - The form
 * @param allowedModuleIds - Ids from {@link conditionTargets}
 * @returns The rules (`null` for none), or the problems found
 */
export function buildAvailability(
  draft: RulesDraft,
  allowedModuleIds: ReadonlySet<string>,
): BuildResult {
  const errors: string[] = [];
  const conditions: AvailabilityCondition[] = [];

  draft.conditions.forEach((condition, index) => {
    const label = `Condition ${index + 1}`;
    const built = buildCondition(condition, allowedModuleIds, label, errors);
    if (built !== null) {
      conditions.push(built);
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (conditions.length === 0) {
    return { ok: true, value: null };
  }
  const candidate =
    draft.mode === 'any'
      ? { version: 1, any: conditions }
      : { version: 1, all: conditions };
  const parsed = parseAvailability(candidate);
  return parsed.ok ? { ok: true, value: parsed.value } : parsed;
}

function buildCondition(
  condition: ConditionDraft,
  allowedModuleIds: ReadonlySet<string>,
  label: string,
  errors: string[],
): AvailabilityCondition | null {
  switch (condition.type) {
    case 'module_completed': {
      if (!allowedModuleIds.has(condition.moduleId)) {
        errors.push(`${label}: choose the module that must be completed.`);
        return null;
      }
      return { type: 'module_completed', moduleId: condition.moduleId };
    }
    case 'min_score': {
      let valid = true;
      if (!allowedModuleIds.has(condition.moduleId)) {
        errors.push(`${label}: choose the module whose score is checked.`);
        valid = false;
      }
      const percent = Number(condition.percent.trim());
      if (
        condition.percent.trim() === '' ||
        !Number.isFinite(percent) ||
        percent < 0 ||
        percent > 100
      ) {
        errors.push(`${label}: enter a minimum score from 0 to 100.`);
        valid = false;
      }
      return valid
        ? {
            type: 'min_score',
            moduleId: condition.moduleId,
            score: percent / 100,
          }
        : null;
    }
    case 'date_window': {
      const from = localInputToIso(condition.from);
      const until = localInputToIso(condition.until);
      let valid = true;
      if (condition.from.trim() !== '' && from === null) {
        errors.push(`${label}: the start is not a valid date and time.`);
        valid = false;
      }
      if (condition.until.trim() !== '' && until === null) {
        errors.push(`${label}: the end is not a valid date and time.`);
        valid = false;
      }
      if (valid && from === null && until === null) {
        errors.push(`${label}: enter a start, an end, or both.`);
        valid = false;
      }
      if (valid && from !== null && until !== null && from >= until) {
        errors.push(`${label}: the start must be before the end.`);
        valid = false;
      }
      return valid
        ? {
            type: 'date_window',
            ...(from === null ? {} : { from }),
            ...(until === null ? {} : { until }),
          }
        : null;
    }
    case 'group_member': {
      const groupId = condition.groupId.trim();
      if (groupId === '') {
        errors.push(`${label}: enter the id of the group.`);
        return null;
      }
      return { type: 'group_member', groupId };
    }
  }
}

/**
 * Plain-language lines for stored rules, one per condition, for showing what
 * a module currently requires.
 *
 * @param rules - Rules as the API returns them
 * @param titleOf - Looks up a module's title from its id
 */
export function summarizeConditions(
  rules: AvailabilityV1 | null,
  titleOf: (moduleId: string) => string,
): string[] {
  if (rules === null) {
    return [];
  }
  const lines: string[] = [];
  const children = 'all' in rules ? rules.all : rules.any;
  for (const child of children) {
    if (!('type' in child)) {
      lines.push('A nested group of conditions');
      continue;
    }
    lines.push(describeCondition(child, titleOf));
  }
  return lines;
}

function describeCondition(
  condition: AvailabilityCondition,
  titleOf: (moduleId: string) => string,
): string {
  switch (condition.type) {
    case 'module_completed':
      return `"${titleOf(condition.moduleId)}" is completed`;
    case 'min_score':
      return `"${condition.moduleId === undefined ? 'this module' : titleOf(condition.moduleId)}" scores at least ${Math.round(condition.score * 10000) / 100}%`;
    case 'date_window': {
      const from = isoToLocalInput(condition.from).replace('T', ' ');
      const until = isoToLocalInput(condition.until).replace('T', ' ');
      if (from !== '' && until !== '') {
        return `Open from ${from} until ${until}`;
      }
      return from !== '' ? `Open from ${from}` : `Open until ${until}`;
    }
    case 'group_member':
      return `Learner is in group ${condition.groupId}`;
  }
}
