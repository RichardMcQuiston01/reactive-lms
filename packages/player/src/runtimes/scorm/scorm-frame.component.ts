import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  inject,
  type OnChanges,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import type { ScormCmiDto } from '@richardmcquiston01/reactive-lms-shared';
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
    <p class="rlms-player-error" *ngIf="saveError" role="alert">
      {{ saveError }}
      <button type="button" (click)="retrySave()">Retry now</button>
    </p>
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

  /** Set while the learner's progress could not be saved; cleared on success. */
  saveError: string | null = null;

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
    void this.bridge?.uninstall(window);
    this.bridge = undefined;
  }

  /**
   * Sends progress that failed to save again, at the learner's request.
   */
  retrySave(): void {
    void this.bridge?.retrySave();
  }

  /**
   * Installs (or reinstalls) `window.API` for the current inputs.
   */
  private async attach(): Promise<void> {
    const gen = ++this.attachGen;
    this.iframeSrc = null;
    this.error = null;
    this.saveError = null;
    const attemptId = this.attemptId;
    const contentUrl = this.contentUrl;
    const result = await bindScormFrame({
      attemptId,
      contentUrl,
      host: window,
      previous: this.bridge,
      shouldApply: () => gen === this.attachGen,
      onSaveError: (failure) => {
        if (gen === this.attachGen) {
          this.saveError = `Your progress could not be saved (${
            failure instanceof Error ? failure.message : 'unknown error'
          }). It will be sent again with your next save.`;
        }
      },
      onSaveRecovered: () => {
        if (gen === this.attachGen) {
          this.saveError = null;
        }
      },
      getCmi: () =>
        lmsFetch<ScormCmiDto>(this.config, `/scorm/attempts/${attemptId}/cmi`),
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
      void result.bridge?.uninstall(window);
      return;
    }
    this.bridge = result.bridge;
    this.iframeSrc = result.iframeSrc;
    this.error = result.error;
  }
}
