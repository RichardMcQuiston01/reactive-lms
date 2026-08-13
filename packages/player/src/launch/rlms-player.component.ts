import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  inject,
  type OnChanges,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import type { CreateLaunchDto, LaunchDto } from '@reactive-lms/shared';
import { lmsFetch } from '../http/lms-http';
import { mapHtml5Message } from '../progress/map-html5-message';
import { REACTIVE_LMS_CONFIG } from '../provide-reactive-lms';

/**
 * Angular standalone player: launches a module and iframes `contentUrl`.
 * HTML5 content posts `{ source: 'reactive-lms', type: 'progress' | 'complete' }`.
 */
@Component({
  selector: 'rlms-player',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p class="rlms-player-error" *ngIf="error">{{ error }}</p>
    <iframe
      class="rlms-player-frame"
      [attr.src]="contentUrl"
      [attr.title]="'Course module ' + courseModuleId"
      sandbox="allow-scripts allow-same-origin allow-forms"
    ></iframe>
  `,
})
export class RlmsPlayerComponent implements OnInit, OnChanges, OnDestroy {
  /** Registration that owns the attempt. */
  @Input({ required: true }) registrationId = '';

  /** Course module to launch. */
  @Input({ required: true }) courseModuleId = '';

  /** Public iframe src after a successful launch. */
  contentUrl: string | null = null;

  /** Last launch or progress error, when any. */
  error: string | null = null;

  private readonly config = inject(REACTIVE_LMS_CONFIG);
  private activityNodeId?: string;
  private started = false;
  private abort?: AbortController;

  /**
   * Subscribes to content `postMessage` and launches the module.
   */
  ngOnInit(): void {
    window.addEventListener('message', this.onMessage);
    this.started = true;
    void this.launch();
  }

  /**
   * Relaunches when the host changes registration or module.
   */
  ngOnChanges(): void {
    if (this.started) {
      void this.launch();
    }
  }

  /**
   * Drops the message listener and in-flight requests.
   */
  ngOnDestroy(): void {
    window.removeEventListener('message', this.onMessage);
    this.abort?.abort();
  }

  private readonly onMessage = (event: MessageEvent): void => {
    const payload = mapHtml5Message(event.data, {
      registrationId: this.registrationId,
      courseModuleId: this.courseModuleId,
      activityNodeId: this.activityNodeId,
    });
    if (!payload) {
      return;
    }
    void this.postProgress(payload);
  };

  private async launch(): Promise<void> {
    if (!this.registrationId || !this.courseModuleId) {
      return;
    }
    this.abort?.abort();
    this.abort = new AbortController();
    this.error = null;
    const body: CreateLaunchDto = {
      courseModuleId: this.courseModuleId,
    };
    try {
      const descriptor = await lmsFetch<LaunchDto>(
        this.config,
        `/registrations/${this.registrationId}/launches`,
        {
          method: 'POST',
          body: JSON.stringify(body),
          signal: this.abort.signal,
        },
      );
      this.contentUrl = descriptor.contentUrl;
      const node = descriptor.runtimeConfig['activityNodeId'];
      this.activityNodeId = typeof node === 'string' ? node : undefined;
    } catch (error) {
      if (isAbort(error)) {
        return;
      }
      this.error = error instanceof Error ? error.message : 'Launch failed.';
    }
  }

  private async postProgress(payload: object): Promise<void> {
    try {
      await lmsFetch<void>(
        this.config,
        `/registrations/${this.registrationId}/progress`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Progress update failed.';
    }
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
