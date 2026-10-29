import { describe, expect, test } from 'bun:test';
import {
  MAX_MODULE_DEPTH,
  ancestorsOf,
  assertCanParent,
  contentModules,
  isBlockModule,
  subtreeHeight,
  type TreeModule,
} from './module-tree';

const PACKAGE = 'pkg';

function block(id: string, parentModuleId: string | null = null): TreeModule {
  return { id, parentModuleId, contentPackageId: null };
}

function content(id: string, parentModuleId: string | null = null): TreeModule {
  return { id, parentModuleId, contentPackageId: PACKAGE };
}

describe('isBlockModule and contentModules', () => {
  test('a module without a content package is a block', () => {
    expect(isBlockModule(block('b'))).toBe(true);
    expect(isBlockModule(content('c'))).toBe(false);
  });

  test('contentModules keeps launchable modules at any depth', () => {
    const modules = [
      block('b1'),
      content('c1', 'b1'),
      block('b2', 'b1'),
      content('c2', 'b2'),
      content('c3'),
    ];
    expect(contentModules(modules).map((entry) => entry.id)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });
});

describe('ancestorsOf', () => {
  test('lists ancestors outermost first', () => {
    const modules = [block('a'), block('b', 'a'), content('c', 'b')];
    expect(ancestorsOf(modules, 'c').map((entry) => entry.id)).toEqual([
      'a',
      'b',
    ]);
    expect(ancestorsOf(modules, 'a')).toEqual([]);
  });

  test('a missing parent is MODULE_TREE_INVALID', () => {
    expect(() => ancestorsOf([content('c', 'ghost')], 'c')).toThrow(
      'which is not in its section',
    );
    try {
      ancestorsOf([content('c', 'ghost')], 'c');
    } catch (error) {
      expect(error).toMatchObject({ code: 'MODULE_TREE_INVALID', status: 400 });
    }
  });

  test('a parent cycle is detected instead of looping forever', () => {
    const modules = [block('a', 'b'), block('b', 'a')];
    expect(() => ancestorsOf(modules, 'a')).toThrow('parent cycle');
  });
});

describe('subtreeHeight', () => {
  test('is 1 for a leaf and counts the deepest branch', () => {
    const modules = [
      block('a'),
      block('b', 'a'),
      content('c', 'b'),
      content('d', 'a'),
    ];
    expect(subtreeHeight(modules, 'c')).toBe(1);
    expect(subtreeHeight(modules, 'b')).toBe(2);
    expect(subtreeHeight(modules, 'a')).toBe(3);
    expect(subtreeHeight(modules, 'not-yet-saved')).toBe(1);
  });
});

describe('assertCanParent', () => {
  test('the top level is always allowed', () => {
    expect(() => assertCanParent([content('c')], 'c', null)).not.toThrow();
  });

  test('a block can hold modules and other blocks', () => {
    const modules = [block('b'), content('c'), block('b2')];
    expect(() => assertCanParent(modules, 'c', 'b')).not.toThrow();
    expect(() => assertCanParent(modules, 'b2', 'b')).not.toThrow();
  });

  test('an unknown parent is MODULE_NOT_FOUND', () => {
    try {
      assertCanParent([content('c')], 'c', 'ghost');
      throw new Error('expected assertCanParent to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'MODULE_NOT_FOUND', status: 404 });
    }
  });

  test('a content module cannot be a parent, and the message says why', () => {
    const modules = [content('parent'), content('child')];
    expect(() => assertCanParent(modules, 'child', 'parent')).toThrow(
      'holds content, so it cannot contain other modules',
    );
  });

  test('a module cannot be its own parent', () => {
    expect(() => assertCanParent([block('b')], 'b', 'b')).toThrow('own parent');
  });

  test('a block cannot move under its own descendant', () => {
    const modules = [block('a'), block('b', 'a'), block('c', 'b')];
    expect(() => assertCanParent(modules, 'a', 'c')).toThrow(
      'inside its own subtree',
    );
  });

  test('the depth limit counts the moved subtree', () => {
    // A chain of blocks MAX_MODULE_DEPTH - 1 deep, plus a 2-deep subtree.
    const chain: TreeModule[] = [];
    for (let level = 0; level < MAX_MODULE_DEPTH - 1; level += 1) {
      chain.push(block(`n${level}`, level === 0 ? null : `n${level - 1}`));
    }
    const subtree = [block('s'), content('leaf', 's')];
    const modules = [...chain, ...subtree];
    const deepest = `n${MAX_MODULE_DEPTH - 2}`;

    // Putting the 2-deep subtree under the deepest block reaches depth 6.
    expect(() => assertCanParent(modules, 's', deepest)).toThrow(
      `limit is ${MAX_MODULE_DEPTH}`,
    );
    // A single leaf fits at exactly the limit.
    expect(() => assertCanParent(modules, 'leaf', deepest)).not.toThrow();
  });
});
