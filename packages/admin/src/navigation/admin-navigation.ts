import { InjectionToken } from '@angular/core';
import type { LmsAction } from '@richardmcquiston01/reactive-lms-shared';

/**
 * One entry in the admin navigation.
 */
export interface AdminNavItem {
  /** Stable id; also the key a host uses to replace the screen. */
  id: string;
  /** Visible label. */
  label: string;
  /** Route path relative to the admin root. */
  path: string;
  /** Hidden unless the host allows this action (see {@link AdminCapabilityCheck}). */
  requiredAction?: LmsAction;
  /** Sort position; lower comes first. Defaults to 100. */
  order?: number;
}

/**
 * Decides whether the current user may see something that needs `action`.
 * The server still enforces every action; this only hides unusable links.
 */
export type AdminCapabilityCheck = (action: LmsAction) => boolean;

/**
 * Extra or replacement navigation items contributed by the host.
 * Items sharing an `id` replace the built-in item.
 */
export const ADMIN_NAV_ITEMS = new InjectionToken<readonly AdminNavItem[]>(
  'ADMIN_NAV_ITEMS',
);

/**
 * Optional visibility check; when absent every item is shown.
 */
export const ADMIN_CAPABILITY_CHECK = new InjectionToken<AdminCapabilityCheck>(
  'ADMIN_CAPABILITY_CHECK',
);

/** Navigation shipped with the admin package. */
export const DEFAULT_ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    id: 'packages',
    label: 'Packages',
    path: 'packages',
    order: 10,
    requiredAction: 'package.import',
  },
  {
    id: 'sections',
    label: 'Sections',
    path: 'sections',
    order: 20,
    requiredAction: 'section.manage',
  },
  {
    id: 'enrolments',
    label: 'Enrolments',
    path: 'enrolments',
    order: 30,
    requiredAction: 'enrol.manage',
  },
  {
    id: 'progress',
    label: 'Progress',
    path: 'progress',
    order: 40,
    requiredAction: 'report.view',
  },
];

/**
 * Merges host items over the defaults, hides what the user may not use, and
 * sorts the result.
 *
 * @param defaults - Built-in items
 * @param hostItems - Host additions and replacements
 * @param canDo - Visibility check; `undefined` shows everything
 * @returns Items to render, in order
 */
export function resolveNavItems(
  defaults: readonly AdminNavItem[],
  hostItems: readonly AdminNavItem[],
  canDo: AdminCapabilityCheck | undefined,
): AdminNavItem[] {
  const merged = new Map<string, AdminNavItem>();
  for (const item of [...defaults, ...hostItems]) {
    merged.set(item.id, item);
  }
  return [...merged.values()]
    .filter(
      (item) =>
        item.requiredAction === undefined ||
        canDo === undefined ||
        canDo(item.requiredAction),
    )
    .sort((left, right) => (left.order ?? 100) - (right.order ?? 100));
}
