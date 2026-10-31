import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  ADMIN_CAPABILITY_CHECK,
  ADMIN_NAV_ITEMS,
  DEFAULT_ADMIN_NAV_ITEMS,
  resolveNavItems,
  type AdminNavItem,
} from '../navigation/admin-navigation';

/**
 * Admin frame: navigation plus a router outlet.
 *
 * Styling uses only CSS custom properties (`--rlms-admin-*`) with neutral
 * fallbacks, so a host themes it without overriding component CSS. Hosts can
 * project content into the `[rlmsAdminHeader]` and `[rlmsAdminFooter]` slots.
 */
@Component({
  selector: 'rlms-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  styles: [
    `
      :host {
        display: grid;
        grid-template-columns: var(--rlms-admin-nav-width, 14rem) 1fr;
        grid-template-rows: auto 1fr auto;
        min-height: var(--rlms-admin-min-height, 100%);
        color: var(--rlms-admin-color, inherit);
        background: var(--rlms-admin-background, transparent);
        font-family: var(--rlms-admin-font-family, inherit);
      }
      header,
      footer {
        grid-column: 1 / -1;
      }
      nav {
        padding: var(--rlms-admin-gap, 1rem);
        border-right: 1px solid var(--rlms-admin-border-color, #d0d0d0);
      }
      nav a {
        display: block;
        padding: 0.4rem 0;
        color: var(--rlms-admin-link-color, inherit);
      }
      nav a.active {
        color: var(--rlms-admin-accent-color, inherit);
        font-weight: 600;
      }
      main {
        padding: var(--rlms-admin-gap, 1rem);
      }
    `,
  ],
  template: `
    <header><ng-content select="[rlmsAdminHeader]" /></header>
    <nav aria-label="Administration">
      <a
        *ngFor="let item of navItems"
        [routerLink]="item.path"
        routerLinkActive="active"
        >{{ item.label }}</a
      >
    </nav>
    <main><router-outlet /></main>
    <footer><ng-content select="[rlmsAdminFooter]" /></footer>
  `,
})
export class AdminShellComponent {
  readonly navItems: AdminNavItem[] = resolveNavItems(
    DEFAULT_ADMIN_NAV_ITEMS,
    inject(ADMIN_NAV_ITEMS, { optional: true }) ?? [],
    inject(ADMIN_CAPABILITY_CHECK, { optional: true }) ?? undefined,
  );
}
