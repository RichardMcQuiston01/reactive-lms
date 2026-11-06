import { describe, expect, test } from 'bun:test';
import type {
  AvailabilityV1,
  CourseModuleDto,
} from '@richardmcquiston01/reactive-lms-shared';
import {
  buildAvailability,
  conditionTargets,
  draftFromAvailability,
  emptyDraft,
  isoToLocalInput,
  localInputToIso,
  newCondition,
  summarizeConditions,
  type ConditionDraft,
  type RulesDraft,
} from './availability-editor';

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

function draftOf(
  mode: RulesDraft['mode'],
  ...conditions: Array<Partial<ConditionDraft> & Pick<ConditionDraft, 'type'>>
): RulesDraft {
  return {
    mode,
    conditions: conditions.map((condition) => ({
      ...newCondition(condition.type),
      ...condition,
    })),
  };
}

const ALLOWED = new Set(['a', 'b']);

function errorsOf(draft: RulesDraft): string[] {
  const result = buildAvailability(draft, ALLOWED);
  if (result.ok) {
    throw new Error('Expected the draft to be refused.');
  }
  return result.errors;
}

function valueOf(draft: RulesDraft): AvailabilityV1 | null {
  const result = buildAvailability(draft, ALLOWED);
  if (!result.ok) {
    throw new Error(`Expected success: ${result.errors.join(' ')}`);
  }
  return result.value;
}

describe('buildAvailability', () => {
  test('no conditions means no rules', () => {
    expect(valueOf(emptyDraft())).toBeNull();
  });

  test('builds every condition type into all', () => {
    expect(
      valueOf(
        draftOf(
          'all',
          { type: 'module_completed', moduleId: 'a' },
          { type: 'min_score', moduleId: 'b', percent: '80' },
          { type: 'date_window', from: '2026-06-01T09:00' },
          { type: 'group_member', groupId: ' g1 ' },
        ),
      ),
    ).toEqual({
      version: 1,
      all: [
        { type: 'module_completed', moduleId: 'a' },
        { type: 'min_score', moduleId: 'b', score: 0.8 },
        {
          type: 'date_window',
          from: new Date('2026-06-01T09:00').toISOString(),
        },
        { type: 'group_member', groupId: 'g1' },
      ],
    });
  });

  test('any mode builds an any group', () => {
    expect(
      valueOf(
        draftOf(
          'any',
          { type: 'module_completed', moduleId: 'a' },
          { type: 'group_member', groupId: 'g1' },
        ),
      ),
    ).toEqual({
      version: 1,
      any: [
        { type: 'module_completed', moduleId: 'a' },
        { type: 'group_member', groupId: 'g1' },
      ],
    });
  });

  test('a score of 0 and of 100 are both allowed', () => {
    expect(
      valueOf(
        draftOf('all', { type: 'min_score', moduleId: 'a', percent: '0' }),
      ),
    ).toEqual({
      version: 1,
      all: [{ type: 'min_score', moduleId: 'a', score: 0 }],
    });
    expect(
      valueOf(
        draftOf('all', { type: 'min_score', moduleId: 'a', percent: '100' }),
      ),
    ).toEqual({
      version: 1,
      all: [{ type: 'min_score', moduleId: 'a', score: 1 }],
    });
  });

  test('a module that is not on the allowed list is refused', () => {
    const errors = errorsOf(
      draftOf('all', { type: 'module_completed', moduleId: 'blockish' }),
    );
    expect(errors).toEqual([
      'Condition 1: choose the module that must be completed.',
    ]);
    expect(
      errorsOf(draftOf('all', { type: 'module_completed', moduleId: '' })),
    ).toHaveLength(1);
  });

  test('scores outside 0 to 100, blank, or not numbers are refused', () => {
    for (const percent of ['101', '-1', '', 'high', ' ']) {
      expect(
        errorsOf(draftOf('all', { type: 'min_score', moduleId: 'a', percent })),
      ).toEqual(['Condition 1: enter a minimum score from 0 to 100.']);
    }
  });

  test('a score condition reports both a missing module and a bad score', () => {
    expect(
      errorsOf(
        draftOf('all', { type: 'min_score', moduleId: '', percent: '' }),
      ),
    ).toHaveLength(2);
  });

  test('a date window needs a start, an end, or both, in order', () => {
    expect(errorsOf(draftOf('all', { type: 'date_window' }))).toEqual([
      'Condition 1: enter a start, an end, or both.',
    ]);
    expect(
      errorsOf(
        draftOf('all', {
          type: 'date_window',
          from: '2026-06-02T09:00',
          until: '2026-06-01T09:00',
        }),
      ),
    ).toEqual(['Condition 1: the start must be before the end.']);
    expect(
      errorsOf(
        draftOf('all', {
          type: 'date_window',
          from: '2026-06-01T09:00',
          until: '2026-06-01T09:00',
        }),
      ),
    ).toEqual(['Condition 1: the start must be before the end.']);
    expect(
      errorsOf(draftOf('all', { type: 'date_window', until: 'tomorrow-ish' })),
    ).toEqual(['Condition 1: the end is not a valid date and time.']);
  });

  test('an open-ended window is allowed on either side', () => {
    expect(
      valueOf(
        draftOf('all', { type: 'date_window', until: '2026-06-30T17:00' }),
      ),
    ).toEqual({
      version: 1,
      all: [
        {
          type: 'date_window',
          until: new Date('2026-06-30T17:00').toISOString(),
        },
      ],
    });
  });

  test('a blank group id is refused', () => {
    expect(
      errorsOf(draftOf('all', { type: 'group_member', groupId: '  ' })),
    ).toEqual(['Condition 1: enter the id of the group.']);
  });

  test('problems are listed together and name their condition', () => {
    const errors = errorsOf(
      draftOf(
        'all',
        { type: 'module_completed', moduleId: 'a' },
        { type: 'group_member', groupId: '' },
        { type: 'min_score', moduleId: 'a', percent: '150' },
      ),
    );
    expect(errors).toEqual([
      'Condition 2: enter the id of the group.',
      'Condition 3: enter a minimum score from 0 to 100.',
    ]);
  });

  test('rules over the shared size limit are refused with the shared message', () => {
    const many = draftOf(
      'all',
      ...Array.from({ length: 60 }, () => ({
        type: 'module_completed' as const,
        moduleId: 'a',
      })),
    );
    const result = buildAvailability(many, ALLOWED);
    expect(result.ok).toBe(false);
  });
});

describe('draftFromAvailability', () => {
  test('no rules give an empty draft', () => {
    expect(draftFromAvailability(null)).toEqual({
      ok: true,
      draft: { mode: 'all', conditions: [] },
    });
  });

  test('reads every condition type into the form', () => {
    const result = draftFromAvailability({
      version: 1,
      any: [
        { type: 'module_completed', moduleId: 'a' },
        { type: 'min_score', moduleId: 'b', score: 0.855 },
        { type: 'min_score', score: 0.5 },
        { type: 'group_member', groupId: 'g1' },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.mode).toBe('any');
    expect(
      result.draft.conditions.map((c) => [c.type, c.moduleId, c.percent]),
    ).toEqual([
      ['module_completed', 'a', ''],
      ['min_score', 'b', '85.5'],
      ['min_score', '', '50'],
      ['group_member', '', ''],
    ]);
    expect(result.draft.conditions[3]?.groupId).toBe('g1');
  });

  test('nested groups are reported, not flattened', () => {
    const result = draftFromAvailability({
      version: 1,
      all: [
        { type: 'module_completed', moduleId: 'a' },
        { any: [{ type: 'group_member', groupId: 'g1' }] },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('one group of conditions inside another');
  });

  test('a draft built from rules builds back to the same rules', () => {
    const rules: AvailabilityV1 = {
      version: 1,
      all: [
        { type: 'module_completed', moduleId: 'a' },
        { type: 'min_score', moduleId: 'b', score: 0.855 },
        {
          type: 'date_window',
          from: new Date('2026-06-01T09:00').toISOString(),
          until: new Date('2026-06-30T17:30').toISOString(),
        },
        { type: 'group_member', groupId: 'g1' },
      ],
    };
    const read = draftFromAvailability(rules);
    if (!read.ok) throw new Error(read.reason);

    expect(valueOf(read.draft)).toEqual(rules);
  });
});

describe('date conversion', () => {
  test('a form value converts to an instant and back', () => {
    const iso = localInputToIso('2026-06-01T09:05');
    expect(iso).toBe(new Date('2026-06-01T09:05').toISOString());
    expect(isoToLocalInput(iso ?? undefined)).toBe('2026-06-01T09:05');
  });

  test('empty and invalid values give nothing', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('not a date')).toBeNull();
    expect(isoToLocalInput(undefined)).toBe('');
    expect(isoToLocalInput('garbage')).toBe('');
  });
});

describe('conditionTargets', () => {
  const modules = [
    block('chapter', { sortOrder: 1 }),
    module('intro', { sortOrder: 0 }),
    module('lesson', { parentModuleId: 'chapter', sortOrder: 0 }),
    module('quiz', { parentModuleId: 'chapter', sortOrder: 1 }),
  ];

  const idsFor = (id: string): string[] =>
    conditionTargets(
      modules,
      modules.find((candidate) => candidate.id === id) as CourseModuleDto,
    ).map((node) => node.module.id);

  test('offers content modules other than the one being edited', () => {
    expect(idsFor('quiz')).toEqual(['intro', 'lesson']);
  });

  test('never offers a block', () => {
    expect(idsFor('intro')).not.toContain('chapter');
  });

  test('a block is not offered the modules inside it', () => {
    expect(idsFor('chapter')).toEqual(['intro']);
  });

  test('a module deeper inside a block is excluded too', () => {
    const deep = [
      block('outer'),
      block('inner', { parentModuleId: 'outer' }),
      module('leaf', { parentModuleId: 'inner' }),
      module('other'),
    ];
    expect(
      conditionTargets(deep, deep[0] as CourseModuleDto).map(
        (node) => node.module.id,
      ),
    ).toEqual(['other']);
  });
});

describe('summarizeConditions', () => {
  const titleOf = (id: string): string => `Title of ${id}`;

  test('no rules give no lines', () => {
    expect(summarizeConditions(null, titleOf)).toEqual([]);
  });

  test('describes each condition in words', () => {
    const lines = summarizeConditions(
      {
        version: 1,
        all: [
          { type: 'module_completed', moduleId: 'a' },
          { type: 'min_score', moduleId: 'b', score: 0.8 },
          { type: 'min_score', score: 0.5 },
          { type: 'group_member', groupId: 'g1' },
        ],
      },
      titleOf,
    );
    expect(lines).toEqual([
      '"Title of a" is completed',
      '"Title of b" scores at least 80%',
      '"this module" scores at least 50%',
      'Learner is in group g1',
    ]);
  });

  test('describes open-ended windows', () => {
    const [from] = summarizeConditions(
      {
        version: 1,
        all: [
          {
            type: 'date_window',
            from: new Date('2026-06-01T09:00').toISOString(),
          },
        ],
      },
      titleOf,
    );
    const [until] = summarizeConditions(
      {
        version: 1,
        all: [
          {
            type: 'date_window',
            until: new Date('2026-06-30T17:00').toISOString(),
          },
        ],
      },
      titleOf,
    );
    expect(from).toBe('Open from 2026-06-01 09:00');
    expect(until).toBe('Open until 2026-06-30 17:00');
  });

  test('a nested group is named, not described', () => {
    expect(
      summarizeConditions(
        {
          version: 1,
          all: [{ any: [{ type: 'group_member', groupId: 'g' }] }],
        },
        titleOf,
      ),
    ).toEqual(['A nested group of conditions']);
  });
});
