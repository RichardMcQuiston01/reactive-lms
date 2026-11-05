import { describe, expect, test } from 'bun:test';
import {
  ADMIN_PAGE_SIZE,
  firstPage,
  hasMorePages,
  mergePage,
  pageQuery,
} from './paging';

describe('pageQuery', () => {
  test('asks for a page', () => {
    expect(pageQuery({ limit: 100, offset: 200 })).toBe(
      '?limit=100&offset=200',
    );
  });

  test('keeps extra parameters and drops empty ones', () => {
    expect(
      pageQuery(firstPage(), {
        courseOfferingId: 'o 1',
        skipped: undefined,
        blank: '',
      }),
    ).toBe('?courseOfferingId=o+1&limit=100&offset=0');
  });
});

describe('pageQuery with typed search text', () => {
  test('sends reserved characters intact so the server sees what was typed', () => {
    const query = pageQuery({ limit: 20, offset: 0 }, { search: 'a&b=c 100%' });
    expect(new URLSearchParams(query).get('search')).toBe('a&b=c 100%');
  });

  test('an empty search is left out, which lists everyone', () => {
    expect(pageQuery({ limit: 20, offset: 0 }, { search: '' })).toBe(
      '?limit=20&offset=0',
    );
  });
});

describe('hasMorePages', () => {
  test('a full page may be followed by another; a short one is the last', () => {
    expect(hasMorePages(ADMIN_PAGE_SIZE)).toBe(true);
    expect(hasMorePages(ADMIN_PAGE_SIZE - 1)).toBe(false);
    expect(hasMorePages(0)).toBe(false);
    expect(hasMorePages(5, 5)).toBe(true);
  });
});

describe('mergePage', () => {
  const rows = (...ids: string[]): Array<{ id: string }> =>
    ids.map((id) => ({ id }));

  test('appends a new page in order', () => {
    expect(
      mergePage(rows('a', 'b'), rows('c', 'd')).map((row) => row.id),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  test('skips a row the previous page already showed', () => {
    // A newer row was inserted at the top between requests, so row "b"
    // moved down onto the next page and now appears twice.
    expect(
      mergePage(rows('a', 'b'), rows('b', 'c')).map((row) => row.id),
    ).toEqual(['a', 'b', 'c']);
  });

  test('does not change what it was given', () => {
    const current = rows('a');
    mergePage(current, rows('b'));
    expect(current).toEqual(rows('a'));
  });
});
