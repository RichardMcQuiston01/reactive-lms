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
export { ModuleAdminService } from './modules/module-admin.service';
export {
  buildModuleTree,
  describeAvailability,
  flattenModuleTree,
  parentChoices,
  planSiblingMove,
  type ModuleTreeNode,
  type SortOrderPatch,
} from './modules/module-tree';
export { ModuleTreeScreenComponent } from './screens/module-tree-screen.component';
export { SectionsScreenComponent } from './screens/sections-screen.component';
