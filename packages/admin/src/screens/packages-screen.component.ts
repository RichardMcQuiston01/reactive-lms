import { Component, inject, signal, type OnInit } from '@angular/core';
import type { ContentPackageDto } from '@richardmcquiston01/reactive-lms-shared';
import { CatalogAdminService } from '../modules/catalog-admin.service';
import { LatestOnly } from '../modules/latest-only';
import { checkPackageFile } from '../modules/package-upload';

/**
 * Lists imported content packages and imports a new one from a ZIP archive.
 * The server detects the package type and rejects anything it cannot import;
 * its message is shown as is.
 */
@Component({
  selector: 'rlms-admin-packages',
  standalone: true,
  template: `
    <h2>Packages</h2>
    <form (submit)="upload($event, fileInput)">
      <input
        #fileInput
        type="file"
        accept=".zip,application/zip"
        aria-label="Package ZIP"
        [disabled]="uploading() || loading()"
      />
      <button type="submit" [disabled]="uploading() || loading()">
        {{ uploading() ? 'Importing…' : 'Import package' }}
      </button>
    </form>
    @if (notice()) {
      <p role="status">{{ notice() }}</p>
    }
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
  readonly notice = signal<string>('');
  readonly uploading = signal<boolean>(false);
  private readonly lists = new LatestOnly();

  ngOnInit(): Promise<void> {
    return this.reload();
  }

  /**
   * Sends the chosen archive, then reloads the list. A refused import keeps
   * the server's message on screen and leaves the chosen file in place.
   */
  async upload(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    this.error.set('');
    this.notice.set('');
    const file = input.files?.item(0) ?? null;
    if (file === null) {
      this.error.set('Choose a ZIP file to import.');
      return;
    }
    const problem = checkPackageFile(file.name, file.size);
    if (problem !== null) {
      this.error.set(problem);
      return;
    }
    this.uploading.set(true);
    try {
      const result = await this.catalog.importPackage(file);
      this.notice.set(`Imported "${file.name}" as ${result.packageType}.`);
      input.value = '';
      await this.reload();
    } catch (failure) {
      this.error.set(
        failure instanceof Error
          ? `Import failed: ${failure.message}`
          : 'Import failed for an unknown reason.',
      );
    } finally {
      this.uploading.set(false);
    }
  }

  private reload(): Promise<void> {
    return this.lists.load(() => this.catalog.listPackages(), {
      onData: (packages) => this.packages.set(packages),
      onFailure: (failure) =>
        this.error.set(
          failure instanceof Error
            ? `Could not load packages: ${failure.message}`
            : 'Could not load packages.',
        ),
      onSettled: () => this.loading.set(false),
    });
  }
}
