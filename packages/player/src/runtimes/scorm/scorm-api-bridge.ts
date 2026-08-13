import {
  CmiStore,
  type ScormCmiDto,
} from '@reactive-lms/shared';

/**
 * SCORM 1.2 `window.API` surface the SCO looks up via findAPI.
 */
export interface Scorm12Api {
  LMSInitialize(param?: string | null): string;
  LMSFinish(param?: string | null): string;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string | number): string;
  LMSCommit(param?: string | null): string;
  LMSGetLastError(): string;
  LMSGetErrorString(errorCode: string): string;
  LMSGetDiagnostic(errorCode: string): string;
}

/**
 * Window the player owns (parent of the SCO iframe), or a test double.
 */
export type ScormApiHost = Window | { API?: Scorm12Api };

/**
 * Extra options for {@link ScormApiBridge.install}.
 */
export interface ScormApiInstallOptions {
  /**
   * When provided, `window.API` is assigned only if this returns true
   * after hydrate. Stale attaches must return false.
   */
  shouldApply?: () => boolean;
}

/**
 * HTTP + timer hooks used by {@link ScormApiBridge}.
 */
export interface ScormApiBridgeOptions {
  /** Hydrate CMI before the SCO loads. */
  getCmi: () => Promise<ScormCmiDto>;
  /** Persist CMI on Commit / Finish. */
  putCmi: (body: ScormCmiDto) => Promise<void>;
  /** Commit debounce in milliseconds. Default 500. */
  debounceMs?: number;
  /** Injectable timer (tests). */
  setTimeoutFn?: (handler: () => void, ms: number) => unknown;
  /** Injectable timer clear (tests). */
  clearTimeoutFn?: (handle: unknown) => void;
}

/**
 * Installs `window.API` on the player window **before** the SCO iframe
 * loads. Get/Set stay local; Commit is debounced to the server.
 */
export class ScormApiBridge {
  private store = new CmiStore();
  private installedApi?: Scorm12Api;
  private timer: unknown;
  private readonly debounceMs: number;
  private readonly setTimeoutFn: (
    handler: () => void,
    ms: number,
  ) => unknown;
  private readonly clearTimeoutFn: (handle: unknown) => void;

  /**
   * @param options - Hydrate/commit hooks and optional debounce
   */
  constructor(private readonly options: ScormApiBridgeOptions) {
    this.debounceMs = options.debounceMs ?? 500;
    this.setTimeoutFn =
      options.setTimeoutFn ??
      ((handler, ms) => setTimeout(handler, ms));
    this.clearTimeoutFn =
      options.clearTimeoutFn ??
      ((handle) => {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      });
  }

  /**
   * Hydrates CMI and assigns `target.API`. Call before setting iframe `src`.
   *
   * @param target - Player window (parent of the SCO)
   * @param installOptions - Optional apply gate for stale attaches
   */
  async install(
    target: ScormApiHost,
    installOptions?: ScormApiInstallOptions,
  ): Promise<Scorm12Api> {
    const hydrated = await this.options.getCmi();
    this.store = new CmiStore({ values: hydrated.values ?? {} });
    const api: Scorm12Api = {
      LMSInitialize: (param) => this.store.LMSInitialize(param),
      LMSFinish: (param) => this.onFinish(param),
      LMSGetValue: (element) => this.store.LMSGetValue(element),
      LMSSetValue: (element, value) =>
        this.store.LMSSetValue(element, value),
      LMSCommit: (param) => this.onCommit(param),
      LMSGetLastError: () => this.store.LMSGetLastError(),
      LMSGetErrorString: (code) => this.store.LMSGetErrorString(code),
      LMSGetDiagnostic: (code) => this.store.LMSGetDiagnostic(code),
    };
    this.installedApi = api;
    if (installOptions?.shouldApply && !installOptions.shouldApply()) {
      return api;
    }
    asApiHost(target).API = api;
    return api;
  }

  /**
   * Flushes a pending debounced Commit, then removes `target.API`
   * only when this bridge still owns it.
   *
   * @param target - Player window previously passed to {@link install}
   */
  uninstall(target: ScormApiHost): void {
    this.flushPending();
    const host = asApiHost(target);
    if (this.installedApi && host.API === this.installedApi) {
      delete host.API;
    }
  }

  /**
   * Flushes a pending debounced commit immediately.
   */
  async flush(): Promise<void> {
    this.flushPending();
  }

  /**
   * Writes a pending Commit now (used by uninstall / destroy).
   */
  private flushPending(): void {
    if (this.timer === undefined) {
      return;
    }
    this.clearTimer();
    void this.options.putCmi({
      values: this.store.snapshot(),
      finished: this.store.isFinished(),
    });
  }

  private onCommit(param?: string | null): string {
    const result = this.store.LMSCommit(param);
    if (result === 'true') {
      this.scheduleCommit(false);
    }
    return result;
  }

  private onFinish(param?: string | null): string {
    const result = this.store.LMSFinish(param);
    if (result === 'true') {
      this.clearTimer();
      void this.options.putCmi({
        values: this.store.snapshot(),
        finished: true,
      });
    }
    return result;
  }

  private scheduleCommit(finished: boolean): void {
    this.clearTimer();
    this.timer = this.setTimeoutFn(() => {
      this.timer = undefined;
      void this.options.putCmi({
        values: this.store.snapshot(),
        finished,
      });
    }, this.debounceMs);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      this.clearTimeoutFn(this.timer);
      this.timer = undefined;
    }
  }
}

function asApiHost(target: ScormApiHost): { API?: Scorm12Api } {
  return target as { API?: Scorm12Api };
}
