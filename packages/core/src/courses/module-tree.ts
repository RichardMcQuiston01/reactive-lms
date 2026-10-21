import type { CourseModule } from '@richardmcquiston01/reactive-lms-persistence';
import {
  LmsError,
  MAX_MODULE_DEPTH,
  MODULE_NOT_FOUND,
  MODULE_TREE_INVALID,
  httpStatusForLmsCode,
} from '@richardmcquiston01/reactive-lms-shared';

export { MAX_MODULE_DEPTH };

/**
 * The fields of a module that tree rules read.
 */
export type TreeModule = Pick<
  CourseModule,
  'id' | 'parentModuleId' | 'contentPackageId'
>;

/**
 * True for a block: a container module with no content package.
 *
 * @param module - Module row
 */
export function isBlockModule(
  module: Pick<CourseModule, 'contentPackageId'>,
): boolean {
  return module.contentPackageId == null;
}

/**
 * Returns the modules a learner can launch and that count toward section
 * completion: every module with a content package, at any depth.
 *
 * @param modules - All modules of a section
 */
export function contentModules<
  T extends Pick<CourseModule, 'contentPackageId'>,
>(modules: readonly T[]): T[] {
  return modules.filter((module) => !isBlockModule(module));
}

/**
 * Lists a module's ancestors, outermost first, ending with its direct parent.
 *
 * @param modules - All modules of the section
 * @param moduleId - Module whose ancestors to find
 * @throws LmsError `MODULE_TREE_INVALID` when a parent is missing or the
 *   parent links form a cycle, so a damaged tree never loops or opens a module
 */
export function ancestorsOf<T extends TreeModule>(
  modules: readonly T[],
  moduleId: string,
): T[] {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const chain: T[] = [];
  const seen = new Set<string>([moduleId]);

  let current = byId.get(moduleId);
  while (current?.parentModuleId) {
    const parent = byId.get(current.parentModuleId);
    if (!parent) {
      throw treeError(
        `Module ${current.id} points at parent ${current.parentModuleId}, which is not in its section.`,
        { moduleId: current.id, parentModuleId: current.parentModuleId },
      );
    }
    if (seen.has(parent.id)) {
      throw treeError(`Module ${moduleId} is part of a parent cycle.`, {
        moduleId,
        repeatedModuleId: parent.id,
      });
    }
    seen.add(parent.id);
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

/**
 * Height of the subtree rooted at a module: 1 for a module with no children.
 *
 * @param modules - All modules of the section
 * @param moduleId - Root of the subtree
 */
export function subtreeHeight(
  modules: readonly TreeModule[],
  moduleId: string,
): number {
  const children = new Map<string, TreeModule[]>();
  for (const module of modules) {
    if (module.parentModuleId) {
      const siblings = children.get(module.parentModuleId) ?? [];
      siblings.push(module);
      children.set(module.parentModuleId, siblings);
    }
  }
  const height = (id: string, visited: Set<string>): number => {
    if (visited.has(id)) {
      return 0;
    }
    visited.add(id);
    const below = (children.get(id) ?? []).map((child) =>
      height(child.id, visited),
    );
    return 1 + Math.max(0, ...below);
  };
  return height(moduleId, new Set());
}

/**
 * Checks that a module can be placed under `parentId` (or at the top level
 * when `null`). The parent must be a block in the same section, the move must
 * not create a cycle, and the resulting depth must stay within
 * {@link MAX_MODULE_DEPTH}.
 *
 * @param modules - All modules of the section (including `moduleId` if it exists)
 * @param moduleId - Module being placed or moved
 * @param parentId - Intended parent, or `null` for the top level
 * @throws LmsError `MODULE_NOT_FOUND` or `MODULE_TREE_INVALID`
 */
export function assertCanParent(
  modules: readonly TreeModule[],
  moduleId: string,
  parentId: string | null,
): void {
  if (parentId === null) {
    return;
  }
  const parent = modules.find((module) => module.id === parentId);
  if (!parent) {
    throw new LmsError({
      status: httpStatusForLmsCode(MODULE_NOT_FOUND),
      code: MODULE_NOT_FOUND,
      message: `Parent module ${parentId} is not in this section.`,
      details: { moduleId, parentModuleId: parentId },
    });
  }
  if (!isBlockModule(parent)) {
    throw treeError(
      `Module ${parentId} holds content, so it cannot contain other modules. Use a block as the parent.`,
      { moduleId, parentModuleId: parentId },
    );
  }
  if (parentId === moduleId) {
    throw treeError('A module cannot be its own parent.', { moduleId });
  }
  const parentAncestors = ancestorsOf(modules, parentId);
  if (parentAncestors.some((ancestor) => ancestor.id === moduleId)) {
    throw treeError(
      `Moving module ${moduleId} under ${parentId} would put it inside its own subtree.`,
      { moduleId, parentModuleId: parentId },
    );
  }
  const depth = parentAncestors.length + 1 + subtreeHeight(modules, moduleId);
  if (depth > MAX_MODULE_DEPTH) {
    throw treeError(
      `Placing module ${moduleId} under ${parentId} would nest ${depth} levels deep; the limit is ${MAX_MODULE_DEPTH}.`,
      { moduleId, parentModuleId: parentId, depth, limit: MAX_MODULE_DEPTH },
    );
  }
}

function treeError(
  message: string,
  details: Record<string, unknown>,
): LmsError {
  return new LmsError({
    status: httpStatusForLmsCode(MODULE_TREE_INVALID),
    code: MODULE_TREE_INVALID,
    message,
    details,
  });
}
