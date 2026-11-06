import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import type { CourseModuleDto } from '@richardmcquiston01/reactive-lms-shared';
import {
  CONDITION_LABELS,
  CONDITION_TYPES,
  buildAvailability,
  conditionTargets,
  draftFromAvailability,
  emptyDraft,
  newCondition,
  summarizeConditions,
  type ConditionDraft,
  type ConditionType,
  type RuleMode,
  type RulesDraft,
} from '../modules/availability-editor';
import { ModuleAdminService } from '../modules/module-admin.service';

/**
 * Edits the availability rules of one module or block: a flat list of
 * conditions that must all hold (or any one of which must hold). The form
 * offers only valid choices; the server checks the rest, such as modules that
 * would wait on each other, and its message is shown as is.
 *
 * Rules that nest one group inside another cannot be shown here. They are
 * left untouched unless the administrator chooses to start over.
 */
@Component({
  selector: 'rlms-admin-availability-editor',
  standalone: true,
  styles: [
    `
      fieldset {
        border: 1px solid var(--rlms-admin-border-color, #d0d0d0);
        margin: 0.5rem 0;
      }
      .condition {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        padding: 0.25rem 0;
      }
      .error {
        color: var(--rlms-admin-danger-color, #b00020);
      }
      .muted {
        color: var(--rlms-admin-muted-color, #666);
        font-size: 0.85em;
      }
    `,
  ],
  template: `
    <section [attr.aria-label]="'Availability rules for ' + module().title">
      <h3>Rules for {{ module().title }}</h3>
      @if (current().length > 0) {
        <p class="muted">Now: {{ current().join('; ') }}</p>
      } @else {
        <p class="muted">Now: always open.</p>
      }

      @if (cannotEdit()) {
        <p role="status">{{ cannotEdit() }}</p>
        <button type="button" (click)="startOver()">
          Start over with simple rules
        </button>
        <button type="button" (click)="cancelled.emit()">Close</button>
      } @else {
        @if (draft().conditions.length === 0) {
          <p>No conditions: the {{ kind() }} is always open.</p>
        } @else {
          @if (draft().conditions.length > 1) {
            <label>
              Open when
              <select
                aria-label="How conditions combine"
                [value]="draft().mode"
                (change)="setMode(modeSelect.value)"
                #modeSelect
              >
                <option value="all">all of these hold</option>
                <option value="any">any one of these holds</option>
              </select>
            </label>
          }
          <fieldset>
            <legend>Conditions</legend>
            @for (condition of draft().conditions; track $index) {
              <div class="condition">
                <select
                  [attr.aria-label]="'Condition ' + ($index + 1) + ' type'"
                  [value]="condition.type"
                  (change)="setType($index, typeSelect.value)"
                  #typeSelect
                >
                  @for (type of types; track type) {
                    <option [value]="type" [selected]="type === condition.type">
                      {{ label(type) }}
                    </option>
                  }
                </select>
                @if (
                  condition.type === 'module_completed' ||
                  condition.type === 'min_score'
                ) {
                  <select
                    [attr.aria-label]="'Condition ' + ($index + 1) + ' module'"
                    [value]="condition.moduleId"
                    (change)="setField($index, 'moduleId', moduleSelect.value)"
                    #moduleSelect
                  >
                    <option value="">Choose a module…</option>
                    @for (target of targets(); track target.module.id) {
                      <option
                        [value]="target.module.id"
                        [selected]="target.module.id === condition.moduleId"
                      >
                        {{ indent(target.depth) }}{{ target.module.title }}
                      </option>
                    }
                  </select>
                }
                @if (condition.type === 'min_score') {
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    placeholder="Score %"
                    [attr.aria-label]="'Condition ' + ($index + 1) + ' score'"
                    [value]="condition.percent"
                    (input)="setField($index, 'percent', percentInput.value)"
                    #percentInput
                  />
                  <span class="muted">% or more</span>
                }
                @if (condition.type === 'date_window') {
                  <label>
                    From
                    <input
                      type="datetime-local"
                      [attr.aria-label]="'Condition ' + ($index + 1) + ' from'"
                      [value]="condition.from"
                      (input)="setField($index, 'from', fromInput.value)"
                      #fromInput
                    />
                  </label>
                  <label>
                    Until
                    <input
                      type="datetime-local"
                      [attr.aria-label]="'Condition ' + ($index + 1) + ' until'"
                      [value]="condition.until"
                      (input)="setField($index, 'until', untilInput.value)"
                      #untilInput
                    />
                  </label>
                }
                @if (condition.type === 'group_member') {
                  <input
                    placeholder="Group id"
                    [attr.aria-label]="
                      'Condition ' + ($index + 1) + ' group id'
                    "
                    [value]="condition.groupId"
                    (input)="setField($index, 'groupId', groupInput.value)"
                    #groupInput
                  />
                }
                <button
                  type="button"
                  [attr.aria-label]="'Remove condition ' + ($index + 1)"
                  (click)="removeCondition($index)"
                >
                  Remove
                </button>
              </div>
            }
          </fieldset>
        }

        <p>
          <label>
            Add a condition
            <select
              aria-label="Add a condition"
              (change)="add(addSelect.value); addSelect.value = ''"
              #addSelect
            >
              <option value="">Choose…</option>
              @for (type of types; track type) {
                <option [value]="type">{{ label(type) }}</option>
              }
            </select>
          </label>
        </p>

        @for (problem of problems(); track problem) {
          <p class="error" role="alert">{{ problem }}</p>
        }
        @if (serverError()) {
          <p class="error" role="alert">{{ serverError() }}</p>
        }

        <button type="button" [disabled]="busy()" (click)="save()">
          {{ busy() ? 'Saving…' : 'Save rules' }}
        </button>
        <button type="button" [disabled]="busy()" (click)="cancelled.emit()">
          Cancel
        </button>
      }
    </section>
  `,
})
export class AvailabilityEditorComponent implements OnInit {
  private readonly service = inject(ModuleAdminService);

  /** The module or block whose rules are edited. */
  readonly module = input.required<CourseModuleDto>();
  /** Every module of the section, to choose condition targets from. */
  readonly modules = input.required<readonly CourseModuleDto[]>();
  /** Emitted after the rules were saved. */
  readonly saved = output<void>();
  /** Emitted when the editor is closed without saving. */
  readonly cancelled = output<void>();

  readonly types: readonly ConditionType[] = CONDITION_TYPES;
  readonly draft = signal<RulesDraft>(emptyDraft());
  readonly problems = signal<string[]>([]);
  readonly serverError = signal<string>('');
  readonly busy = signal<boolean>(false);
  /** Why the stored rules cannot be edited here, or an empty string. */
  readonly cannotEdit = signal<string>('');

  readonly targets = computed(() =>
    conditionTargets(this.modules(), this.module()),
  );
  readonly current = computed(() =>
    summarizeConditions(this.module().availability, (id) => this.titleOf(id)),
  );

  ngOnInit(): void {
    const module = this.module();
    if (module.availabilityInvalid) {
      this.cannotEdit.set(
        'The stored rules for this module could not be read, so it cannot be opened until they are replaced.',
      );
      return;
    }
    const read = draftFromAvailability(module.availability);
    if (read.ok) {
      this.draft.set(read.draft);
    } else {
      this.cannotEdit.set(read.reason);
    }
  }

  /** "module" or "block", for wording. */
  kind(): string {
    return this.module().isBlock ? 'block' : 'module';
  }

  label(type: ConditionType): string {
    return CONDITION_LABELS[type];
  }

  indent(depth: number): string {
    return '  '.repeat(depth - 1);
  }

  /** Throws away unreadable or nested rules and begins an empty form. */
  startOver(): void {
    this.cannotEdit.set('');
    this.draft.set(emptyDraft());
  }

  setMode(value: string): void {
    const mode: RuleMode = value === 'any' ? 'any' : 'all';
    this.draft.update((draft) => ({ ...draft, mode }));
    this.clearMessages();
  }

  add(value: string): void {
    const type = CONDITION_TYPES.find((candidate) => candidate === value);
    if (type === undefined) {
      return;
    }
    this.draft.update((draft) => ({
      ...draft,
      conditions: [...draft.conditions, newCondition(type)],
    }));
    this.clearMessages();
  }

  removeCondition(index: number): void {
    this.draft.update((draft) => ({
      ...draft,
      conditions: draft.conditions.filter((_, position) => position !== index),
    }));
    this.clearMessages();
  }

  /** Changes a condition's type and starts it blank. */
  setType(index: number, value: string): void {
    const type = CONDITION_TYPES.find((candidate) => candidate === value);
    if (type === undefined) {
      return;
    }
    this.replaceCondition(index, () => newCondition(type));
  }

  setField(
    index: number,
    field: 'moduleId' | 'from' | 'until' | 'percent' | 'groupId',
    value: string,
  ): void {
    this.replaceCondition(index, (condition) => ({
      ...condition,
      [field]: value,
    }));
  }

  /**
   * Checks the form, then saves. Problems found here are listed without
   * sending anything; the server's refusal is shown as it came.
   */
  async save(): Promise<void> {
    this.clearMessages();
    const built = buildAvailability(
      this.draft(),
      new Set(this.targets().map((node) => node.module.id)),
    );
    if (!built.ok) {
      this.problems.set(built.errors);
      return;
    }
    this.busy.set(true);
    try {
      await this.service.setAvailability(this.module().id, built.value);
      this.saved.emit();
    } catch (failure) {
      this.serverError.set(
        failure instanceof Error
          ? failure.message
          : 'The rules could not be saved for an unknown reason.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private replaceCondition(
    index: number,
    change: (condition: ConditionDraft) => ConditionDraft,
  ): void {
    this.draft.update((draft) => ({
      ...draft,
      conditions: draft.conditions.map((condition, position) =>
        position === index ? change(condition) : condition,
      ),
    }));
    this.clearMessages();
  }

  private clearMessages(): void {
    this.problems.set([]);
    this.serverError.set('');
  }

  private titleOf(moduleId: string): string {
    return (
      this.modules().find((candidate) => candidate.id === moduleId)?.title ??
      moduleId
    );
  }
}
