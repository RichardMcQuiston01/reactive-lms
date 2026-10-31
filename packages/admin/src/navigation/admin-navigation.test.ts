import { describe, expect, test } from 'bun:test';
import { DEFAULT_ADMIN_NAV_ITEMS, resolveNavItems } from './admin-navigation';

describe('resolveNavItems', () => {
  test('shows every default item when no capability check is given', () => {
    const ids = resolveNavItems(DEFAULT_ADMIN_NAV_ITEMS, [], undefined).map(
      (item) => item.id,
    );
    expect(ids).toEqual(['packages', 'sections', 'enrolments', 'progress']);
  });

  test('hides items whose action is not allowed', () => {
    const items = resolveNavItems(
      DEFAULT_ADMIN_NAV_ITEMS,
      [],
      (action) => action !== 'report.view',
    );
    expect(items.map((item) => item.id)).not.toContain('progress');
  });

  test('host items replace by id and sort by order', () => {
    const items = resolveNavItems(
      DEFAULT_ADMIN_NAV_ITEMS,
      [
        { id: 'progress', label: 'Reports', path: 'reports', order: 5 },
        { id: 'billing', label: 'Billing', path: 'billing' },
      ],
      undefined,
    );
    expect(items.map((item) => item.id)).toEqual([
      'progress',
      'packages',
      'sections',
      'enrolments',
      'billing',
    ]);
    expect(items[0]?.label).toBe('Reports');
  });
});
