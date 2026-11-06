import { Component, inject, signal, type OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  PersonSummaryDto,
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
  checkPersonId,
  personChoiceLabel,
  rosterPersonLabel,
  statusLabel,
} from '../modules/roster';
import {
  RosterAdminService,
  type EnrolMethod,
} from '../modules/roster-admin.service';

/** People shown per search page; a picker list stays short. */
const PICKER_PAGE_SIZE = 20;

/**
 * Enrolment screen for one section: shows who is registered and enrols a
 * person, found by searching name, email, or host identifier. A person id can
 * also be typed directly. The server decides who may enrol and refuses
 * duplicates or missing enrolment methods; its message is shown as is.
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
    <form (submit)="search($event, searchInput)">
      <input
        #searchInput
        type="search"
        placeholder="Search people by name or email"
        aria-label="Search people"
      />
      <button type="submit" [disabled]="searching()">
        {{ searching() ? 'Searching…' : 'Search' }}
      </button>
    </form>
    @if (searched()) {
      @if (found().length === 0 && !searching()) {
        <p>No people match that search.</p>
      } @else {
        <ul aria-label="Search results">
          @for (person of found(); track person.id) {
            <li>
              {{ choiceLabel(person) }}
              <button type="button" (click)="choose(person)">Select</button>
            </li>
          }
        </ul>
        @if (foundHasMore()) {
          <button
            type="button"
            [disabled]="searching()"
            (click)="moreResults()"
          >
            More results
          </button>
        }
      }
    }
    <form (submit)="enrol($event, methodSelect)">
      @if (chosen()) {
        <p>Selected: {{ chosen() }}</p>
      }
      <input
        placeholder="Person id"
        aria-label="Person id"
        [value]="personId()"
        [disabled]="enrolling()"
        (input)="typeId($event)"
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
  /** Person id to enrol: chosen from the search or typed. */
  readonly personId = signal<string>('');
  /** Label of the person chosen from the search, shown above the id. */
  readonly chosen = signal<string>('');
  readonly found = signal<PersonSummaryDto[]>([]);
  readonly searching = signal<boolean>(false);
  readonly searched = signal<boolean>(false);
  readonly foundHasMore = signal<boolean>(false);
  /** Rows fetched so far, which is where the next page starts. */
  private fetched = 0;
  private foundFetched = 0;
  private searchText = '';
  private readonly lists = new LatestOnly();
  private readonly searches = new LatestOnly();

  ngOnInit(): Promise<void> {
    return this.reload();
  }

  label(row: SectionRegistrationDto): string {
    return rosterPersonLabel(row);
  }

  statusText(row: SectionRegistrationDto): string {
    return statusLabel(row.status);
  }

  choiceLabel(person: PersonSummaryDto): string {
    return personChoiceLabel(person);
  }

  /** Keeps the typed id; typing replaces any person chosen from the search. */
  typeId(event: Event): void {
    this.personId.set((event.target as HTMLInputElement).value);
    this.chosen.set('');
  }

  /** Puts a found person's id in the enrol form. */
  choose(person: PersonSummaryDto): void {
    this.personId.set(person.id);
    this.chosen.set(personChoiceLabel(person));
    this.error.set('');
  }

  /** Runs a new search from the first page. */
  search(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    this.searchText = input.value.trim();
    this.searched.set(true);
    this.searching.set(true);
    this.error.set('');
    return this.searches.load(
      () =>
        this.rosterService.searchPeople(this.searchText, {
          limit: PICKER_PAGE_SIZE,
          offset: 0,
        }),
      {
        onData: (page) => {
          this.found.set(page);
          this.foundFetched = page.length;
          this.foundHasMore.set(hasMorePages(page.length, PICKER_PAGE_SIZE));
        },
        onFailure: (failure) =>
          this.error.set(
            failure instanceof Error
              ? `Could not search people: ${failure.message}`
              : 'Could not search people.',
          ),
        onSettled: () => this.searching.set(false),
      },
    );
  }

  /** Adds the next page of the current search below the people shown. */
  moreResults(): Promise<void> {
    this.searching.set(true);
    return this.searches.load(
      () =>
        this.rosterService.searchPeople(this.searchText, {
          limit: PICKER_PAGE_SIZE,
          offset: this.foundFetched,
        }),
      {
        onData: (page) => {
          this.found.set(mergePage(this.found(), page));
          this.foundFetched += page.length;
          this.foundHasMore.set(hasMorePages(page.length, PICKER_PAGE_SIZE));
        },
        onFailure: (failure) =>
          this.error.set(
            failure instanceof Error
              ? `Could not load more people: ${failure.message}`
              : 'Could not load more people.',
          ),
        onSettled: () => this.searching.set(false),
      },
    );
  }

  /**
   * Enrols the typed person, then reloads the roster. A refused enrolment
   * keeps the server's message on screen and leaves the chosen person in place.
   */
  async enrol(event: Event, methodSelect: HTMLSelectElement): Promise<void> {
    event.preventDefault();
    this.error.set('');
    this.notice.set('');
    const problem = checkPersonId(this.personId());
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
        this.personId().trim(),
        method,
      );
      this.notice.set('Person enrolled.');
      this.personId.set('');
      this.chosen.set('');
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
