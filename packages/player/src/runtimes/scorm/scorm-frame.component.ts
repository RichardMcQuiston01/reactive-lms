import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  inject,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import type { ScormCmiDto } from '@reactive-lms/shared';
import { lmsFetch } from '../../http/lms-http';
import { REACTIVE_LMS_CONFIG } from '../../provide-reactive-lms';
import { ScormApiBridge } from './scorm-api-bridge';

/**
 * SCORM 1.2 player surface: installs `window.API`, then iframes the SCO.
 */
@Component({
  selector: 'rlms-scorm-frame',
  standalone: true,
  imports: [CommonModule],
  template: `
    <iframe
      *ngIf="iframeSrc"
      class="rlms-player-frame"
      [attr.src]="iframeSrc"
      [attr.title]="'SCORM module ' + courseModuleId"
      sandbox="allow-scripts allow-same-origin allow-forms"
    ></iframe>
  `,
})
export class ScormFrameComponent implements OnInit, OnDestroy {
  /** Attempt whose CMI is hydrated / committed. */
  @Input({ required: true }) attemptId = '';

  /** Extracted SCO URL (set on the iframe only after `window.API` exists). */
  @Input({ required: true }) contentUrl = '';

  /** Course module id used for the iframe title. */
  @Input() courseModuleId = '';

  /** Iframe src assigned after the API is installed. */
  iframeSrc: string | null = null;

  private readonly config = inject(REACTIVE_LMS_CONFIG);
  private bridge?: ScormApiBridge;

  /**
   * Hydrates CMI, installs `window.API`, then loads the SCO.
   */
  async ngOnInit(): Promise<void> {
    if (!this.attemptId || !this.contentUrl) {
      return;
    }
    this.bridge = new ScormApiBridge({
      getCmi: () =>
        lmsFetch<ScormCmiDto>(
          this.config,
          `/scorm/attempts/${this.attemptId}/cmi`,
        ),
      putCmi: async (body) => {
        await lmsFetch<ScormCmiDto>(
          this.config,
          `/scorm/attempts/${this.attemptId}/cmi`,
          {
            method: 'PUT',
            body: JSON.stringify(body),
          },
        );
      },
    });
    await this.bridge.install(window);
    this.iframeSrc = this.contentUrl;
  }

  /**
   * Drops `window.API` when the player is destroyed.
   */
  ngOnDestroy(): void {
    this.bridge?.uninstall(window);
  }
}
