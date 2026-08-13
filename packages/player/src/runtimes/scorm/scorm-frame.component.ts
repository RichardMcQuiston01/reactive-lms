import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  inject,
  type OnChanges,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import type { ScormCmiDto } from '@reactive-lms/shared';
import { lmsFetch } from '../../http/lms-http';
import { REACTIVE_LMS_CONFIG } from '../../provide-reactive-lms';
import { bindScormFrame } from './scorm-frame-bind';
import type { ScormApiBridge } from './scorm-api-bridge';

/**
 * SCORM 1.2 player surface: installs `window.API`, then iframes the SCO.
 */
@Component({
  selector: 'rlms-scorm-frame',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p class="rlms-player-error" *ngIf="error">{{ error }}</p>
    <iframe
      *ngIf="iframeSrc"
      class="rlms-player-frame"
      [attr.src]="iframeSrc"
      [attr.title]="'SCORM module ' + courseModuleId"
      sandbox="allow-scripts allow-same-origin allow-forms"
    ></iframe>
  `,
})
export class ScormFrameComponent implements OnInit, OnChanges, OnDestroy {
  /** Attempt whose CMI is hydrated / committed. */
  @Input({ required: true }) attemptId = '';

  /** Extracted SCO URL (set on the iframe only after `window.API` exists). */
  @Input({ required: true }) contentUrl = '';

  /** Course module id used for the iframe title. */
  @Input() courseModuleId = '';

  /** Iframe src assigned after the API is installed. */
  iframeSrc: string | null = null;

  /** Hydrate / bind error shown instead of a blank frame. */
  error: string | null = null;

  private readonly config = inject(REACTIVE_LMS_CONFIG);
  private bridge?: ScormApiBridge;
  private started = false;
  private attachGen = 0;

  /**
   * Hydrates CMI, installs `window.API`, then loads the SCO.
   */
  ngOnInit(): void {
    this.started = true;
    void this.attach();
  }

  /**
   * Re-installs the API and reloads the SCO when launch inputs change.
   */
  ngOnChanges(): void {
    if (this.started) {
      void this.attach();
    }
  }

  /**
   * Flushes a pending Commit and drops `window.API`.
   */
  ngOnDestroy(): void {
    this.attachGen += 1;
    this.bridge?.uninstall(window);
    this.bridge = undefined;
  }

  /**
   * Installs (or reinstalls) `window.API` for the current inputs.
   */
  private async attach(): Promise<void> {
    const gen = ++this.attachGen;
    this.iframeSrc = null;
    this.error = null;
    const attemptId = this.attemptId;
    const contentUrl = this.contentUrl;
    const result = await bindScormFrame({
      attemptId,
      contentUrl,
      host: window,
      previous: this.bridge,
      getCmi: () =>
        lmsFetch<ScormCmiDto>(
          this.config,
          `/scorm/attempts/${attemptId}/cmi`,
        ),
      putCmi: async (body) => {
        await lmsFetch<ScormCmiDto>(
          this.config,
          `/scorm/attempts/${attemptId}/cmi`,
          {
            method: 'PUT',
            body: JSON.stringify(body),
          },
        );
      },
    });
    if (gen !== this.attachGen) {
      result.bridge?.uninstall(window);
      return;
    }
    this.bridge = result.bridge;
    this.iframeSrc = result.iframeSrc;
    this.error = result.error;
  }
}
