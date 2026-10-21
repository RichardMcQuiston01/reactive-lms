import type { NormalizedProgress } from './normalized-progress';

/**
 * Flat SCORM 1.2 CMI element map.
 */
export type CmiValues = Record<string, string>;

/**
 * Optional seed applied before {@link CmiStore.LMSInitialize}.
 */
export interface CmiStoreSeed {
  /** `cmi.core.student_id` (LMS-set, read-only). */
  studentId?: string;
  /** `cmi.core.student_name` (LMS-set, read-only). */
  studentName?: string;
  /** `cmi.core.lesson_mode` (`normal` / `browse` / `review`). */
  lessonMode?: string;
  /** `cmi.launch_data` from the manifest (`datafromlms`). */
  launchData?: string;
  /** Previously persisted CMI values (hydrate). */
  values?: CmiValues;
}

type SessionState = 'not_initialized' | 'running' | 'finished';

type ElementAccess = 'ro' | 'rw' | 'wo' | 'keyword';

interface ElementDef {
  access: ElementAccess;
  defaultValue?: string;
  optional?: boolean;
  validate?: (value: string) => boolean;
}

const CORE_CHILDREN =
  'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time';
const SCORE_CHILDREN = 'raw,min,max';
const OBJECTIVE_CHILDREN = 'id,score,status';

const LESSON_STATUSES = new Set([
  'passed',
  'completed',
  'failed',
  'incomplete',
  'browsed',
  'not attempted',
]);
const EXIT_VALUES = new Set(['time-out', 'suspend', 'logout', '']);
const TIMESPAN_RE = /^\d{2,4}:[0-5]\d:[0-5]\d(?:\.\d{1,2})?$/;
const DECIMAL_RE = /^-?\d+(?:\.\d+)?$/;

const ERROR_STRINGS: Record<string, string> = {
  '0': 'No Error',
  '101': 'General Exception',
  '201': 'Invalid argument error',
  '301': 'Not initialized',
  '351': 'General set failure',
  '391': 'No data stored',
  '401': 'Not implemented error',
  '402': 'Invalid set value, element is a keyword',
  '403': 'Element is read only',
  '404': 'Element is write only',
};

const ELEMENTS: Record<string, ElementDef> = {
  'cmi.core': { access: 'keyword' },
  'cmi.core._children': {
    access: 'keyword',
    defaultValue: CORE_CHILDREN,
  },
  'cmi.core.student_id': { access: 'ro', defaultValue: '' },
  'cmi.core.student_name': { access: 'ro', defaultValue: '' },
  'cmi.core.lesson_location': { access: 'rw', defaultValue: '' },
  'cmi.core.credit': { access: 'ro', defaultValue: 'credit' },
  'cmi.core.lesson_status': {
    access: 'rw',
    defaultValue: 'not attempted',
    validate: (value) => LESSON_STATUSES.has(value),
  },
  'cmi.core.entry': { access: 'ro', defaultValue: 'ab-initio' },
  'cmi.core.score': { access: 'keyword' },
  'cmi.core.score._children': {
    access: 'keyword',
    defaultValue: SCORE_CHILDREN,
  },
  'cmi.core.score.raw': {
    access: 'rw',
    optional: true,
    validate: isDecimal,
  },
  'cmi.core.score.min': {
    access: 'rw',
    optional: true,
    validate: isDecimal,
  },
  'cmi.core.score.max': {
    access: 'rw',
    optional: true,
    validate: isDecimal,
  },
  'cmi.core.total_time': { access: 'ro', defaultValue: '0000:00:00.00' },
  'cmi.core.lesson_mode': { access: 'ro', defaultValue: 'normal' },
  'cmi.core.exit': {
    access: 'wo',
    defaultValue: '',
    validate: (value) => EXIT_VALUES.has(value),
  },
  'cmi.core.session_time': {
    access: 'wo',
    optional: true,
    validate: isTimespan,
  },
  'cmi.suspend_data': { access: 'rw', defaultValue: '' },
  'cmi.launch_data': { access: 'ro', defaultValue: '' },
  'cmi.comments': { access: 'rw', optional: true },
  'cmi.objectives': { access: 'keyword' },
  'cmi.objectives._children': {
    access: 'keyword',
    defaultValue: OBJECTIVE_CHILDREN,
  },
  'cmi.objectives._count': { access: 'ro', defaultValue: '0' },
};

/**
 * In-memory SCORM 1.2 CMI model (`window.API` semantics).
 * Session rules: initialize once; get/set/commit only while running.
 */
export class CmiStore {
  private state: SessionState = 'not_initialized';
  private lastError = '0';
  private readonly data = new Map<string, string>();
  private readonly explicit = new Set<string>();

  /**
   * @param seed - LMS-provided student fields and optional hydrate map
   */
  constructor(seed: CmiStoreSeed = {}) {
    this.data.set('cmi.core.student_id', '');
    this.data.set('cmi.core.student_name', '');
    this.data.set('cmi.core.lesson_mode', 'normal');
    this.data.set('cmi.launch_data', '');
    this.data.set('cmi.core.credit', 'credit');
    this.data.set('cmi.core.lesson_status', 'not attempted');
    this.data.set('cmi.core.entry', 'ab-initio');
    this.data.set('cmi.core.lesson_location', '');
    this.data.set('cmi.core.total_time', '0000:00:00.00');
    this.data.set('cmi.suspend_data', '');
    if (seed.values) {
      this.loadValues(seed.values);
    }
    this.applyLmsOwned(seed);
  }

  /**
   * Merges persisted CMI values without changing session state.
   *
   * @param values - Flat CMI map from hydrate or commit
   */
  loadValues(values: CmiValues): void {
    for (const [key, value] of Object.entries(values)) {
      const text = coerceCmiValue(value);
      if (text === undefined) {
        continue;
      }
      this.data.set(key, text);
      this.explicit.add(key);
    }
  }

  /**
   * Overwrites LMS-owned keys from the current attempt / learner.
   * Call after hydrate or commit so persisted leftovers cannot stick.
   *
   * @param seed - Current student, mode, and launch_data
   */
  applyLmsOwned(seed: CmiStoreSeed): void {
    if (seed.studentId !== undefined) {
      this.data.set('cmi.core.student_id', seed.studentId);
    }
    if (seed.studentName !== undefined) {
      this.data.set('cmi.core.student_name', seed.studentName);
    }
    if (seed.lessonMode !== undefined) {
      this.data.set('cmi.core.lesson_mode', seed.lessonMode);
    }
    if (seed.launchData !== undefined) {
      this.data.set('cmi.launch_data', seed.launchData);
    }
  }

  /**
   * Persistable CMI snapshot (including this session's exit / session_time).
   */
  snapshot(): CmiValues {
    const values: CmiValues = {};
    for (const [key, value] of this.data) {
      if (key.endsWith('._children') || key.endsWith('._count')) {
        continue;
      }
      values[key] = value;
    }
    return values;
  }

  /**
   * True after a successful {@link LMSInitialize} and before {@link LMSFinish}.
   */
  isRunning(): boolean {
    return this.state === 'running';
  }

  /**
   * True after a successful {@link LMSFinish}.
   */
  isFinished(): boolean {
    return this.state === 'finished';
  }

  /**
   * Starts a communication session. `param` must be `""`.
   *
   * @param param - Empty string, `"null"`, `null`, or `undefined`
   */
  LMSInitialize(param?: string | null): 'true' | 'false' {
    if (!isEmptyParam(param)) {
      return this.fail('201');
    }
    if (this.state !== 'not_initialized') {
      return this.fail('101');
    }
    this.state = 'running';
    return this.ok();
  }

  /**
   * Ends the session. `param` must be `""`.
   *
   * @param param - Empty string, `"null"`, `null`, or `undefined`
   */
  LMSFinish(param?: string | null): 'true' | 'false' {
    if (!isEmptyParam(param)) {
      return this.fail('201');
    }
    if (this.state === 'not_initialized') {
      return this.fail('301');
    }
    if (this.state === 'finished') {
      return this.fail('101');
    }
    this.accumulateSessionTime();
    this.state = 'finished';
    return this.ok();
  }

  /**
   * Reads a CMI element. Returns `""` and sets an error on failure.
   *
   * @param element - Dot-path CMI element name
   */
  LMSGetValue(element: string): string {
    if (this.state !== 'running') {
      this.fail('301');
      return '';
    }
    if (!element) {
      this.fail('201');
      return '';
    }
    if (element === 'cmi.objectives._count') {
      this.lastError = '0';
      return String(this.objectiveCount());
    }
    const def = resolveElement(element);
    if (!def) {
      this.fail('401');
      return '';
    }
    if (def.access === 'wo') {
      this.fail('404');
      return '';
    }
    if (def.access === 'keyword') {
      if (def.defaultValue !== undefined) {
        this.lastError = '0';
        return def.defaultValue;
      }
      this.fail('401');
      return '';
    }
    if (def.optional && !this.explicit.has(element)) {
      this.fail('391');
      return '';
    }
    this.lastError = '0';
    return this.data.get(element) ?? def.defaultValue ?? '';
  }

  /**
   * Writes a CMI element.
   *
   * @param element - Dot-path CMI element name
   * @param value - New value (numbers are coerced to strings)
   */
  LMSSetValue(element: string, value: string | number): 'true' | 'false' {
    if (this.state !== 'running') {
      return this.fail('301');
    }
    if (!element) {
      return this.fail('201');
    }
    const text = coerceCmiValue(value);
    if (text === undefined) {
      return this.fail('351');
    }
    const def = resolveElement(element);
    if (!def) {
      return this.fail('401');
    }
    if (def.access === 'keyword') {
      return this.fail('402');
    }
    if (def.access === 'ro') {
      return this.fail('403');
    }
    if (def.validate && !def.validate(text)) {
      return this.fail('351');
    }
    this.data.set(element, text);
    this.explicit.add(element);
    return this.ok();
  }

  /**
   * Marks a successful in-memory commit. Persistence is the caller's job.
   *
   * @param param - Empty string, `"null"`, `null`, or `undefined`
   */
  LMSCommit(param?: string | null): 'true' | 'false' {
    if (!isEmptyParam(param)) {
      return this.fail('201');
    }
    if (this.state !== 'running') {
      return this.fail('301');
    }
    return this.ok();
  }

  /**
   * Last error code (`"0"` when the previous call succeeded).
   */
  LMSGetLastError(): string {
    return this.lastError;
  }

  /**
   * Human-readable string for an error code.
   *
   * @param errorCode - SCORM 1.2 error code
   */
  LMSGetErrorString(errorCode: string): string {
    return ERROR_STRINGS[errorCode] ?? 'Unknown error';
  }

  /**
   * Diagnostic text for an error code (same as {@link LMSGetErrorString} in v1).
   *
   * @param errorCode - SCORM 1.2 error code, or `""` for the last error
   */
  LMSGetDiagnostic(errorCode: string): string {
    const code = errorCode === '' ? this.lastError : errorCode;
    return this.LMSGetErrorString(code);
  }

  private objectiveCount(): number {
    let max = -1;
    for (const key of this.data.keys()) {
      const match = /^cmi\.objectives\.(\d+)\./.exec(key);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
    return max + 1;
  }

  private accumulateSessionTime(): void {
    const session = this.data.get('cmi.core.session_time');
    if (!session) {
      return;
    }
    const total = this.data.get('cmi.core.total_time') ?? '0000:00:00.00';
    this.data.set('cmi.core.total_time', addCmiTimespans(total, session));
    this.explicit.add('cmi.core.total_time');
  }

  private ok(): 'true' {
    this.lastError = '0';
    return 'true';
  }

  private fail(code: string): 'false' {
    this.lastError = code;
    return 'false';
  }
}

/**
 * Maps a SCORM 1.2 CMI snapshot onto {@link NormalizedProgress}.
 *
 * @param values - Flat CMI map
 * @param ids - Registration / module / activity node
 */
export function mapCmiToProgress(
  values: CmiValues,
  ids: {
    registrationId: string;
    courseModuleId: string;
    activityNodeId: string;
  },
): NormalizedProgress {
  const status = values['cmi.core.lesson_status'] ?? 'not attempted';
  const mapped = mapLessonStatus(status);
  const scoreRaw = parseNumber(values['cmi.core.score.raw']);
  const scoreMin = parseNumber(values['cmi.core.score.min']);
  const scoreMax = parseNumber(values['cmi.core.score.max']);
  const scoreScaled = scaleScore(scoreRaw, scoreMin, scoreMax);
  const totalTime = cmiTimespanToIso8601(values['cmi.core.total_time']);
  return {
    registrationId: ids.registrationId,
    courseModuleId: ids.courseModuleId,
    activityNodeId: ids.activityNodeId,
    completionStatus: mapped.completionStatus,
    successStatus: mapped.successStatus,
    scoreRaw,
    scoreMin,
    scoreMax,
    scoreScaled,
    location: emptyToUndefined(values['cmi.core.lesson_location']),
    suspendData: emptyToUndefined(values['cmi.suspend_data']),
    totalTime,
    extras: { cmi: values },
  };
}

/**
 * Adds two SCORM 1.2 timespans (`HHHH:MM:SS.SS`).
 *
 * @param left - Accumulated total
 * @param right - Session time to add
 */
export function addCmiTimespans(left: string, right: string): string {
  return formatCmiTimespan(parseCmiTimespan(left) + parseCmiTimespan(right));
}

/**
 * Converts a SCORM 1.2 timespan to an ISO-8601 duration.
 *
 * @param value - `HHHH:MM:SS.SS`
 */
export function cmiTimespanToIso8601(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = parseCmiTimespan(value);
  if (seconds <= 0) {
    return 'PT0S';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = roundHundredths(seconds % 60);
  const parts = ['PT'];
  if (hours > 0) {
    parts.push(`${hours}H`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}M`);
  }
  if (rest > 0) {
    parts.push(`${trimNumber(rest)}S`);
  }
  return parts.length === 1 ? 'PT0S' : parts.join('');
}

function resolveElement(element: string): ElementDef | undefined {
  const known = ELEMENTS[element];
  if (known) {
    return known;
  }
  const objective = /^cmi\.objectives\.(\d+)\.(id|status|score(?:\._children|\.raw|\.min|\.max)?)$/.exec(
    element,
  );
  if (!objective) {
    return undefined;
  }
  const field = objective[2];
  if (field === 'score') {
    return { access: 'keyword' };
  }
  if (field === 'score._children') {
    return { access: 'keyword', defaultValue: SCORE_CHILDREN };
  }
  if (field === 'id') {
    return { access: 'rw' };
  }
  if (field === 'status') {
    return {
      access: 'rw',
      validate: (value) => LESSON_STATUSES.has(value),
    };
  }
  return { access: 'rw', optional: true, validate: isDecimal };
}

function isEmptyParam(param: unknown): boolean {
  return (
    param === '' ||
    param === 'null' ||
    param === null ||
    param === undefined
  );
}

/**
 * Coerces a SCO-supplied CMI value to a string.
 * Finite numbers become decimal strings so `score.raw` survives.
 *
 * @param value - Runtime value from SetValue or persisted extras
 */
export function coerceCmiValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function isDecimal(value: string): boolean {
  return DECIMAL_RE.test(value);
}

function isTimespan(value: string): boolean {
  return TIMESPAN_RE.test(value);
}

function mapLessonStatus(status: string): Pick<
  NormalizedProgress,
  'completionStatus' | 'successStatus'
> {
  switch (status) {
    case 'passed':
      return { completionStatus: 'completed', successStatus: 'passed' };
    case 'failed':
      return { completionStatus: 'completed', successStatus: 'failed' };
    case 'completed':
      return { completionStatus: 'completed', successStatus: 'unknown' };
    case 'incomplete':
    case 'browsed':
      return { completionStatus: 'incomplete', successStatus: 'unknown' };
    case 'not attempted':
      return { completionStatus: 'not_attempted', successStatus: 'unknown' };
    default:
      return { completionStatus: 'unknown', successStatus: 'unknown' };
  }
}

function parseNumber(value: string | undefined): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function scaleScore(
  raw: number | undefined,
  min: number | undefined,
  max: number | undefined,
): number | undefined {
  if (typeof raw !== 'number') {
    return undefined;
  }
  if (typeof min === 'number' && typeof max === 'number' && max !== min) {
    return (raw - min) / (max - min);
  }
  if (typeof max === 'number' && max !== 0) {
    return raw / max;
  }
  return undefined;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

function parseCmiTimespan(value: string): number {
  const match = /^(\d{2,4}):([0-5]\d):([0-5]\d)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) {
    return 0;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ? Number(match[4].padEnd(2, '0')) / 100 : 0;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function formatCmiTimespan(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = roundHundredths(safe % 60);
  const whole = Math.floor(seconds);
  const hundredths = Math.round((seconds - whole) * 100);
  return `${pad(hours, 4)}:${pad(minutes, 2)}:${pad(whole, 2)}.${pad(hundredths, 2)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function roundHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}
