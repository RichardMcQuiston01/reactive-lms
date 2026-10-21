import { describe, expect, test } from 'bun:test';
import { LmsError } from '@richardmcquiston01/reactive-lms-shared';
import type { CourseModule } from '@richardmcquiston01/reactive-lms-persistence';
import { assertAvailable } from './availability';
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
