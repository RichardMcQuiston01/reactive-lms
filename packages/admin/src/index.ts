export {
  wrapAdminApiClient,
  type AdminApiClient,
} from './api/admin-api-client';
export { createAdminApiClient } from './api/default-admin-api-client';
export { ADMIN_API_CLIENT } from './api/admin-api-client.token';
export {
  ADMIN_CAPABILITY_CHECK,
  ADMIN_NAV_ITEMS,
  DEFAULT_ADMIN_NAV_ITEMS,
  resolveNavItems,
  type AdminCapabilityCheck,
  type AdminNavItem,
} from './navigation/admin-navigation';
export {
  provideReactiveLmsAdmin,
  type ReactiveLmsAdminOptions,
} from './provide-reactive-lms-admin';
export { reactiveLmsAdminRoutes } from './reactive-lms-admin.routes';
export {
  ADMIN_SCREEN_OVERRIDES,
  pickScreen,
  type AdminScreenId,
} from './screens/admin-screens';
export { AdminShellComponent } from './shell/admin-shell.component';
