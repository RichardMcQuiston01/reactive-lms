import type { InteractionResponseDto } from '@richardmcquiston01/reactive-lms-shared';

/** The answers one attempt (launch) reported. */
export interface AttemptAnswers {
  attemptId: string;
  /** 1-based position of the attempt among those that reported answers. */
  attemptNumber: number;
  courseModuleId: string;
  rows: InteractionResponseDto[];
}

/**
 * Groups answers by attempt, keeping the order they arrive in (oldest attempt
 * first, and the SCO's own order within one).
 *
 * @param rows - Answers as the API returns them
 */
export function groupByAttempt(
  rows: readonly InteractionResponseDto[],
): AttemptAnswers[] {
  const groups = new Map<string, AttemptAnswers>();
  for (const row of rows) {
    let group = groups.get(row.attemptId);
    if (group === undefined) {
      group = {
        attemptId: row.attemptId,
        attemptNumber: groups.size + 1,
        courseModuleId: row.courseModuleId,
        rows: [],
      };
      groups.set(row.attemptId, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

/**
 * Readable result: the SCORM words capitalised, a number as given, and a dash
 * when the SCO reported none.
 *
 * @param result - `cmi.interactions.n.result`
 */
export function formatResult(result: string | undefined): string {
  if (!result) {
    return '—';
  }
  return /^[a-z]+$/.test(result)
    ? result.charAt(0).toUpperCase() + result.slice(1)
    : result;
}

/**
 * Text, or a dash when the SCO reported none.
 *
 * @param value - Any reported value
 */
export function orDash(value: string | undefined): string {
  return value === undefined || value === '' ? '—' : value;
}

/**
 * Accepted answers joined for one table cell, or a dash when none were given.
 *
 * @param patterns - `correct_responses.m.pattern` values
 */
export function formatPatterns(patterns: readonly string[]): string {
  return patterns.length === 0 ? '—' : patterns.join(' | ');
}

/**
 * How many answers were marked correct, among those with a verdict. Numeric
 * results and answers with no result are not counted either way.
 *
 * @param rows - Answers to tally
 */
export function tallyResults(rows: readonly InteractionResponseDto[]): {
  correct: number;
  wrong: number;
} {
  let correct = 0;
  let wrong = 0;
  for (const row of rows) {
    if (row.result === 'correct') correct += 1;
    else if (row.result === 'wrong') wrong += 1;
  }
  return { correct, wrong };
}
