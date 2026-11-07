import { Component, inject, signal, type OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LatestOnly } from '../modules/latest-only';
import {
  formatPatterns,
  formatResult,
  groupByAttempt,
  orDash,
  tallyResults,
  type AttemptAnswers,
} from '../modules/interactions';
import { RosterAdminService } from '../modules/roster-admin.service';

/**
 * The answers one person's SCOs reported (`cmi.interactions`), grouped by
 * attempt, so an administrator can see what was answered and how it was
 * marked.
 */
@Component({
  selector: 'rlms-admin-answers',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h2>Answers</h2>
    <p>
      <a [routerLink]="['../../']">Back to progress</a>
    </p>
    @if (error()) {
      <p role="alert" style="color: var(--rlms-admin-danger-color, #b00020)">
        {{ error() }}
      </p>
    }
    @if (loading()) {
      <p>Loading…</p>
    } @else if (attempts().length === 0 && !error()) {
      <p>No answers have been reported for this person.</p>
    } @else {
      @for (attempt of attempts(); track attempt.attemptId) {
        <section>
          <h3>Attempt {{ attempt.attemptNumber }}</h3>
          <p>{{ summary(attempt) }}</p>
          <table>
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Type</th>
                <th scope="col">Answer</th>
                <th scope="col">Correct answer</th>
                <th scope="col">Result</th>
                <th scope="col">Weight</th>
                <th scope="col">Time to answer</th>
              </tr>
            </thead>
            <tbody>
              @for (row of attempt.rows; track row.id) {
                <tr>
                  <td>{{ orDash(row.interactionId) }}</td>
                  <td>{{ orDash(row.interactionType) }}</td>
                  <td>{{ orDash(row.studentResponse) }}</td>
                  <td>{{ patterns(row.correctPatterns) }}</td>
                  <td>{{ result(row.result) }}</td>
                  <td>{{ orDash(row.weighting) }}</td>
                  <td>{{ orDash(row.latency) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }
    }
    <button type="button" [disabled]="loading()" (click)="refresh()">
      Refresh
    </button>
  `,
})
export class AnswersScreenComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly rosterService = inject(RosterAdminService);

  readonly registrationId: string =
    this.route.snapshot.paramMap.get('registrationId') ?? '';
  readonly attempts = signal<AttemptAnswers[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string>('');
  private readonly lists = new LatestOnly();

  ngOnInit(): Promise<void> {
    return this.reload();
  }

  orDash(value: string | undefined): string {
    return orDash(value);
  }

  patterns(values: readonly string[]): string {
    return formatPatterns(values);
  }

  result(value: string | undefined): string {
    return formatResult(value);
  }

  /** One line above each attempt's table: how many were marked right. */
  summary(attempt: AttemptAnswers): string {
    const { correct, wrong } = tallyResults(attempt.rows);
    return `${attempt.rows.length} answered; ${correct} correct, ${wrong} wrong.`;
  }

  /** Loads the answers again to pick up anything reported since. */
  refresh(): Promise<void> {
    this.error.set('');
    return this.reload();
  }

  private reload(): Promise<void> {
    this.loading.set(true);
    return this.lists.load(
      () => this.rosterService.listInteractions(this.registrationId),
      {
        onData: (rows) => this.attempts.set(groupByAttempt(rows)),
        onFailure: (failure) =>
          this.error.set(
            failure instanceof Error
              ? `Could not load answers: ${failure.message}`
              : 'Could not load answers.',
          ),
        onSettled: () => this.loading.set(false),
      },
    );
  }
}
