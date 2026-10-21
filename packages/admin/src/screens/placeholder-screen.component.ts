import { Component, Input } from '@angular/core';

/**
 * Stand-in for a screen that ships in 0.3.0. Replace it through
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
  @Input() title = 'This screen';
}
