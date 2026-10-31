import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  ViewChild,
  inject,
  type ElementRef,
  type OnChanges,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import type {
  CreateLaunchDto,
  LaunchDto,
  NormalizedProgress,
} from '@richardmcquiston01/reactive-lms-shared';
import { lmsFetch } from '../http/lms-http';
import { SerialQueue } from '../http/serial-queue';
import { isContentFrameMessage } from '../progress/is-content-frame-message';
import { LaunchSession } from '../progress/launch-session';
import { REACTIVE_LMS_CONFIG } from '../provide-reactive-lms';
import { ScormFrameComponent } from '../runtimes/scorm/scorm-frame.component';

/**
 * Angular standalone player: launches a module and renders HTML5 or SCORM.
 * HTML5 content posts `{ source: 'reactive-lms', type: 'progress' | 'complete' }`.
 * SCORM 1.2 installs `window.API` then iframes the SCO.
 */
@Component({
  selector: 'rlms-player',
  standalone: true,
  imports: [CommonModule, ScormFrameComponent],
  template: `
    <p class="rlms-player-error" *ngIf="error">{{ error }}</p>
    <rlms-scorm-frame
      *ngIf="playerKind === 'scorm-frame' && contentUrl && attemptId"
      [attemptId]="attemptId"
      [contentUrl]="contentUrl"
      [courseModuleId]="courseModuleId"
    ></rlms-scorm-frame>
    <iframe
      *ngIf="playerKind !== 'scorm-frame'"
      #frame
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

  /** Player surface from the launch descriptor. */
  playerKind: string = 'iframe';

  /** Attempt id used by the SCORM CMI bridge. */
  attemptId: string | null = null;

  /** Last launch or progress error, when any. */
  error: string | null = null;

  /** Content iframe used to validate `postMessage` source. */
  @ViewChild('frame') frame?: ElementRef<HTMLIFrameElement>;

  private readonly config = inject(REACTIVE_LMS_CONFIG);
  /** Which launch the frame belongs to; messages speak only for that launch. */
  private readonly session = new LaunchSession();
  /** Keeps progress reports in the order the content sent them. */
  private readonly progressQueue = new SerialQueue();
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
    const contentUrl = this.session.contentUrl;
    if (
      !contentUrl ||
      !isContentFrameMessage(
        event,
        this.frame?.nativeElement.contentWindow,
        contentUrl,
        typeof location === 'undefined' ? undefined : location.href,
      )
    ) {
      return;
    }
    const payload = this.session.progressFor(event.data);
    if (!payload) {
      return;
    }
    void this.postProgress(payload);
  };

  private async launch(): Promise<void> {
    // The previous launch stops speaking and its frame goes away now, not when
    // the new launch finishes: until then its messages would be labelled with
    // the new inputs.
    const token = this.session.begin();
    this.contentUrl = null;
    this.attemptId = null;
    this.abort?.abort();
    if (!this.registrationId || !this.courseModuleId) {
      return;
    }
    this.abort = new AbortController();
    this.error = null;
    // Captured now: the inputs may change again while the request is out.
    const registrationId = this.registrationId;
    const courseModuleId = this.courseModuleId;
    const body: CreateLaunchDto = { courseModuleId };
    try {
      const descriptor = await lmsFetch<LaunchDto>(
        this.config,
        `/registrations/${registrationId}/launches`,
        {
          method: 'POST',
          body: JSON.stringify(body),
          signal: this.abort.signal,
        },
      );
      const node = descriptor.runtimeConfig['activityNodeId'];
      const applied = this.session.ready(token, {
        registrationId,
        courseModuleId,
        activityNodeId: typeof node === 'string' ? node : undefined,
        contentUrl: descriptor.contentUrl,
      });
      if (!applied) {
        return;
      }
      this.contentUrl = descriptor.contentUrl;
      this.playerKind = descriptor.playerKind;
      this.attemptId = descriptor.attemptId;
    } catch (error) {
      if (isAbort(error)) {
        return;
      }
      this.error = error instanceof Error ? error.message : 'Launch failed.';
    }
  }

  private async postProgress(
    payload: Partial<NormalizedProgress>,
  ): Promise<void> {
    const registrationId = payload.registrationId;
    if (!registrationId) {
      return;
    }
    try {
      await this.progressQueue.enqueue(() =>
        lmsFetch<void>(
          this.config,
          `/registrations/${registrationId}/progress`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        ),
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
