import { inject, type Type } from '@angular/core';
import type { Route } from '@angular/router';
import { AdminShellComponent } from './shell/admin-shell.component';
import { AdminPlaceholderScreenComponent } from './screens/placeholder-screen.component';
import {
  ADMIN_SCREEN_OVERRIDES,
  pickScreen,
  type AdminScreenId,
} from './screens/admin-screens';
import { ModuleTreeScreenComponent } from './screens/module-tree-screen.component';
import { PackagesScreenComponent } from './screens/packages-screen.component';
import { SectionsScreenComponent } from './screens/sections-screen.component';

interface ScreenRoute {
  id: AdminScreenId;
  path: string;
  title: string;
  builtIn: Type<unknown>;
}

/** The module tree comes first so `sections` does not shadow it. */
const SCREENS: readonly ScreenRoute[] = [
  {
    id: 'packages',
    path: 'packages',
    title: 'Packages',
    builtIn: PackagesScreenComponent,
  },
  {
    id: 'module-tree',
    path: 'sections/:sectionId/modules',
    title: 'Modules',
    builtIn: ModuleTreeScreenComponent,
  },
  {
    id: 'sections',
    path: 'sections',
    title: 'Sections',
    builtIn: SectionsScreenComponent,
  },
  {
    id: 'enrolments',
    path: 'enrolments',
    title: 'Enrolments',
    builtIn: AdminPlaceholderScreenComponent,
  },
  {
    id: 'progress',
    path: 'progress',
    title: 'Progress',
    builtIn: AdminPlaceholderScreenComponent,
  },
];

/**
 * Admin routes, mountable under any path of the host router:
 * `{ path: 'admin', children: reactiveLmsAdminRoutes }`.
 *
 * Each screen resolves through `ADMIN_SCREEN_OVERRIDES`, so a host can swap
 * one without redefining the route table.
 */
export const reactiveLmsAdminRoutes: Route[] = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'packages' },
      ...SCREENS.map(({ id, path, title, builtIn }): Route => ({
        path,
        pathMatch: 'full',
        data: { title },
        loadComponent: () =>
          pickScreen(
            id,
            builtIn,
            inject(ADMIN_SCREEN_OVERRIDES, { optional: true }) ?? undefined,
          ),
      })),
    ],
  },
];
