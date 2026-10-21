import { InjectionToken, type Type } from '@angular/core';

/** Ids of the screens the admin package defines. */
export type AdminScreenId = 'packages' | 'sections' | 'enrolments' | 'progress';

/**
 * Host replacements for built-in screens, keyed by {@link AdminScreenId}.
 */
export const ADMIN_SCREEN_OVERRIDES = new InjectionToken<
  Partial<Record<AdminScreenId, Type<unknown>>>
>('ADMIN_SCREEN_OVERRIDES');

/**
 * Picks the host's component for a screen when one is registered.
 *
 * @param id - Screen id
 * @param builtIn - Component shipped with the package
 * @param overrides - Host replacements, if any
 */
export function pickScreen(
  id: AdminScreenId,
  builtIn: Type<unknown>,
  overrides: Partial<Record<AdminScreenId, Type<unknown>>> | undefined,
): Type<unknown> {
  return overrides?.[id] ?? builtIn;
}
