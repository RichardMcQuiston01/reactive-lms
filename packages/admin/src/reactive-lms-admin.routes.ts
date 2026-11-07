import { inject, type Type } from '@angular/core';
import type { Route } from '@angular/router';
import { AdminShellComponent } from './shell/admin-shell.component';
import {
  ADMIN_SCREEN_OVERRIDES,
  pickScreen,
  type AdminScreenId,
} from './screens/admin-screens';
import { EnrolmentsScreenComponent } from './screens/enrolments-screen.component';
import { AnswersScreenComponent } from './screens/answers-screen.component';
import { ProgressScreenComponent } from './screens/progress-screen.component';
import { ModuleTreeScreenComponent } from './screens/module-tree-screen.component';
import { PackagesScreenComponent } from './screens/packages-screen.component';
import { SectionsScreenComponent } from './screens/sections-screen.component';

interface ScreenRoute {
  id: AdminScreenId;
  path: string;
  title: string;
  builtIn: Type<unknown>;
  /** Extra route data, such as which screen a section picker opens. */
  data?: Record<string, string>;
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
    id: 'section-enrolments',
    path: 'sections/:sectionId/enrolments',
    title: 'Enrolments',
    builtIn: EnrolmentsScreenComponent,
  },
  {
    id: 'section-progress',
    path: 'sections/:sectionId/progress',
    title: 'Progress',
    builtIn: ProgressScreenComponent,
  },
  {
    id: 'registration-answers',
    path: 'sections/:sectionId/progress/:registrationId/answers',
    title: 'Answers',
    builtIn: AnswersScreenComponent,
  },
  {
    id: 'enrolments',
    path: 'enrolments',
    title: 'Enrolments',
    builtIn: SectionsScreenComponent,
    data: { target: 'enrolments' },
  },
  {
    id: 'progress',
    path: 'progress',
    title: 'Progress',
    builtIn: SectionsScreenComponent,
    data: { target: 'progress' },
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
      ...SCREENS.map(({ id, path, title, builtIn, data }): Route => ({
        path,
        pathMatch: 'full',
        data: { title, ...data },
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
