/** Rows requested per page by the admin lists. */
export const ADMIN_PAGE_SIZE = 100;

/**
 * One page of a list request.
 */
export interface PageRequest {
  /** Rows to ask for. */
  limit: number;
  /** Rows to skip: how many the screen has already fetched. */
  offset: number;
}

/**
 * The first page.
 */
export function firstPage(): PageRequest {
  return { limit: ADMIN_PAGE_SIZE, offset: 0 };
}

/**
 * Query string for a page, plus any extra parameters.
 *
 * @param page - Rows to ask for and to skip
 * @param extra - Further parameters; empty values are left out
 * @returns For example `?limit=100&offset=0`
 */
export function pageQuery(
  page: PageRequest,
  extra: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) {
    if (value) {
      params.set(key, value);
    }
  }
  params.set('limit', String(page.limit));
  params.set('offset', String(page.offset));
  return `?${params.toString()}`;
}

/**
 * True when a page came back full, so another page may exist. A short page is
 * the last one.
 *
 * @param rowsReturned - Rows in the page just fetched
 * @param pageSize - Rows that were asked for
 */
export function hasMorePages(
  rowsReturned: number,
  pageSize: number = ADMIN_PAGE_SIZE,
): boolean {
  return rowsReturned >= pageSize;
}

/**
 * Appends a page to what is already shown, skipping rows already present.
 *
 * Lists are ordered by something that can change between requests (packages
 * newest first, so an import in the meantime pushes every row down one), so
 * the next page can repeat a row the previous page ended on.
 *
 * @param current - Rows already shown, in order
 * @param page - The page just fetched
 */
export function mergePage<T extends { id: string }>(
  current: readonly T[],
  page: readonly T[],
): T[] {
  const seen = new Set(current.map((row) => row.id));
  return [...current, ...page.filter((row) => !seen.has(row.id))];
}
