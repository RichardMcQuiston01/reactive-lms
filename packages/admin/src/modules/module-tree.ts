import {
  MAX_MODULE_DEPTH,
  type AvailabilityNode,
  type AvailabilityV1,
  type CourseModuleDto,
} from '@richardmcquiston01/reactive-lms-shared';

/**
 * One module in the tree with its position among its siblings.
 */
export interface ModuleTreeNode {
  /** The module this node shows. */
  module: CourseModuleDto;
  /** Nesting level; a top-level module has depth 1. */
  depth: number;
  /** Child modules in display order. */
  children: ModuleTreeNode[];
  /** Zero-based position among siblings. */
  siblingIndex: number;
  /** Number of siblings, including this module. */
  siblingCount: number;
}

/**
 * Sort order patch for one module.
 */
export interface SortOrderPatch {
  /** Module id. */
  id: string;
  /** New `sort_order`. */
  sortOrder: number;
}

function byDisplayOrder(left: CourseModuleDto, right: CourseModuleDto): number {
  return (
    left.sortOrder - right.sortOrder || left.title.localeCompare(right.title)
  );
}

/**
 * Groups modules by parent. A module whose parent is not in the list is shown
 * at the top level rather than hidden.
 */
function childrenByParent(
  modules: readonly CourseModuleDto[],
): Map<string | null, CourseModuleDto[]> {
  const ids = new Set(modules.map((module) => module.id));
  const groups = new Map<string | null, CourseModuleDto[]>();
  for (const module of modules) {
    const parentKey =
      module.parentModuleId !== null && ids.has(module.parentModuleId)
        ? module.parentModuleId
        : null;
    const group = groups.get(parentKey) ?? [];
    group.push(module);
    groups.set(parentKey, group);
  }
  for (const group of groups.values()) {
    group.sort(byDisplayOrder);
  }
  return groups;
}

/**
 * Builds the tree shown by the module-tree screen.
 *
 * @param modules - Flat module list from the API
 * @returns Top-level nodes in display order
 */
export function buildModuleTree(
  modules: readonly CourseModuleDto[],
): ModuleTreeNode[] {
  const groups = childrenByParent(modules);
  const visited = new Set<string>();
  const build = (parentKey: string | null, depth: number): ModuleTreeNode[] => {
    const siblings = groups.get(parentKey) ?? [];
    return siblings
      .filter((module) => !visited.has(module.id))
      .map((module, siblingIndex) => {
        visited.add(module.id);
        return {
          module,
          depth,
          children: build(module.id, depth + 1),
          siblingIndex,
          siblingCount: siblings.length,
        };
      });
  };
  return build(null, 1);
}

/**
 * Flattens a tree into rows in display order (parents before children).
 *
 * @param nodes - Top-level nodes
 */
export function flattenModuleTree(
  nodes: readonly ModuleTreeNode[],
): ModuleTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenModuleTree(node.children)]);
}

/**
 * Height of the subtree under `moduleId`: 0 for a module with no children.
 */
function subtreeHeight(
  groups: Map<string | null, CourseModuleDto[]>,
  moduleId: string,
): number {
  const children = groups.get(moduleId) ?? [];
  return children.length === 0
    ? 0
    : 1 + Math.max(...children.map((child) => subtreeHeight(groups, child.id)));
}

/**
 * Blocks that `moduleId` could be moved into, in tree order. Mirrors the
 * server rule (`assertCanParent`): the parent must be a block, not the module
 * itself or one of its descendants, and the result may not nest deeper than
 * {@link MAX_MODULE_DEPTH}. The server still has the final say.
 *
 * @param modules - Flat module list
 * @param moduleId - Module being moved; `null` when adding a new block, which
 * has no subtree
 */
export function parentChoices(
  modules: readonly CourseModuleDto[],
  moduleId: string | null,
): ModuleTreeNode[] {
  const groups = childrenByParent(modules);
  const height = moduleId === null ? 0 : subtreeHeight(groups, moduleId);
  const excluded = new Set<string>();
  const exclude = (id: string): void => {
    excluded.add(id);
    for (const child of groups.get(id) ?? []) {
      exclude(child.id);
    }
  };
  if (moduleId !== null) {
    exclude(moduleId);
  }
  return flattenModuleTree(buildModuleTree(modules)).filter(
    (node) =>
      node.module.isBlock &&
      !excluded.has(node.module.id) &&
      node.depth + 1 + height <= MAX_MODULE_DEPTH,
  );
}

/**
 * Plans the sort-order patches that move `moduleId` one place among its
 * siblings. Siblings are renumbered 0..n-1, which also repairs gaps and
 * duplicates left by deletions, and only changed rows are returned.
 *
 * @param modules - Flat module list
 * @param moduleId - Module to move
 * @param direction - `-1` to move earlier, `1` to move later
 * @returns Patches to send; empty when the module is already at that end
 */
export function planSiblingMove(
  modules: readonly CourseModuleDto[],
  moduleId: string,
  direction: -1 | 1,
): SortOrderPatch[] {
  const groups = childrenByParent(modules);
  const module = modules.find((candidate) => candidate.id === moduleId);
  if (!module) {
    return [];
  }
  const parentKey = [...groups.entries()].find(([, group]) =>
    group.some((candidate) => candidate.id === moduleId),
  )?.[0];
  const siblings = groups.get(parentKey ?? null) ?? [];
  const from = siblings.findIndex((candidate) => candidate.id === moduleId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= siblings.length) {
    return [];
  }
  const reordered = [...siblings];
  reordered.splice(from, 1);
  reordered.splice(to, 0, module);
  return reordered.flatMap((candidate, index) =>
    candidate.sortOrder === index
      ? []
      : [{ id: candidate.id, sortOrder: index }],
  );
}

function countConditions(node: AvailabilityNode): number {
  if ('all' in node) {
    return node.all.reduce((total, child) => total + countConditions(child), 0);
  }
  if ('any' in node) {
    return node.any.reduce((total, child) => total + countConditions(child), 0);
  }
  return 1;
}

/**
 * One-line description of a module's availability for the tree.
 *
 * @param availability - Rules as returned by the API
 * @param invalid - True when stored rules could not be read
 */
export function describeAvailability(
  availability: AvailabilityV1 | null,
  invalid: boolean,
): string {
  if (invalid) {
    return 'Rules unreadable: locked until saved again';
  }
  if (availability === null) {
    return 'Always open';
  }
  const count = countConditions(availability);
  if (count === 0) {
    return 'Always open';
  }
  const mode = 'any' in availability ? 'any' : 'all';
  return count === 1
    ? '1 condition'
    : `${count} conditions (${mode} must hold)`;
}
