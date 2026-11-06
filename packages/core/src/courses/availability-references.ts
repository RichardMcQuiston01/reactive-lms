import type { CourseModule } from '@richardmcquiston01/reactive-lms-persistence';
import {
  AVAILABILITY_INVALID,
  LmsError,
  httpStatusForLmsCode,
  parseAvailability,
  type AvailabilityNode,
  type AvailabilityV1,
} from '@richardmcquiston01/reactive-lms-shared';

/**
 * The fields of a module that reference checks read.
 */
export type ReferenceModule = Pick<
  CourseModule,
  'id' | 'title' | 'parentModuleId' | 'contentPackageId' | 'availabilityJson'
>;

/**
 * The module being written. For a module that does not exist yet, `id` is the
 * id it will get and `parentModuleId` is where it will be placed.
 */
export interface ReferencingModule {
  /** Module id. */
  id: string;
  /** True for a block (no content package). */
  isBlock: boolean;
  /** Parent block, or `null` at the top level. */
  parentModuleId: string | null;
}

/**
 * Module ids a rule set refers to, with the kind of reference.
 */
interface Reference {
  moduleId: string;
  /** True when the rule set cannot be met without this reference being met. */
  required: boolean;
}

/**
 * Rejects availability rules that can never be met, or that point at
 * something that does not exist, before they are saved.
 *
 * A module opens only once its conditions hold, and only launched content
 * records completion and a score. So these rules would lock a module forever:
 *
 * - a condition that names a module not in this section;
 * - a condition that names a block, because a block never records completion
 *   or a score of its own;
 * - a module that waits on its own completion or score, including a
 *   `min_score` with no module named, which reads the module's own score;
 * - a block that waits on a module inside it, because everything inside a
 *   block is gated by the block's rules;
 * - modules that wait on each other, directly or through the blocks around
 *   them.
 *
 * A reference inside an `any` group is not required on its own, so it only
 * has to name something real; the deadlock checks follow `all` conditions.
 *
 * @param rules - Rules about to be saved
 * @param module - The module they belong to
 * @param sectionModules - Every module of the section as stored now
 * @throws LmsError `AVAILABILITY_INVALID` naming each problem found
 */
export function assertAvailabilityReferences(
  rules: AvailabilityV1 | null,
  module: ReferencingModule,
  sectionModules: readonly ReferenceModule[],
): void {
  if (rules === null) {
    return;
  }
  const byId = new Map(sectionModules.map((row) => [row.id, row]));
  const titleOf = (id: string): string => byId.get(id)?.title ?? id;
  const errors: string[] = [];
  const references = collectReferences(rules, module, errors);

  for (const { moduleId } of references) {
    const target = byId.get(moduleId);
    if (target === undefined) {
      errors.push(
        `A condition refers to module ${moduleId}, which is not in this section.`,
      );
    } else if (target.contentPackageId == null) {
      errors.push(
        `A condition refers to the block "${target.title}". A block records no completion or score, so it can never be met; refer to a module inside it instead.`,
      );
    } else if (moduleId === module.id) {
      errors.push(
        `"${titleOf(moduleId)}" cannot wait on its own completion or score.`,
      );
    } else if (isInsideBlock(moduleId, module.id, byId)) {
      errors.push(
        `The block cannot wait on "${titleOf(moduleId)}", which is inside it: everything in a block is held back until the block's own rules are met.`,
      );
    }
  }

  if (errors.length === 0) {
    const cycle = findWaitCycle(rules, module, byId);
    if (cycle !== null) {
      errors.push(
        `These rules would make modules wait on each other and none could open: ${cycle
          .map(titleOf)
          .join(' → ')}.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new LmsError({
      status: httpStatusForLmsCode(AVAILABILITY_INVALID),
      code: AVAILABILITY_INVALID,
      message: `Availability rules cannot be met: ${errors.join(' ')}`,
      details: { errors },
    });
  }
}

/**
 * Every module id the rules refer to. A `min_score` with no module named
 * refers to the module being written, so a content module is told it cannot
 * read its own score.
 */
function collectReferences(
  rules: AvailabilityV1,
  module: ReferencingModule,
  errors: string[],
): Reference[] {
  const found: Reference[] = [];
  const visit = (node: AvailabilityNode, required: boolean): void => {
    if ('type' in node) {
      if (node.type === 'module_completed') {
        found.push({ moduleId: node.moduleId, required });
      } else if (node.type === 'min_score') {
        if (node.moduleId !== undefined) {
          found.push({ moduleId: node.moduleId, required });
        } else if (!module.isBlock) {
          errors.push(
            "A minimum score with no module named reads this module's own score, which it can only earn after it opens. Name the module whose score is needed.",
          );
        }
      }
      return;
    }
    const isAll = 'all' in node;
    for (const child of isAll ? node.all : node.any) {
      visit(child, required && isAll);
    }
  };
  visit(rules, true);
  return found;
}

/** True when `moduleId` sits anywhere below the block `blockId`. */
function isInsideBlock(
  moduleId: string,
  blockId: string,
  byId: ReadonlyMap<string, ReferenceModule>,
): boolean {
  const seen = new Set<string>();
  let current = byId.get(moduleId)?.parentModuleId ?? null;
  while (current !== null && !seen.has(current)) {
    if (current === blockId) {
      return true;
    }
    seen.add(current);
    current = byId.get(current)?.parentModuleId ?? null;
  }
  return false;
}

/** Required module ids of a stored rule set; unreadable rules require none. */
function requiredIds(value: unknown): string[] {
  const parsed = parseAvailability(value);
  if (!parsed.ok || parsed.value === null) {
    return [];
  }
  return collectReferences(
    parsed.value,
    { id: '', isBlock: true, parentModuleId: null },
    [],
  )
    .filter((reference) => reference.required)
    .map((reference) => reference.moduleId);
}

/**
 * Looks for modules that wait on each other once `rules` replace the
 * module's stored rules. A module is held back by its own required modules
 * and by those of every block around it.
 *
 * @returns The module ids around the cycle, first id repeated at the end, or `null`
 */
function findWaitCycle(
  rules: AvailabilityV1,
  module: ReferencingModule,
  byId: ReadonlyMap<string, ReferenceModule>,
): string[] | null {
  const draft = new Map<string, ReferenceModule>(byId);
  const existing = byId.get(module.id);
  draft.set(module.id, {
    id: module.id,
    title: existing?.title ?? 'This module',
    parentModuleId: module.parentModuleId,
    contentPackageId: module.isBlock
      ? null
      : (existing?.contentPackageId ?? 'new'),
    availabilityJson: rules,
  });

  const waitsOn = (id: string): string[] => {
    const ids: string[] = [];
    const seen = new Set<string>();
    let current: string | null = id;
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      const row = draft.get(current);
      if (row === undefined) {
        break;
      }
      ids.push(...requiredIds(row.availabilityJson));
      current = row.parentModuleId ?? null;
    }
    return ids;
  };

  // Start from the written module and, for a block, everything inside it:
  // their rules are the ones the edit changes.
  const starts = [...draft.keys()].filter(
    (id) => id === module.id || isInsideBlock(id, module.id, draft),
  );
  for (const start of starts) {
    const path = [start];
    const onPath = new Set<string>([start]);
    const visited = new Set<string>();
    const walk = (id: string): string[] | null => {
      for (const next of waitsOn(id)) {
        if (next === start) {
          return [...path, start];
        }
        if (onPath.has(next) || visited.has(next)) {
          continue;
        }
        visited.add(next);
        onPath.add(next);
        path.push(next);
        const found = walk(next);
        if (found !== null) {
          return found;
        }
        path.pop();
        onPath.delete(next);
      }
      return null;
    };
    const found = walk(start);
    if (found !== null) {
      return found;
    }
  }
  return null;
}
