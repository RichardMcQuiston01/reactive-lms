import { Component, inject, signal, type OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CourseSectionDto } from '@richardmcquiston01/reactive-lms-shared';
import { CatalogAdminService } from '../modules/catalog-admin.service';
import {
  ADMIN_PAGE_SIZE,
  firstPage,
  hasMorePages,
  mergePage,
} from '../modules/paging';

/**
 * Lists course sections and opens one's module tree. A host can replace this
 * screen with its own section picker through `ADMIN_SCREEN_OVERRIDES`.
 */
@Component({
  selector: 'rlms-admin-sections',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h2>Sections</h2>
    @if (error()) {
      <p role="alert" style="color: var(--rlms-admin-danger-color, #b00020)">
        {{ error() }}
      </p>
    }
    @if (loading()) {
      <p>Loading…</p>
    } @else if (sections().length === 0) {
      <p>No sections yet.</p>
    } @else {
      <ul>
        @for (section of sections(); track section.id) {
          <li>
            <a [routerLink]="[section.id, 'modules']">{{ section.title }}</a>
          </li>
        }
      </ul>
      @if (hasMore()) {
        <button type="button" [disabled]="loadingMore()" (click)="loadMore()">
          {{ loadingMore() ? 'Loading…' : 'Load more' }}
        </button>
      }
    }

    <form (submit)="open($event, sectionId)">
      <input #sectionId placeholder="Section id" aria-label="Section id" />
      <button type="submit">Open by id</button>
    </form>
  `,
})
export class SectionsScreenComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(CatalogAdminService);

  readonly sections = signal<CourseSectionDto[]>([]);
  readonly loading = signal<boolean>(true);
  readonly loadingMore = signal<boolean>(false);
  readonly hasMore = signal<boolean>(false);
  readonly error = signal<string>('');
  /** Rows fetched so far, which is where the next page starts. */
  private fetched = 0;

  async ngOnInit(): Promise<void> {
    try {
      const page = await this.catalog.listSections(firstPage());
      this.sections.set(page);
      this.fetched = page.length;
      this.hasMore.set(hasMorePages(page.length));
    } catch (failure) {
      this.error.set(
        failure instanceof Error
          ? `Could not load sections: ${failure.message}`
          : 'Could not load sections.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  /** Fetches the next page and adds it below the sections already shown. */
  async loadMore(): Promise<void> {
    this.loadingMore.set(true);
    this.error.set('');
    try {
      const page = await this.catalog.listSections({
        limit: ADMIN_PAGE_SIZE,
        offset: this.fetched,
      });
      this.sections.set(mergePage(this.sections(), page));
      this.fetched += page.length;
      this.hasMore.set(hasMorePages(page.length));
    } catch (failure) {
      this.error.set(
        failure instanceof Error
          ? `Could not load more sections: ${failure.message}`
          : 'Could not load more sections.',
      );
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** Opens a section typed in by id, for lists longer than one page. */
  open(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const id = input.value.trim();
    if (id !== '') {
      void this.router.navigate([id, 'modules'], { relativeTo: this.route });
    }
  }
}
