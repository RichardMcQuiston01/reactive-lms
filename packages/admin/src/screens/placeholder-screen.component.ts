import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Stand-in for a screen that has not shipped yet. Replace it through
 * `ADMIN_SCREEN_OVERRIDES` or wait for the real screen.
 */
@Component({
  selector: 'rlms-admin-placeholder',
  standalone: true,
  template: `<p class="rlms-admin-placeholder">
    {{ title }} arrives in a later release.
  </p>`,
})
export class AdminPlaceholderScreenComponent {
  readonly title: string =
    (inject(ActivatedRoute).snapshot.data['title'] as string | undefined) ??
    'This screen';
}
