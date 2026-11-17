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
  /** `cmi.student_data.mastery_score` from the manifest (`masteryscore`). */
  masteryScore?: string;
  /** `cmi.student_data.max_time_allowed` from the manifest (`maxtimeallowed`). */
  maxTimeAllowed?: string;
  /** `cmi.student_data.time_limit_action` from the manifest (`timelimitaction`). */
  timeLimitAction?: string;
  /** Previously persisted CMI values (hydrate). */
  values?: CmiValues;
}

type SessionState = 'not_initialized' | 'running' | 'finished';

type ElementAccess = 'ro' | 'rw' | 'wo' | 'keyword';

interface ElementDef {
  access: ElementAccess;
  defaultValue?: string;
  validate?: (value: string) => boolean;
}

const CORE_CHILDREN =
  'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time';
const SCORE_CHILDREN = 'raw,min,max';
const STUDENT_DATA_CHILDREN =
  'mastery_score,max_time_allowed,time_limit_action';
const OBJECTIVE_CHILDREN = 'id,score,status';
const INTERACTION_CHILDREN =
  'id,objectives,time,type,correct_responses,weighting,student_response,result,latency';

const LESSON_STATUSES = new Set([
  'passed',
  'completed',
  'failed',
  'incomplete',
  'browsed',
  'not attempted',
]);
const INTERACTION_TYPES = new Set([
  'true-false',
  'choice',
  'fill-in',
  'matching',
  'performance',
  'sequencing',
  'likert',
  'numeric',
]);
const INTERACTION_RESULTS = new Set([
  'correct',
  'wrong',
  'unanticipated',
  'neutral',
]);
/** CMITime: a time of day, `HH:MM:SS` or `HH:MM:SS.SS`, on a 24-hour clock. */
const TIME_OF_DAY_RE = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,2})?$/;
/**
 * Highest array index accepted for objectives and interactions. The
 * specification sets no limit; this keeps one SCO from making the LMS hold or
 * store an unbounded list.
 */
export const MAX_CMI_ARRAY_INDEX = 9999;
const EXIT_VALUES = new Set(['time-out', 'suspend', 'logout', '']);
const TIMESPAN_RE = /^\d{2,4}:[0-5]\d:[0-5]\d(?:\.\d{1,2})?$/;
const DECIMAL_RE = /^-?\d+(?:\.\d+)?$/;

/**
 * SCORM 1.2 run-time error codes and their strings (RTE 3.4.1).
 */
const ERROR_STRINGS: Record<string, string> = {
  '0': 'No error',
  '101': 'General exception',
  '201': 'Invalid argument error',
  '202': 'Element cannot have children',
  '203': 'Element not an array - cannot have count',
  '301': 'Not initialized',
  '401': 'Not implemented error',
  '402': 'Invalid set value, element is a keyword',
  '403': 'Element is read only',
  '404': 'Element is write only',
  '405': 'Incorrect Data Type',
};

const ELEMENTS: Record<string, ElementDef> = {
  'cmi.core': { access: 'keyword' },
  'cmi.core._children': {
    access: 'keyword',
    defaultValue: CORE_CHILDREN,
  },
  'cmi.core.student_id': { access: 'ro', defaultValue: '' },
  'cmi.core.student_name': { access: 'ro', defaultValue: '' },
  'cmi.core.lesson_location': {
    access: 'rw',
    defaultValue: '',
    validate: (value) => value.length <= 255,
  },
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
    defaultValue: '',
    validate: isScore,
  },
  'cmi.core.score.min': {
    access: 'rw',
    defaultValue: '',
    validate: isScore,
  },
  'cmi.core.score.max': {
    access: 'rw',
    defaultValue: '',
    validate: isScore,
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
    validate: isTimespan,
  },
  'cmi.suspend_data': {
    access: 'rw',
    defaultValue: '',
    validate: (value) => value.length <= 4096,
  },
  'cmi.student_data': { access: 'keyword' },
  'cmi.student_data._children': {
    access: 'keyword',
    defaultValue: STUDENT_DATA_CHILDREN,
  },
  'cmi.student_data.mastery_score': { access: 'ro', defaultValue: '' },
  'cmi.student_data.max_time_allowed': { access: 'ro', defaultValue: '' },
  'cmi.student_data.time_limit_action': { access: 'ro', defaultValue: '' },
  'cmi.launch_data': { access: 'ro', defaultValue: '' },
  'cmi.comments': {
    access: 'rw',
    defaultValue: '',
    validate: (value) => value.length <= 4096,
  },
  'cmi.objectives': { access: 'keyword' },
  'cmi.objectives._children': {
    access: 'keyword',
    defaultValue: OBJECTIVE_CHILDREN,
  },
  'cmi.objectives._count': { access: 'keyword' },
  'cmi.interactions': { access: 'keyword' },
  'cmi.interactions._children': {
    access: 'keyword',
    defaultValue: INTERACTION_CHILDREN,
  },
  'cmi.interactions._count': { access: 'keyword' },
};

/**
 * In-memory SCORM 1.2 CMI model (`window.API` semantics).
 * Session rules: initialize once; get/set/commit only while running.
 */
export class CmiStore {
  private state: SessionState = 'not_initialized';
  private lastError = '0';
  private readonly data = new Map<string, string>();

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
    if (seed.masteryScore !== undefined) {
      this.data.set('cmi.student_data.mastery_score', seed.masteryScore);
    }
    if (seed.maxTimeAllowed !== undefined) {
      this.data.set('cmi.student_data.max_time_allowed', seed.maxTimeAllowed);
    }
    if (seed.timeLimitAction !== undefined) {
      this.data.set('cmi.student_data.time_limit_action', seed.timeLimitAction);
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
    if (this.state !== 'running') {
      return this.fail('301');
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
    const count = this.countOf(element);
    if (count !== undefined) {
      this.lastError = '0';
      return String(count);
    }
    const def = resolveElement(element);
    if (!def) {
      this.fail(missingElementError(element));
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
      return this.fail('201');
    }
    if (exceedsArrayLimit(element)) {
      return this.fail('201');
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
      return this.fail('405');
    }
    this.data.set(element, text);
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
    return ERROR_STRINGS[errorCode] ?? '';
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

  /**
   * The `_count` an array element reports: one more than the highest index
   * written so far, or `undefined` when `element` is not an array count.
   */
  private countOf(element: string): number | undefined {
    if (element === 'cmi.objectives._count') {
      return this.highestIndex(/^cmi\.objectives\.(\d+)\./) + 1;
    }
    if (element === 'cmi.interactions._count') {
      return this.highestIndex(/^cmi\.interactions\.(\d+)\./) + 1;
    }
    const nested =
      /^cmi\.interactions\.(\d+)\.(objectives|correct_responses)\._count$/.exec(
        element,
      );
    if (nested) {
      return (
        this.highestIndex(
          new RegExp(
            `^cmi\\.interactions\\.${nested[1]}\\.${nested[2]}\\.(\\d+)\\.`,
          ),
        ) + 1
      );
    }
    return undefined;
  }

  private highestIndex(pattern: RegExp): number {
    let max = -1;
    for (const key of this.data.keys()) {
      const match = pattern.exec(key);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
    return max;
  }

  private accumulateSessionTime(): void {
    const session = this.data.get('cmi.core.session_time');
    if (!session) {
      return;
    }
    const total = this.data.get('cmi.core.total_time') ?? '0000:00:00.00';
    this.data.set('cmi.core.total_time', addCmiTimespans(total, session));
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
export function cmiTimespanToIso8601(
  value: string | undefined,
): string | undefined {
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
  const interaction = resolveInteractionElement(element);
  if (interaction) {
    return interaction;
  }
  const objective =
    /^cmi\.objectives\.(\d+)\.(id|status|score(?:\._children|\.raw|\.min|\.max)?)$/.exec(
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
    return { access: 'rw', defaultValue: '', validate: (v) => v.length <= 255 };
  }
  if (field === 'status') {
    return {
      access: 'rw',
      validate: (value) => LESSON_STATUSES.has(value),
    };
  }
  return { access: 'rw', defaultValue: '', validate: isScore };
}

/**
 * `cmi.interactions.n.*` elements. They are write only: a SCO records what the
 * learner did but cannot read it back (the `_count`s are the exception, and
 * are answered before this is reached).
 */
function resolveInteractionElement(element: string): ElementDef | undefined {
  const nestedCount =
    /^cmi\.interactions\.\d+\.(?:objectives|correct_responses)\._count$/;
  if (nestedCount.test(element)) {
    return { access: 'keyword' };
  }
  const field = /^cmi\.interactions\.\d+\.(\w+)$/.exec(element)?.[1];
  switch (field) {
    case 'id':
      return { access: 'wo', validate: isIdentifier };
    case 'time':
      return { access: 'wo', validate: (v) => TIME_OF_DAY_RE.test(v) };
    case 'type':
      return { access: 'wo', validate: (v) => INTERACTION_TYPES.has(v) };
    case 'weighting':
      return { access: 'wo', validate: isDecimal };
    case 'student_response':
      return { access: 'wo', validate: isFeedback };
    case 'result':
      return {
        access: 'wo',
        validate: (v) => INTERACTION_RESULTS.has(v) || isDecimal(v),
      };
    case 'latency':
      return { access: 'wo', validate: isTimespan };
    default:
      break;
  }
  if (/^cmi\.interactions\.\d+\.objectives\.\d+\.id$/.test(element)) {
    return { access: 'wo', validate: isIdentifier };
  }
  if (
    /^cmi\.interactions\.\d+\.correct_responses\.\d+\.pattern$/.test(element)
  ) {
    return { access: 'wo', validate: isFeedback };
  }
  return undefined;
}

/**
 * CMIIdentifier is limited by length only. The specification also restricts
 * the characters, but authoring tools write ids with spaces and punctuation,
 * and refusing them would drop the interaction.
 */
function isIdentifier(value: string): boolean {
  return value.length <= 255;
}

/** CMIFeedback: kept to 255 characters; its per-type syntax is not checked. */
function isFeedback(value: string): boolean {
  return value.length <= 255;
}

/** True when a numeric array index in an objectives or interactions element is past the limit. */
function exceedsArrayLimit(element: string): boolean {
  if (
    !element.startsWith('cmi.interactions.') &&
    !element.startsWith('cmi.objectives.')
  ) {
    return false;
  }
  for (const match of element.matchAll(/\.(\d+)(?=\.)/g)) {
    if (Number(match[1]) > MAX_CMI_ARRAY_INDEX) {
      return true;
    }
  }
  return false;
}

function isEmptyParam(param: unknown): boolean {
  return (
    param === '' || param === 'null' || param === null || param === undefined
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

/** A score is a decimal from 0 to 100, or blank (CMIDecimal or CMIBlank). */
function isScore(value: string): boolean {
  if (value === '') {
    return true;
  }
  return isDecimal(value) && Number(value) >= 0 && Number(value) <= 100;
}

/**
 * The error for an element name that is not in the data model: `_children`
 * on an element that has none is 202, `_count` on one that is not an array
 * is 203, and anything else is not implemented (401).
 */
function missingElementError(element: string): string {
  if (
    element.endsWith('._children') &&
    resolveElement(stripSuffix(element, '._children'))
  ) {
    return '202';
  }
  if (
    element.endsWith('._count') &&
    resolveElement(stripSuffix(element, '._count'))
  ) {
    return '203';
  }
  return '401';
}

function stripSuffix(value: string, suffix: string): string {
  return value.slice(0, value.length - suffix.length);
}

function isTimespan(value: string): boolean {
  return TIMESPAN_RE.test(value);
}

/**
 * Applies the manifest's mastery score when a SCO finishes. SCORM 1.2 has the
 * LMS, not the SCO, decide pass or fail once a mastery score is set: if the
 * SCO reported a raw score, `cmi.core.lesson_status` becomes `passed` when the
 * score reaches the mastery score and `failed` when it does not, whatever the
 * SCO wrote (typically `completed`). Nothing changes without a mastery score,
 * without a raw score, or in browse mode, which is not for credit.
 *
 * A session that exits with `cmi.core.exit` = `suspend` has not finished: the
 * learner means to come back, and a partial score must not turn the unit into
 * `failed` meanwhile. The status the SCO wrote is kept, and the mastery score
 * is applied when a later session ends normally (`logout`, `time-out`, or no
 * exit value).
 *
 * @param values - CMI snapshot at the end of the session
 * @returns The snapshot, with `cmi.core.lesson_status` replaced when it applies
 */
export function applyMasteryScore(values: CmiValues): CmiValues {
  const mastery = parseNumber(values['cmi.student_data.mastery_score']);
  const raw = parseNumber(values['cmi.core.score.raw']);
  if (
    mastery === undefined ||
    raw === undefined ||
    values['cmi.core.lesson_mode'] === 'browse' ||
    values['cmi.core.exit'] === 'suspend'
  ) {
    return values;
  }
  return {
    ...values,
    'cmi.core.lesson_status': raw >= mastery ? 'passed' : 'failed',
  };
}

function mapLessonStatus(
  status: string,
): Pick<NormalizedProgress, 'completionStatus' | 'successStatus'> {
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

/**
 * Scales a raw score to 0..1. SCORM 1.2 defines `cmi.core.score.raw` as a
 * number from 0 to 100, so a SCO that gives no `min` or `max` is on that
 * scale: a raw score of 85 with no range is 0.85.
 */
function scaleScore(
  raw: number | undefined,
  min: number | undefined,
  max: number | undefined,
): number | undefined {
  if (typeof raw !== 'number') {
    return undefined;
  }
  const low = typeof min === 'number' ? min : 0;
  const high = typeof max === 'number' ? max : 100;
  if (high === low) {
    return undefined;
  }
  return (raw - low) / (high - low);
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
