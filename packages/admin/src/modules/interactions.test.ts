import { describe, expect, test } from 'bun:test';
import type { InteractionResponseDto } from '@richardmcquiston01/reactive-lms-shared';
import {
  formatPatterns,
  formatResult,
  groupByAttempt,
  orDash,
  tallyResults,
} from './interactions';

function answer(
  extra: Partial<InteractionResponseDto>,
): InteractionResponseDto {
  return {
    id: 'row',
    attemptId: 'a1',
    registrationId: 'reg',
    courseModuleId: 'mod',
    interactionIndex: 0,
    objectiveIds: [],
    correctPatterns: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('groupByAttempt', () => {
  test('is empty for no answers', () => {
    expect(groupByAttempt([])).toEqual([]);
  });

  test('numbers attempts in the order they first appear and keeps row order', () => {
    const groups = groupByAttempt([
      answer({ id: 'r1', attemptId: 'a1', interactionIndex: 0 }),
      answer({ id: 'r2', attemptId: 'a1', interactionIndex: 1 }),
      answer({ id: 'r3', attemptId: 'a2', courseModuleId: 'mod-2' }),
    ]);

    expect(groups.map((g) => [g.attemptNumber, g.attemptId])).toEqual([
      [1, 'a1'],
      [2, 'a2'],
    ]);
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(groups[1]?.courseModuleId).toBe('mod-2');
  });
});

describe('formatResult', () => {
  test('capitalises SCORM words, keeps numbers, dashes the missing', () => {
    expect(formatResult('correct')).toBe('Correct');
    expect(formatResult('unanticipated')).toBe('Unanticipated');
    expect(formatResult('7.5')).toBe('7.5');
    expect(formatResult(undefined)).toBe('—');
    expect(formatResult('')).toBe('—');
  });
});

describe('orDash and formatPatterns', () => {
  test('show a dash for nothing', () => {
    expect(orDash(undefined)).toBe('—');
    expect(orDash('')).toBe('—');
    expect(orDash('b')).toBe('b');
    expect(formatPatterns([])).toBe('—');
    expect(formatPatterns(['a', 'b'])).toBe('a | b');
  });
});

describe('tallyResults', () => {
  test('counts correct and wrong only', () => {
    expect(
      tallyResults([
        answer({ result: 'correct' }),
        answer({ result: 'correct' }),
        answer({ result: 'wrong' }),
        answer({ result: 'neutral' }),
        answer({ result: '3' }),
        answer({}),
      ]),
    ).toEqual({ correct: 2, wrong: 1 });
  });
});
