import { describe, expect, test } from 'bun:test';
import type { CourseModuleDto } from '@richardmcquiston01/reactive-lms-shared';
import {
  buildModuleTree,
  describeAvailability,
  flattenModuleTree,
  parentChoices,
  planSiblingMove,
} from './module-tree';

function module(
  id: string,
  extra: Partial<CourseModuleDto> = {},
): CourseModuleDto {
  return {
    id,
    courseSectionId: 'section',
    parentModuleId: null,
    contentPackageId: 'pkg',
    title: id,
    sortOrder: 0,
    isBlock: false,
    availability: null,
    availabilityInvalid: false,
    ...extra,
  };
}

function block(
  id: string,
  extra: Partial<CourseModuleDto> = {},
): CourseModuleDto {
  return module(id, { contentPackageId: null, isBlock: true, ...extra });
}

const ids = (modules: readonly CourseModuleDto[]): string[] =>
  flattenModuleTree(buildModuleTree(modules)).map((node) => node.module.id);

describe('buildModuleTree', () => {
  test('orders siblings by sort order and nests children under parents', () => {
    const modules = [
      module('b-leaf', { parentModuleId: 'b', sortOrder: 0 }),
      block('b', { sortOrder: 1 }),
      module('a', { sortOrder: 0 }),
      module('b-leaf-2', { parentModuleId: 'b', sortOrder: 1 }),
    ];

    expect(ids(modules)).toEqual(['a', 'b', 'b-leaf', 'b-leaf-2']);
    const tree = buildModuleTree(modules);
    expect(tree[1]?.children.map((child) => child.depth)).toEqual([2, 2]);
    expect(tree[1]?.siblingIndex).toBe(1);
    expect(tree[1]?.siblingCount).toBe(2);
  });

  test('shows a module whose parent is missing at the top level', () => {
    expect(ids([module('lost', { parentModuleId: 'gone' })])).toEqual(['lost']);
  });

  test('does not loop on a parent cycle', () => {
    const modules = [
      block('x', { parentModuleId: 'y' }),
      block('y', { parentModuleId: 'x' }),
    ];
    expect(() => ids(modules)).not.toThrow();
  });
});

describe('parentChoices', () => {
  const modules = [
    block('ch1'),
    block('ch1-sub', { parentModuleId: 'ch1' }),
    module('leaf', { parentModuleId: 'ch1-sub' }),
    block('ch2', { sortOrder: 1 }),
  ];

  const choiceIds = (moduleId: string | null): string[] =>
    parentChoices(modules, moduleId).map((node) => node.module.id);

  test('offers blocks only, never the module or its descendants', () => {
    expect(choiceIds('leaf')).toEqual(['ch1', 'ch1-sub', 'ch2']);
    expect(choiceIds('ch1')).toEqual(['ch2']);
  });

  test('offers every block for a new block', () => {
    expect(choiceIds(null)).toEqual(['ch1', 'ch1-sub', 'ch2']);
  });

  test('drops blocks that would nest the subtree past the depth limit', () => {
    const deep = [
      block('d1'),
      block('d2', { parentModuleId: 'd1' }),
      block('d3', { parentModuleId: 'd2' }),
      block('d4', { parentModuleId: 'd3' }),
      block('d5', { parentModuleId: 'd4' }),
      block('mover'),
      module('mover-child', { parentModuleId: 'mover' }),
    ];
    // mover has height 1, so it fits under a block at depth <= 3.
    const options = parentChoices(deep, 'mover').map((node) => node.module.id);
    expect(options).toEqual(['d1', 'd2', 'd3']);
  });
});

describe('planSiblingMove', () => {
  const modules = [
    module('a', { sortOrder: 0 }),
    module('b', { sortOrder: 1 }),
    module('c', { sortOrder: 2 }),
    module('inner', { parentModuleId: 'x', sortOrder: 0 }),
    block('x', { sortOrder: 3 }),
  ];

  test('swaps with the next sibling', () => {
    expect(planSiblingMove(modules, 'a', 1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
  });

  test('does nothing at either end', () => {
    expect(planSiblingMove(modules, 'a', -1)).toEqual([]);
    expect(planSiblingMove(modules, 'x', 1)).toEqual([]);
    expect(planSiblingMove(modules, 'inner', 1)).toEqual([]);
  });

  test('only moves among siblings of the same parent', () => {
    expect(planSiblingMove(modules, 'x', -1)).toEqual([
      { id: 'x', sortOrder: 2 },
      { id: 'c', sortOrder: 3 },
    ]);
  });

  test('renumbers gaps and duplicates', () => {
    const gappy = [
      module('a', { sortOrder: 5 }),
      module('b', { sortOrder: 5, title: 'bb' }),
      module('c', { sortOrder: 9 }),
    ];
    expect(planSiblingMove(gappy, 'c', -1)).toEqual([
      { id: 'a', sortOrder: 0 },
      { id: 'c', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ]);
  });

  test('ignores an unknown module', () => {
    expect(planSiblingMove(modules, 'nope', 1)).toEqual([]);
  });
});

describe('describeAvailability', () => {
  test('describes open, conditional, and unreadable modules', () => {
    expect(describeAvailability(null, false)).toBe('Always open');
    expect(describeAvailability({ version: 1, all: [] }, false)).toBe(
      'Always open',
    );
    expect(
      describeAvailability(
        { version: 1, all: [{ type: 'module_completed', moduleId: 'm' }] },
        false,
      ),
    ).toBe('1 condition');
    expect(
      describeAvailability(
        {
          version: 1,
          any: [
            { type: 'group_member', groupId: 'g' },
            {
              all: [{ type: 'min_score', score: 0.5 }, { type: 'date_window' }],
            },
          ],
        },
        false,
      ),
    ).toBe('3 conditions (any must hold)');
    expect(describeAvailability(null, true)).toContain('locked');
  });
});
