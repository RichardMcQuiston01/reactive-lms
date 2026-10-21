import { describe, expect, test } from 'bun:test';
import {
  LmsError,
  type AvailabilityV1,
} from '@richardmcquiston01/reactive-lms-shared';
import type { CourseModule } from '@richardmcquiston01/reactive-lms-persistence';
import {
  assertAvailable,
  evaluateAvailability,
  normalizeAvailabilityInput,
} from './availability';
import type { AvailabilityProgress } from './availability';

const MODULE_ID = '11111111-1111-4111-8111-111111111111';
const AFTER_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-06-15T12:00:00.000Z');

function module(
  availability?: CourseModule['availabilityJson'],
): Pick<CourseModule, 'id' | 'availabilityJson'> {
  return { id: MODULE_ID, availabilityJson: availability ?? null };
}

function progress(
  entries: Array<[string, AvailabilityProgress]>,
): ReadonlyMap<string, AvailabilityProgress> {
  return new Map(entries);
}

describe('assertAvailable', () => {
  test('allows a module with no availability rules', () => {
    expect(() => assertAvailable(module(), new Map(), NOW)).not.toThrow();
  });

  test('allows a module whose date window contains now', () => {
    expect(() =>
      assertAvailable(
        module({
          availableFrom: '2026-06-01T00:00:00.000Z',
          availableUntil: '2026-06-30T23:59:59.000Z',
        }),
        new Map(),
        NOW,
      ),
    ).not.toThrow();
  });

  test('throws MODULE_NOT_AVAILABLE before availableFrom', () => {
    try {
      assertAvailable(
        module({ availableFrom: '2026-07-01T00:00:00.000Z' }),
        new Map(),
        NOW,
      );
      throw new Error('expected assertAvailable to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'MODULE_NOT_AVAILABLE',
        status: 403,
      });
    }
  });

  test('throws MODULE_NOT_AVAILABLE after availableUntil', () => {
    try {
      assertAvailable(
        module({ availableUntil: '2026-06-01T00:00:00.000Z' }),
        new Map(),
        NOW,
      );
      throw new Error('expected assertAvailable to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'MODULE_NOT_AVAILABLE',
        status: 403,
      });
    }
  });

  test('throws MODULE_NOT_AVAILABLE when afterModule is missing or incomplete', () => {
    try {
      assertAvailable(
        module({ afterModuleId: AFTER_ID }),
        progress([[AFTER_ID, { completionStatus: 'incomplete' }]]),
        NOW,
      );
      throw new Error('expected assertAvailable to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'MODULE_NOT_AVAILABLE',
        status: 403,
      });
    }
  });

  test('allows launch when afterModule is completed', () => {
    expect(() =>
      assertAvailable(
        module({ afterModuleId: AFTER_ID }),
        progress([[AFTER_ID, { completionStatus: 'completed' }]]),
        NOW,
      ),
    ).not.toThrow();
  });

  test('throws MODULE_NOT_AVAILABLE when minScore is not met', () => {
    try {
      assertAvailable(
        module({ afterModuleId: AFTER_ID, minScore: 0.8 }),
        progress([
          [AFTER_ID, { completionStatus: 'completed', scoreScaled: 0.5 }],
        ]),
        NOW,
      );
      throw new Error('expected assertAvailable to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'MODULE_NOT_AVAILABLE',
        status: 403,
      });
    }
  });

  test('allows launch when afterModule is completed and minScore is met', () => {
    expect(() =>
      assertAvailable(
        module({ afterModuleId: AFTER_ID, minScore: 0.8 }),
        progress([
          [AFTER_ID, { completionStatus: 'completed', scoreScaled: 0.8 }],
        ]),
        NOW,
      ),
    ).not.toThrow();
  });
});

function context(
  overrides: Partial<Parameters<typeof evaluateAvailability>[1]> = {},
): Parameters<typeof evaluateAvailability>[1] {
  return {
    moduleId: MODULE_ID,
    now: NOW,
    progressByModuleId: new Map(),
    groupIds: new Set(),
    ...overrides,
  };
}

describe('evaluateAvailability', () => {
  test('no rules means available', () => {
    expect(evaluateAvailability(null, context())).toEqual({ available: true });
  });

  test('all requires every condition and reports each unmet one', () => {
    const rules: AvailabilityV1 = {
      version: 1,
      all: [
        { type: 'module_completed', moduleId: AFTER_ID },
        { type: 'group_member', groupId: 'g1' },
        { type: 'date_window', until: '2026-01-01T00:00:00.000Z' },
      ],
    };

    const result = evaluateAvailability(rules, context());

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.unmet.map((entry) => entry.message)).toEqual([
        'A required previous module is not completed.',
        'The learner is not a member of a required group.',
        'Module is no longer available.',
      ]);
    }
  });

  test('any is satisfied by one condition', () => {
    const rules: AvailabilityV1 = {
      version: 1,
      any: [
        { type: 'group_member', groupId: 'g1' },
        { type: 'module_completed', moduleId: AFTER_ID },
      ],
    };

    expect(
      evaluateAvailability(rules, context({ groupIds: new Set(['g1']) })),
    ).toEqual({ available: true });
    expect(
      evaluateAvailability(
        rules,
        context({
          progressByModuleId: progress([
            [AFTER_ID, { completionStatus: 'completed' }],
          ]),
        }),
      ),
    ).toEqual({ available: true });
  });

  test('any that fails reports every alternative', () => {
    const rules: AvailabilityV1 = {
      version: 1,
      any: [
        { type: 'group_member', groupId: 'g1' },
        { type: 'group_member', groupId: 'g2' },
      ],
    };

    const result = evaluateAvailability(rules, context());

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.unmet.map((entry) => entry.details['groupId'])).toEqual([
        'g1',
        'g2',
      ]);
    }
  });

  test('nested groups combine: group member or (completed and scored)', () => {
    const rules: AvailabilityV1 = {
      version: 1,
      any: [
        { type: 'group_member', groupId: 'staff' },
        {
          all: [
            { type: 'module_completed', moduleId: AFTER_ID },
            { type: 'min_score', moduleId: AFTER_ID, score: 0.8 },
          ],
        },
      ],
    };
    const scored = progress([
      [AFTER_ID, { completionStatus: 'completed', scoreScaled: 0.9 }],
    ]);
    const lowScore = progress([
      [AFTER_ID, { completionStatus: 'completed', scoreScaled: 0.5 }],
    ]);

    expect(
      evaluateAvailability(rules, context({ progressByModuleId: scored })),
    ).toEqual({ available: true });
    expect(
      evaluateAvailability(rules, context({ progressByModuleId: lowScore }))
        .available,
    ).toBe(false);
    expect(
      evaluateAvailability(
        rules,
        context({
          progressByModuleId: lowScore,
          groupIds: new Set(['staff']),
        }),
      ),
    ).toEqual({ available: true });
  });

  test('min_score without a moduleId reads the module itself', () => {
    const rules: AvailabilityV1 = {
      version: 1,
      all: [{ type: 'min_score', score: 0.6 }],
    };

    expect(
      evaluateAvailability(
        rules,
        context({
          progressByModuleId: progress([[MODULE_ID, { scoreScaled: 0.6 }]]),
        }),
      ),
    ).toEqual({ available: true });
    expect(evaluateAvailability(rules, context()).available).toBe(false);
  });

  test('a date window is inclusive of its bounds', () => {
    const rules: AvailabilityV1 = {
      version: 1,
      all: [
        {
          type: 'date_window',
          from: NOW.toISOString(),
          until: NOW.toISOString(),
        },
      ],
    };
    // from >= until is rejected by the parser, so evaluate the rule directly.
    expect(evaluateAvailability(rules, context())).toEqual({ available: true });
  });
});

describe('assertAvailable with conditions', () => {
  test('lists every unmet condition in details.unmet', () => {
    try {
      assertAvailable(
        module({
          version: 1,
          all: [
            { type: 'module_completed', moduleId: AFTER_ID },
            { type: 'group_member', groupId: 'g1' },
          ],
        }),
        new Map(),
        NOW,
      );
      throw new Error('expected assertAvailable to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      const lms = error as LmsError;
      expect(lms.code).toBe('MODULE_NOT_AVAILABLE');
      expect(lms.message).toBe('A required previous module is not completed.');
      const unmet = (lms.details as { unmet: unknown[] }).unmet;
      expect(unmet).toHaveLength(2);
    }
  });

  test('passes a group condition when the learner is in the group', () => {
    expect(() =>
      assertAvailable(
        module({
          version: 1,
          all: [{ type: 'group_member', groupId: 'g1' }],
        }),
        new Map(),
        NOW,
        new Set(['g1']),
      ),
    ).not.toThrow();
  });

  test('fails closed on invalid stored rules', () => {
    try {
      assertAvailable(
        module({ version: 2 } as unknown as CourseModule['availabilityJson']),
        new Map(),
        NOW,
      );
      throw new Error('expected assertAvailable to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'MODULE_NOT_AVAILABLE',
        status: 403,
      });
      expect((error as LmsError).message).toContain('invalid availability');
    }
  });
});

describe('normalizeAvailabilityInput', () => {
  test('upcasts version 0 and passes version 1 through', () => {
    expect(normalizeAvailabilityInput({ afterModuleId: AFTER_ID })).toEqual({
      version: 1,
      all: [{ type: 'module_completed', moduleId: AFTER_ID }],
    });
    const v1: AvailabilityV1 = {
      version: 1,
      all: [{ type: 'group_member', groupId: 'g' }],
    };
    expect(normalizeAvailabilityInput(v1)).toEqual(v1);
    expect(normalizeAvailabilityInput(undefined)).toBeNull();
  });

  test('throws AVAILABILITY_INVALID with every problem in details', () => {
    try {
      normalizeAvailabilityInput({
        version: 1,
        all: [{ type: 'min_score', score: 5 }, { type: 'nope' }],
      });
      throw new Error('expected normalizeAvailabilityInput to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'AVAILABILITY_INVALID',
        status: 400,
      });
      const errors = (error as LmsError).details as { errors: string[] };
      expect(errors.errors).toHaveLength(2);
    }
  });
});
