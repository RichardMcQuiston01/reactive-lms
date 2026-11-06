import { describe, expect, test } from 'bun:test';
import {
  AVAILABILITY_INVALID,
  LmsError,
  type AvailabilityV1,
} from '@richardmcquiston01/reactive-lms-shared';
import {
  assertAvailabilityReferences,
  type ReferenceModule,
  type ReferencingModule,
} from './availability-references';

function content(
  id: string,
  extra: Partial<ReferenceModule> = {},
): ReferenceModule {
  return {
    id,
    title: id.toUpperCase(),
    parentModuleId: null,
    contentPackageId: 'pkg',
    availabilityJson: null,
    ...extra,
  };
}

function block(
  id: string,
  extra: Partial<ReferenceModule> = {},
): ReferenceModule {
  return content(id, { contentPackageId: null, ...extra });
}

function completed(moduleId: string): AvailabilityV1 {
  return { version: 1, all: [{ type: 'module_completed', moduleId }] };
}

function messagesOf(
  rules: AvailabilityV1 | null,
  module: ReferencingModule,
  modules: readonly ReferenceModule[],
): string[] {
  try {
    assertAvailabilityReferences(rules, module, modules);
  } catch (error) {
    expect(error).toBeInstanceOf(LmsError);
    expect((error as LmsError).code).toBe(AVAILABILITY_INVALID);
    return (error as LmsError).details?.['errors'] as string[];
  }
  return [];
}

const top = (id: string, isBlock = false): ReferencingModule => ({
  id,
  isBlock,
  parentModuleId: null,
});

describe('assertAvailabilityReferences: what a condition may name', () => {
  test('no rules, and rules that name real modules, pass', () => {
    const modules = [content('a'), content('b')];
    expect(messagesOf(null, top('b'), modules)).toEqual([]);
    expect(messagesOf(completed('a'), top('b'), modules)).toEqual([]);
  });

  test('a module that is not in the section is refused', () => {
    const messages = messagesOf(completed('gone'), top('b'), [content('b')]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('not in this section');
  });

  test('a block cannot be named, because it never records completion', () => {
    const messages = messagesOf(completed('chapter'), top('b'), [
      block('chapter', { title: 'Chapter 1' }),
      content('b'),
    ]);
    expect(messages[0]).toContain('block "Chapter 1"');
  });

  test('a module cannot wait on its own completion or score', () => {
    const modules = [content('a', { title: 'Quiz' })];
    expect(messagesOf(completed('a'), top('a'), modules)[0]).toContain(
      '"Quiz" cannot wait on its own',
    );
    expect(
      messagesOf(
        { version: 1, all: [{ type: 'min_score', moduleId: 'a', score: 0.5 }] },
        top('a'),
        modules,
      )[0],
    ).toContain('cannot wait on its own');
  });

  test('a minimum score with no module named is refused on a module', () => {
    const messages = messagesOf(
      { version: 1, all: [{ type: 'min_score', score: 0.5 }] },
      top('a'),
      [content('a')],
    );
    expect(messages[0]).toContain('only earn after it opens');
  });

  test('a block cannot wait on a module inside it', () => {
    const modules = [
      block('chapter', { title: 'Chapter 1' }),
      content('lesson', { title: 'Lesson', parentModuleId: 'chapter' }),
    ];
    const messages = messagesOf(
      completed('lesson'),
      top('chapter', true),
      modules,
    );
    expect(messages[0]).toContain('cannot wait on "Lesson"');
  });

  test('every problem is reported together', () => {
    const messages = messagesOf(
      {
        version: 1,
        all: [
          { type: 'module_completed', moduleId: 'gone' },
          { type: 'module_completed', moduleId: 'chapter' },
        ],
      },
      top('b'),
      [block('chapter'), content('b')],
    );
    expect(messages).toHaveLength(2);
  });
});

describe('assertAvailabilityReferences: modules waiting on each other', () => {
  test('two modules that wait on each other are refused', () => {
    const modules = [
      content('a', { title: 'A', availabilityJson: completed('b') }),
      content('b', { title: 'B' }),
    ];
    const messages = messagesOf(completed('a'), top('b'), modules);
    expect(messages[0]).toContain('wait on each other');
    expect(messages[0]).toContain('B → A → B');
  });

  test('a longer loop is found too', () => {
    const modules = [
      content('a', { availabilityJson: completed('b') }),
      content('b', { availabilityJson: completed('c') }),
      content('c'),
    ];
    expect(messagesOf(completed('a'), top('c'), modules)[0]).toContain(
      'wait on each other',
    );
  });

  test('a chain with no loop passes', () => {
    const modules = [
      content('a'),
      content('b', { availabilityJson: completed('a') }),
      content('c'),
    ];
    expect(messagesOf(completed('b'), top('c'), modules)).toEqual([]);
  });

  test('the rules of a block count against everything inside it', () => {
    // Lesson sits in the chapter. The chapter waits on Intro; Intro waits on
    // Lesson, which cannot open until the chapter does.
    const modules = [
      block('chapter', { availabilityJson: completed('intro') }),
      content('lesson', { parentModuleId: 'chapter' }),
      content('intro'),
    ];
    const messages = messagesOf(completed('lesson'), top('intro'), modules);
    expect(messages[0]).toContain('wait on each other');
  });

  test('editing a block checks the modules inside it', () => {
    const modules = [
      block('chapter'),
      content('lesson', { parentModuleId: 'chapter' }),
      content('intro', { availabilityJson: completed('lesson') }),
    ];
    const messages = messagesOf(
      completed('intro'),
      top('chapter', true),
      modules,
    );
    expect(messages[0]).toContain('wait on each other');
  });

  test('an any group does not force a wait, so it does not make a loop', () => {
    const modules = [
      content('a', {
        availabilityJson: {
          version: 1,
          any: [
            { type: 'module_completed', moduleId: 'b' },
            { type: 'date_window', from: '2026-01-01T00:00:00.000Z' },
          ],
        },
      }),
      content('b'),
    ];
    expect(messagesOf(completed('a'), top('b'), modules)).toEqual([]);
  });

  test('an any group still has to name real modules', () => {
    const messages = messagesOf(
      {
        version: 1,
        any: [{ type: 'module_completed', moduleId: 'gone' }],
      },
      top('b'),
      [content('b')],
    );
    expect(messages[0]).toContain('not in this section');
  });

  test('unreadable stored rules on another module do not block this edit', () => {
    const modules = [
      content('a', { availabilityJson: { version: 9 } }),
      content('b'),
    ];
    expect(messagesOf(completed('a'), top('b'), modules)).toEqual([]);
  });

  test('a new module is checked against where it will be placed', () => {
    const modules = [
      block('chapter', { availabilityJson: completed('intro') }),
      content('intro'),
    ];
    const lesson: ReferencingModule = {
      id: 'new',
      isBlock: false,
      parentModuleId: 'chapter',
    };
    // Intro does not wait on the new module, so there is no loop.
    expect(messagesOf(completed('intro'), lesson, modules)).toEqual([]);
  });
});
