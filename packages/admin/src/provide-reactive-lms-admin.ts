import type { Provider, Type } from '@angular/core';
import {
  REACTIVE_LMS_CONFIG,
  type ReactiveLmsConfig,
} from '@richardmcquiston01/reactive-lms-player';
import type { AdminApiClient } from './api/admin-api-client';
import { createAdminApiClient } from './api/default-admin-api-client';
import { ADMIN_API_CLIENT } from './api/admin-api-client.token';
import {
  ADMIN_CAPABILITY_CHECK,
  ADMIN_NAV_ITEMS,
  type AdminCapabilityCheck,
  type AdminNavItem,
} from './navigation/admin-navigation';
import {
  ADMIN_SCREEN_OVERRIDES,
  type AdminScreenId,
} from './screens/admin-screens';

/**
 * Host options for the admin package. Every field is optional.
 */
export interface ReactiveLmsAdminOptions {
  /** Replaces the default HTTP client (build one with `wrapAdminApiClient`). */
  apiClient?: AdminApiClient;
  /** Extra or replacement navigation items. */
  navItems?: readonly AdminNavItem[];
  /** Hides navigation the user cannot use. */
  capabilityCheck?: AdminCapabilityCheck;
  /** Replacement components for built-in screens. */
  screens?: Partial<Record<AdminScreenId, Type<unknown>>>;
}

/**
 * Registers the admin package. Pair it with `provideReactiveLms` from the
 * player so both share one API configuration.
 *
 * @param options - Extension points; omit for defaults
 */
export function provideReactiveLmsAdmin(
  options: ReactiveLmsAdminOptions = {},
): Provider[] {
  const providers: Provider[] = [
    options.apiClient
      ? { provide: ADMIN_API_CLIENT, useValue: options.apiClient }
      : {
          provide: ADMIN_API_CLIENT,
          useFactory: (config: ReactiveLmsConfig): AdminApiClient =>
            createAdminApiClient(config),
          deps: [REACTIVE_LMS_CONFIG],
        },
  ];
  if (options.navItems) {
    providers.push({ provide: ADMIN_NAV_ITEMS, useValue: options.navItems });
  }
  if (options.capabilityCheck) {
    providers.push({
      provide: ADMIN_CAPABILITY_CHECK,
      useValue: options.capabilityCheck,
    });
  }
  if (options.screens) {
    providers.push({
      provide: ADMIN_SCREEN_OVERRIDES,
      useValue: options.screens,
    });
  }
  return providers;
}
