import { inject } from '@angular/core';
import type { Route } from '@angular/router';
import { AdminShellComponent } from './shell/admin-shell.component';
import { AdminPlaceholderScreenComponent } from './screens/placeholder-screen.component';
import {
  ADMIN_SCREEN_OVERRIDES,
  pickScreen,
  type AdminScreenId,
} from './screens/admin-screens';

const SCREENS: readonly { id: AdminScreenId; title: string }[] = [
  { id: 'packages', title: 'Packages' },
  { id: 'sections', title: 'Sections' },
  { id: 'enrolments', title: 'Enrolments' },
  { id: 'progress', title: 'Progress' },
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
      { path: '', pathMatch: 'full', redirectTo: SCREENS[0]?.id ?? 'packages' },
      ...SCREENS.map(({ id }): Route => ({
        path: id,
        loadComponent: () =>
          pickScreen(
            id,
            AdminPlaceholderScreenComponent,
            inject(ADMIN_SCREEN_OVERRIDES, { optional: true }) ?? undefined,
          ),
      })),
    ],
  },
];
