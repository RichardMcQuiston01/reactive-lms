import { InjectionToken } from '@angular/core';
import type { AdminApiClient } from './admin-api-client';

/**
 * DI token holding the {@link AdminApiClient} the screens use.
 */
export const ADMIN_API_CLIENT = new InjectionToken<AdminApiClient>(
  'ADMIN_API_CLIENT',
);
