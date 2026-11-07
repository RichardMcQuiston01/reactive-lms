import { Component, inject, signal, type OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  RegistrationStatus,
  SectionRegistrationDto,
} from '@richardmcquiston01/reactive-lms-shared';
import { LatestOnly } from '../modules/latest-only';
import {
  ADMIN_PAGE_SIZE,
  firstPage,
  hasMorePages,
  mergePage,
} from '../modules/paging';
import {
  REGISTRATION_STATUSES,
  countByStatus,
  formatDuration,
  formatScore,
  rosterPersonLabel,
  statusLabel,
} from '../modules/roster';
import { RosterAdminService } from '../modules/roster-admin.service';

/**
 * Basic progress view for one section: a count per status and each person's
 * status, score, and time. The counts cover the rows loaded so far, so on a
 * long roster they grow as more pages are loaded.
 */
@Component({
  selector: 'rlms-admin-progress',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h2>Progress</h2>
    <p>
      <a [routerLink]="['../../../sections']">All sections</a>
    </p>
    @if (error()) {
      <p role="alert" style="color: var(--rlms-admin-danger-color, #b00020)">
        {{ error() }}
      </p>
    }
    @if (loading()) {
      <p>Loading…</p>
    } @else if (roster().length === 0) {
      <p>Nobody is enrolled on this section yet.</p>
    } @else {
      <ul aria-label="Status counts">
        @for (status of statuses; track status) {
          <li>{{ statusText(status) }}: {{ counts()[status] }}</li>
        }
      </ul>
      @if (hasMore()) {
        <p>Counts cover the {{ roster().length }} people loaded so far.</p>
      }
      <table>
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Status</th>
            <th scope="col">Score</th>
            <th scope="col">Time</th>
            <th scope="col">Answers</th>
          </tr>
        </thead>
        <tbody>
          @for (row of roster(); track row.id) {
            <tr>
              <td>{{ label(row) }}</td>
              <td>{{ statusText(row.status) }}</td>
              <td>{{ score(row) }}</td>
              <td>{{ time(row) }}</td>
              <td>
                <a [routerLink]="[row.id, 'answers']">Answers</a>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (hasMore()) {
        <button type="button" [disabled]="loadingMore()" (click)="loadMore()">
          {{ loadingMore() ? 'Loading…' : 'Load more' }}
        </button>
      }
    }
    <button type="button" [disabled]="loading()" (click)="refresh()">
      Refresh
    </button>
  `,
})
export class ProgressScreenComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly rosterService = inject(RosterAdminService);

  readonly sectionId: string =
    this.route.snapshot.paramMap.get('sectionId') ?? '';
  readonly statuses: readonly RegistrationStatus[] = REGISTRATION_STATUSES;
  readonly roster = signal<SectionRegistrationDto[]>([]);
  readonly counts = signal<Record<RegistrationStatus, number>>(
    countByStatus([]),
  );
  readonly loading = signal<boolean>(true);
  readonly loadingMore = signal<boolean>(false);
  readonly hasMore = signal<boolean>(false);
  readonly error = signal<string>('');
  /** Rows fetched so far, which is where the next page starts. */
  private fetched = 0;
  private readonly lists = new LatestOnly();

  ngOnInit(): Promise<void> {
    return this.reload();
  }

  label(row: SectionRegistrationDto): string {
    return rosterPersonLabel(row);
  }

  statusText(status: RegistrationStatus): string {
    return statusLabel(status);
  }

  score(row: SectionRegistrationDto): string {
    return formatScore(row.scoreScaled);
  }

  time(row: SectionRegistrationDto): string {
    return formatDuration(row.durationIso8601);
  }

  /** Loads the first page again to pick up progress made since. */
  refresh(): Promise<void> {
    this.error.set('');
    return this.reload();
  }

  /** Fetches the next page and adds it below the people already shown. */
  loadMore(): Promise<void> {
    this.loadingMore.set(true);
    return this.lists.load(
      () =>
        this.rosterService.listRoster(this.sectionId, {
          limit: ADMIN_PAGE_SIZE,
          offset: this.fetched,
        }),
      {
        onData: (page) => {
          this.setRoster(mergePage(this.roster(), page));
          this.fetched += page.length;
          this.hasMore.set(hasMorePages(page.length));
        },
        onFailure: (failure) =>
          this.error.set(
            failure instanceof Error
              ? `Could not load more people: ${failure.message}`
              : 'Could not load more people.',
          ),
        onSettled: () => this.loadingMore.set(false),
      },
    );
  }

  private setRoster(rows: SectionRegistrationDto[]): void {
    this.roster.set(rows);
    this.counts.set(countByStatus(rows));
  }

  private reload(): Promise<void> {
    this.loading.set(true);
    return this.lists.load(
      () => this.rosterService.listRoster(this.sectionId, firstPage()),
      {
        onData: (page) => {
          this.setRoster(page);
          this.fetched = page.length;
          this.hasMore.set(hasMorePages(page.length));
        },
        onFailure: (failure) =>
          this.error.set(
            failure instanceof Error
              ? `Could not load progress: ${failure.message}`
              : 'Could not load progress.',
          ),
        onSettled: () => {
          this.loading.set(false);
          this.loadingMore.set(false);
        },
      },
    );
  }
}
