import { Component, inject, signal, type OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { SectionRegistrationDto } from '@richardmcquiston01/reactive-lms-shared';
import { LatestOnly } from '../modules/latest-only';
import {
  ADMIN_PAGE_SIZE,
  firstPage,
  hasMorePages,
  mergePage,
} from '../modules/paging';
import {
  checkPersonId,
  rosterPersonLabel,
  statusLabel,
} from '../modules/roster';
import {
  RosterAdminService,
  type EnrolMethod,
} from '../modules/roster-admin.service';

/**
 * Enrolment screen for one section: shows who is registered and enrols a
 * person by id. The server decides who may enrol and refuses duplicates or
 * missing enrolment methods; its message is shown as is.
 */
@Component({
  selector: 'rlms-admin-enrolments',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h2>Enrolments</h2>
    <p>
      <a [routerLink]="['../../../sections']">All sections</a>
    </p>
    <form (submit)="enrol($event, personInput, methodSelect)">
      <input
        #personInput
        placeholder="Person id"
        aria-label="Person id"
        [disabled]="enrolling()"
      />
      <select #methodSelect aria-label="Enrolment method">
        <option value="manual">Manual</option>
        <option value="group">Group</option>
      </select>
      <button type="submit" [disabled]="enrolling() || loading()">
        {{ enrolling() ? 'Enrolling…' : 'Enrol' }}
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
    } @else if (roster().length === 0) {
      <p>Nobody is enrolled on this section yet.</p>
    } @else {
      <table>
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Status</th>
            <th scope="col">Enrolled</th>
          </tr>
        </thead>
        <tbody>
          @for (row of roster(); track row.id) {
            <tr>
              <td>{{ label(row) }}</td>
              <td>{{ statusText(row) }}</td>
              <td>{{ row.createdAt }}</td>
            </tr>
          }
        </tbody>
      </table>
      @if (hasMore()) {
        <button
          type="button"
          [disabled]="loadingMore() || enrolling()"
          (click)="loadMore()"
        >
          {{ loadingMore() ? 'Loading…' : 'Load more' }}
        </button>
      }
    }
  `,
})
export class EnrolmentsScreenComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly rosterService = inject(RosterAdminService);

  readonly sectionId: string =
    this.route.snapshot.paramMap.get('sectionId') ?? '';
  readonly roster = signal<SectionRegistrationDto[]>([]);
  readonly loading = signal<boolean>(true);
  readonly loadingMore = signal<boolean>(false);
  readonly enrolling = signal<boolean>(false);
  readonly hasMore = signal<boolean>(false);
  readonly error = signal<string>('');
  readonly notice = signal<string>('');
  /** Rows fetched so far, which is where the next page starts. */
  private fetched = 0;
  private readonly lists = new LatestOnly();

  ngOnInit(): Promise<void> {
    return this.reload();
  }

  label(row: SectionRegistrationDto): string {
    return rosterPersonLabel(row);
  }

  statusText(row: SectionRegistrationDto): string {
    return statusLabel(row.status);
  }

  /**
   * Enrols the typed person, then reloads the roster. A refused enrolment
   * keeps the server's message on screen and leaves the typed id in place.
   */
  async enrol(
    event: Event,
    personInput: HTMLInputElement,
    methodSelect: HTMLSelectElement,
  ): Promise<void> {
    event.preventDefault();
    this.error.set('');
    this.notice.set('');
    const problem = checkPersonId(personInput.value);
    if (problem !== null) {
      this.error.set(problem);
      return;
    }
    const method: EnrolMethod =
      methodSelect.value === 'group' ? 'group' : 'manual';
    this.enrolling.set(true);
    try {
      await this.rosterService.enrol(
        this.sectionId,
        personInput.value.trim(),
        method,
      );
      this.notice.set('Person enrolled.');
      personInput.value = '';
      await this.reload();
    } catch (failure) {
      this.error.set(
        failure instanceof Error
          ? `Could not enrol: ${failure.message}`
          : 'Could not enrol for an unknown reason.',
      );
    } finally {
      this.enrolling.set(false);
    }
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
          this.roster.set(mergePage(this.roster(), page));
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

  /** Loads the first page again, such as after an enrolment. */
  private reload(): Promise<void> {
    return this.lists.load(
      () => this.rosterService.listRoster(this.sectionId, firstPage()),
      {
        onData: (page) => {
          this.roster.set(page);
          this.fetched = page.length;
          this.hasMore.set(hasMorePages(page.length));
        },
        onFailure: (failure) =>
          this.error.set(
            failure instanceof Error
              ? `Could not load the roster: ${failure.message}`
              : 'Could not load the roster.',
          ),
        onSettled: () => {
          this.loading.set(false);
          this.loadingMore.set(false);
        },
      },
    );
  }
}
