import { describe, expect, test } from 'bun:test';
import type { SectionRegistrationDto } from '@richardmcquiston01/reactive-lms-shared';
import {
  checkPersonId,
  countByStatus,
  formatDuration,
  formatScore,
  personChoiceLabel,
  rosterPersonLabel,
  statusLabel,
} from './roster';

function row(extra: Partial<SectionRegistrationDto>): SectionRegistrationDto {
  return {
    id: 'reg',
    personId: 'person-id',
    courseSectionId: 'sec',
    status: 'in_progress',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('rosterPersonLabel', () => {
  test('prefers name, then email, then external id, then person id', () => {
    expect(
      rosterPersonLabel(
        row({ displayName: 'Ada', email: 'a@x.test', externalId: 'e1' }),
      ),
    ).toBe('Ada');
    expect(
      rosterPersonLabel(row({ email: 'a@x.test', externalId: 'e1' })),
    ).toBe('a@x.test');
    expect(rosterPersonLabel(row({ externalId: 'e1' }))).toBe('e1');
    expect(rosterPersonLabel(row({}))).toBe('person-id');
  });

  test('an empty name falls through to the next field', () => {
    expect(rosterPersonLabel(row({ displayName: '', email: 'a@x.test' }))).toBe(
      'a@x.test',
    );
  });
});

describe('formatScore', () => {
  test('rounds to a whole percentage', () => {
    expect(formatScore(0.855)).toBe('86%');
    expect(formatScore(0)).toBe('0%');
    expect(formatScore(1)).toBe('100%');
  });

  test('shows a dash when there is no score', () => {
    expect(formatScore(undefined)).toBe('—');
    expect(formatScore(Number.NaN)).toBe('—');
  });
});

describe('formatDuration', () => {
  test('formats time-only ISO-8601 durations', () => {
    expect(formatDuration('PT1H5M3S')).toBe('1h 5m 3s');
    expect(formatDuration('PT45M')).toBe('45m');
    expect(formatDuration('PT12.4S')).toBe('12s');
  });

  test('leaves other values as they came and dashes a missing one', () => {
    expect(formatDuration('P1DT2H')).toBe('P1DT2H');
    expect(formatDuration('PT')).toBe('PT');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration('')).toBe('—');
  });
});

describe('countByStatus', () => {
  test('counts every status and includes zeros', () => {
    const counts = countByStatus([
      row({ status: 'passed' }),
      row({ status: 'passed' }),
      row({ status: 'failed' }),
    ]);
    expect(counts).toEqual({
      not_started: 0,
      in_progress: 0,
      completed: 0,
      passed: 2,
      failed: 1,
      waived: 0,
    });
  });
});

describe('statusLabel', () => {
  test('gives readable names', () => {
    expect(statusLabel('not_started')).toBe('Not started');
    expect(statusLabel('passed')).toBe('Passed');
  });
});

describe('checkPersonId', () => {
  test('accepts a UUID with surrounding spaces', () => {
    expect(checkPersonId('  123e4567-e89b-42d3-a456-426614174000 ')).toBeNull();
  });

  test('refuses blank and malformed ids with a descriptive message', () => {
    expect(checkPersonId('   ')).toContain('Enter the id');
    expect(checkPersonId('not-a-uuid')).toContain('UUID');
  });
});

describe('personChoiceLabel', () => {
  test('shows name and email together to tell namesakes apart', () => {
    expect(
      personChoiceLabel({
        id: 'p',
        displayName: 'Ada',
        email: 'ada@x.test',
        externalId: 'e1',
      }),
    ).toBe('Ada (ada@x.test)');
  });

  test('falls back to name, then email, then external id', () => {
    expect(
      personChoiceLabel({ id: 'p', displayName: 'Ada', externalId: 'e1' }),
    ).toBe('Ada');
    expect(
      personChoiceLabel({ id: 'p', email: 'ada@x.test', externalId: 'e1' }),
    ).toBe('ada@x.test');
    expect(personChoiceLabel({ id: 'p', externalId: 'e1' })).toBe('e1');
  });
});
