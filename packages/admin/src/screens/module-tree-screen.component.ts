import {
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type {
  ContentPackageDto,
  CourseModuleDto,
} from '@richardmcquiston01/reactive-lms-shared';
import { CatalogAdminService } from '../modules/catalog-admin.service';
import { LatestOnly } from '../modules/latest-only';
import { ModuleAdminService } from '../modules/module-admin.service';
import {
  buildModuleTree,
  describeAvailability,
  flattenModuleTree,
  parentChoices,
  planSiblingMove,
  type ModuleTreeNode,
} from '../modules/module-tree';

/**
 * Module-tree screen for one section: shows modules and blocks as an indented
 * tree and lets an administrator add blocks, rename, reorder, move between
 * blocks, and remove. The server enforces every rule (depth, block-only
 * parents, non-empty blocks); this screen only offers valid choices and shows
 * the server's message when a request is refused.
 *
 * Styling uses `--rlms-admin-*` custom properties with neutral fallbacks.
 */
@Component({
  selector: 'rlms-admin-module-tree',
  standalone: true,
  styles: [
    `
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li.row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        padding: 0.35rem 0;
        border-bottom: 1px solid var(--rlms-admin-border-color, #d0d0d0);
      }
      .title {
        font-weight: 600;
      }
      .kind,
      .rules {
        color: var(--rlms-admin-muted-color, #666);
        font-size: 0.85em;
      }
      .error {
        color: var(--rlms-admin-danger-color, #b00020);
      }
      .actions {
        margin-left: auto;
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
      }
    `,
  ],
  template: `
    <h2>Modules</h2>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (loading()) {
      <p>Loading…</p>
    } @else if (rows().length === 0) {
      <p>This section has no modules yet. Add a block to start.</p>
    } @else {
      <ul>
        @for (row of rows(); track row.module.id) {
          <li
            class="row"
            [style.padding-left]="
              'calc(var(--rlms-admin-indent, 1.25rem) * ' +
              (row.depth - 1) +
              ')'
            "
          >
            @if (editingId() === row.module.id) {
              <input
                #renameInput
                [value]="row.module.title"
                aria-label="Title"
                (keydown.enter)="rename(row.module, renameInput.value)"
                (keydown.escape)="editingId.set(null)"
              />
              <button
                type="button"
                [disabled]="busy()"
                (click)="rename(row.module, renameInput.value)"
              >
                Save
              </button>
              <button type="button" (click)="editingId.set(null)">
                Cancel
              </button>
            } @else {
              <span class="title">{{ row.module.title }}</span>
              <span class="kind">{{
                row.module.isBlock ? 'Block' : 'Module'
              }}</span>
              <span class="rules">{{ rules(row.module) }}</span>
              <span class="actions">
                <button
                  type="button"
                  [disabled]="busy() || row.siblingIndex === 0"
                  [attr.aria-label]="'Move ' + row.module.title + ' earlier'"
                  (click)="shift(row.module, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  [disabled]="
                    busy() || row.siblingIndex === row.siblingCount - 1
                  "
                  [attr.aria-label]="'Move ' + row.module.title + ' later'"
                  (click)="shift(row.module, 1)"
                >
                  ↓
                </button>
                <select
                  #target
                  [disabled]="busy()"
                  [attr.aria-label]="'Move ' + row.module.title + ' into'"
                  (change)="
                    moveInto(row.module, target.value); target.value = ''
                  "
                >
                  <option value="">Move to…</option>
                  <option value="__top__">(top level)</option>
                  @for (
                    choice of choicesFor(row.module);
                    track choice.module.id
                  ) {
                    <option [value]="choice.module.id">
                      {{ indent(choice.depth) }}{{ choice.module.title }}
                    </option>
                  }
                </select>
                <button
                  type="button"
                  [disabled]="busy()"
                  (click)="editingId.set(row.module.id)"
                >
                  Rename
                </button>
                <button
                  type="button"
                  [disabled]="busy()"
                  (click)="remove(row.module)"
                >
                  Remove
                </button>
              </span>
            }
          </li>
        }
      </ul>
    }

    <form (submit)="place($event, placePackage, placeTitle, placeParent)">
      <h3>Place a package</h3>
      <select #placePackage aria-label="Package">
        <option value="">Choose a package…</option>
        @for (item of packages(); track item.id) {
          <option [value]="item.id">
            {{ item.title }} ({{ item.packageType }})
          </option>
        }
      </select>
      <input
        #placeTitle
        placeholder="Title (optional)"
        aria-label="Module title"
      />
      <select #placeParent aria-label="Place in block">
        <option value="">(top level)</option>
        @for (choice of blockParents(); track choice.module.id) {
          <option [value]="choice.module.id">
            {{ indent(choice.depth) }}{{ choice.module.title }}
          </option>
        }
      </select>
      <button type="submit" [disabled]="busy()">Place</button>
    </form>

    <form (submit)="addBlock($event, blockTitle, blockParent)">
      <h3>Add a block</h3>
      <input #blockTitle placeholder="Block title" aria-label="Block title" />
      <select #blockParent aria-label="Parent block">
        <option value="">(top level)</option>
        @for (choice of blockParents(); track choice.module.id) {
          <option [value]="choice.module.id">
            {{ indent(choice.depth) }}{{ choice.module.title }}
          </option>
        }
      </select>
      <button type="submit" [disabled]="busy()">Add block</button>
    </form>
  `,
})
export class ModuleTreeScreenComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ModuleAdminService);
  private readonly catalog = inject(CatalogAdminService);

  /** Section shown, taken from the `sectionId` route parameter. */
  readonly sectionId = signal<string>('');
  readonly modules = signal<CourseModuleDto[]>([]);
  readonly packages = signal<ContentPackageDto[]>([]);
  readonly loading = signal<boolean>(true);
  readonly busy = signal<boolean>(false);
  readonly error = signal<string>('');
  readonly editingId = signal<string | null>(null);
  private readonly lists = new LatestOnly();

  readonly rows = computed<ModuleTreeNode[]>(() =>
    flattenModuleTree(buildModuleTree(this.modules())),
  );
  readonly blockParents = computed<ModuleTreeNode[]>(() =>
    parentChoices(this.modules(), null),
  );

  ngOnInit(): void {
    void this.loadPackages();
    this.route.paramMap.subscribe((params) => {
      this.sectionId.set(params.get('sectionId') ?? '');
      void this.reload();
    });
  }

  /** Text for the availability column. */
  rules(module: CourseModuleDto): string {
    return describeAvailability(
      module.availability,
      module.availabilityInvalid,
    );
  }

  /** Blocks `module` could move into. */
  choicesFor(module: CourseModuleDto): ModuleTreeNode[] {
    return parentChoices(this.modules(), module.id).filter(
      (choice) => choice.module.id !== module.parentModuleId,
    );
  }

  /** Visual indent for select options. */
  indent(depth: number): string {
    return '  '.repeat(depth - 1);
  }

  shift(module: CourseModuleDto, direction: -1 | 1): Promise<void> {
    return this.run(() =>
      this.service.reorder(
        planSiblingMove(this.modules(), module.id, direction),
      ),
    );
  }

  moveInto(module: CourseModuleDto, target: string): Promise<void> {
    if (target === '') {
      return Promise.resolve();
    }
    return this.run(async () => {
      await this.service.moveTo(
        module.id,
        target === '__top__' ? null : target,
      );
    });
  }

  rename(module: CourseModuleDto, title: string): Promise<void> {
    const trimmed = title.trim();
    if (trimmed === '') {
      this.error.set('A title cannot be empty.');
      return Promise.resolve();
    }
    return this.run(async () => {
      await this.service.rename(module.id, trimmed);
      this.editingId.set(null);
    });
  }

  remove(module: CourseModuleDto): Promise<void> {
    return this.run(() => this.service.remove(module.id));
  }

  place(
    event: Event,
    packageSelect: HTMLSelectElement,
    titleInput: HTMLInputElement,
    parentSelect: HTMLSelectElement,
  ): Promise<void> {
    event.preventDefault();
    if (packageSelect.value === '') {
      this.error.set('Choose a package to place.');
      return Promise.resolve();
    }
    const title = titleInput.value.trim();
    return this.run(async () => {
      await this.service.place(
        this.sectionId(),
        packageSelect.value,
        title === '' ? null : title,
        parentSelect.value === '' ? null : parentSelect.value,
      );
      titleInput.value = '';
      packageSelect.value = '';
    });
  }

  addBlock(
    event: Event,
    titleInput: HTMLInputElement,
    parentSelect: HTMLSelectElement,
  ): Promise<void> {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (title === '') {
      this.error.set('A block needs a title.');
      return Promise.resolve();
    }
    return this.run(async () => {
      await this.service.addBlock(
        this.sectionId(),
        title,
        parentSelect.value === '' ? null : parentSelect.value,
      );
      titleInput.value = '';
    });
  }

  /**
   * Runs a change, then reloads. A refused request keeps the server's message
   * on screen and still reloads, so the tree matches what is stored.
   */
  private async run(change: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await change();
    } catch (failure) {
      this.error.set(
        failure instanceof Error
          ? failure.message
          : 'The request failed for an unknown reason.',
      );
    } finally {
      await this.reload();
      this.busy.set(false);
    }
  }

  /** Loads the package picker; a failure leaves it empty and says why. */
  private async loadPackages(): Promise<void> {
    try {
      this.packages.set(await this.catalog.listPackages());
    } catch (failure) {
      this.error.set(
        failure instanceof Error
          ? `Could not load packages: ${failure.message}`
          : 'Could not load packages.',
      );
    }
  }

  private async reload(): Promise<void> {
    const isCurrent = this.lists.begin();
    if (this.sectionId() === '') {
      this.loading.set(false);
      return;
    }
    try {
      const modules = await this.service.list(this.sectionId());
      if (isCurrent()) {
        this.modules.set(modules);
      }
    } catch (failure) {
      if (isCurrent()) {
        this.error.set(
          failure instanceof Error
            ? `Could not load modules: ${failure.message}`
            : 'Could not load modules.',
        );
      }
    } finally {
      if (isCurrent()) {
        this.loading.set(false);
      }
    }
  }
}
