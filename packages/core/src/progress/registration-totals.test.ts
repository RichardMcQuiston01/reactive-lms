import { describe, expect, test } from 'bun:test';
import {
  sectionDuration,
  sectionScore,
  type TotalsRow,
} from './registration-totals';

const row = (
  courseModuleId: string,
  scoreScaled?: string | null,
  totalTimeIso8601?: string | null,
): TotalsRow => ({ courseModuleId, scoreScaled, totalTimeIso8601 });

describe('sectionScore', () => {
  test('is the mean of the modules that have a score', () => {
    expect(
      sectionScore(['a', 'b', 'c'], [row('a', '0.8'), row('b', '0.6')]),
    ).toBeCloseTo(0.7, 10);
  });

  test("uses each module's best score when it has several rows", () => {
    expect(
      sectionScore(['a'], [row('a', '0.4'), row('a', '0.9'), row('a', '0.5')]),
    ).toBe(0.9);
  });

  test('ignores modules outside the section and unscored rows', () => {
    expect(
      sectionScore(['a'], [row('a', '0.5'), row('x', '1'), row('a', null)]),
    ).toBe(0.5);
  });

  test('is null when nothing has a score', () => {
    expect(sectionScore(['a', 'b'], [])).toBeNull();
    expect(sectionScore(['a'], [row('a'), row('a', 'abc')])).toBeNull();
  });

  test('a score of zero counts', () => {
    expect(sectionScore(['a', 'b'], [row('a', '0'), row('b', '1')])).toBe(0.5);
  });
});

describe('sectionDuration', () => {
  test('adds the time of every row in the section', () => {
    expect(
      sectionDuration(
        ['a', 'b'],
        [
          row('a', null, 'PT1H5M'),
          row('b', null, 'PT30S'),
          row('a', null, 'PT25M30S'),
        ],
      ),
    ).toBe('PT1H31M'); // 1:05:00 + 0:00:30 + 0:25:30
  });

  test('keeps fractions of a second and carries into minutes and hours', () => {
    expect(
      sectionDuration(
        ['a'],
        [row('a', null, 'PT59M59.5S'), row('a', null, 'PT0.5S')],
      ),
    ).toBe('PT1H');
    expect(sectionDuration(['a'], [row('a', null, 'PT12.34S')])).toBe(
      'PT12.34S',
    );
  });

  test('reads days', () => {
    expect(sectionDuration(['a'], [row('a', null, 'P1DT2H')])).toBe('PT26H');
  });

  test('skips rows outside the section, empty, or not a duration', () => {
    expect(
      sectionDuration(
        ['a'],
        [
          row('x', null, 'PT1H'),
          row('a', null, ''),
          row('a', null, 'soon'),
          row('a', null, 'PT'),
          row('a', null, 'P'),
        ],
      ),
    ).toBeNull();
  });

  test('is null when no time was reported', () => {
    expect(sectionDuration(['a'], [])).toBeNull();
  });

  test('reported zero time is PT0S, not missing', () => {
    expect(sectionDuration(['a'], [row('a', null, 'PT0S')])).toBe('PT0S');
  });
});
