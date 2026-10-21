import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Entry screen for sections. There is no section list endpoint yet, so an
 * administrator opens a section by id; the module-tree screen does the rest.
 * A host can replace this screen with its own section picker.
 */
@Component({
  selector: 'rlms-admin-sections',
  standalone: true,
  template: `
    <h2>Sections</h2>
    <form (submit)="open($event, sectionId)">
      <input #sectionId placeholder="Section id" aria-label="Section id" />
      <button type="submit">Open modules</button>
    </form>
  `,
})
export class SectionsScreenComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  open(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const id = input.value.trim();
    if (id !== '') {
      void this.router.navigate([id, 'modules'], { relativeTo: this.route });
    }
  }
}
