import { Component, inject, signal, type OnInit } from '@angular/core';
import type { ContentPackageDto } from '@richardmcquiston01/reactive-lms-shared';
import { CatalogAdminService } from '../modules/catalog-admin.service';

/**
 * Lists imported content packages. Upload arrives in a later release.
 */
@Component({
  selector: 'rlms-admin-packages',
  standalone: true,
  template: `
    <h2>Packages</h2>
    @if (error()) {
      <p role="alert" style="color: var(--rlms-admin-danger-color, #b00020)">
        {{ error() }}
      </p>
    }
    @if (loading()) {
      <p>Loading…</p>
    } @else if (packages().length === 0) {
      <p>No packages imported yet.</p>
    } @else {
      <table>
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Type</th>
            <th scope="col">Version</th>
            <th scope="col">Imported</th>
          </tr>
        </thead>
        <tbody>
          @for (item of packages(); track item.id) {
            <tr>
              <td>{{ item.title }}</td>
              <td>{{ item.packageType }}</td>
              <td>{{ item.version ?? '' }}</td>
              <td>{{ item.createdAt }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class PackagesScreenComponent implements OnInit {
  private readonly catalog = inject(CatalogAdminService);

  readonly packages = signal<ContentPackageDto[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');

  async ngOnInit(): Promise<void> {
    try {
      this.packages.set(await this.catalog.listPackages());
    } catch (failure) {
      this.error.set(
        failure instanceof Error
          ? `Could not load packages: ${failure.message}`
          : 'Could not load packages.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
