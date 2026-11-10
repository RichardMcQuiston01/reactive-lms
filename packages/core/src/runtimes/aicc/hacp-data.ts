import type {
  CmiValues,
  HacpResponseDto,
} from '@richardmcquiston01/reactive-lms-shared';

/** HACP version answered when the content does not name a usable one. */
export const DEFAULT_HACP_VERSION = '3.5';

/** One `[Section]` of HACP data, with its lines exactly as sent. */
export interface HacpSection {
  /** Lower-cased section name. */
  name: string;
  lines: string[];
}

/** One CMI element the content asked to write. */
export interface CmiWrite {
  /** SCORM 1.2 element, such as `cmi.core.lesson_status`. */
  element: string;
  value: string;
  /** The AICC name the value came from, for error messages. */
  source: string;
}

/** What a `PutParam` means in CMI terms, and what in it cannot be read. */
export interface CmiWrites {
  writes: CmiWrite[];
  /** Reasons the data cannot be used. Empty when every value was understood. */
  problems: string[];
}

const STATUS_WORDS: Record<string, string> = {
  passed: 'passed',
  p: 'passed',
  completed: 'completed',
  c: 'completed',
  failed: 'failed',
  f: 'failed',
  incomplete: 'incomplete',
  i: 'incomplete',
  browsed: 'browsed',
  b: 'browsed',
  'not attempted': 'not attempted',
  n: 'not attempted',
};

const EXIT_WORDS: Record<string, string> = {
  'time-out': 'time-out',
  t: 'time-out',
  suspend: 'suspend',
  s: 'suspend',
  logout: 'logout',
  l: 'logout',
};

const STATUS_NAMES: Record<string, string> = {
  passed: 'Passed',
  completed: 'Completed',
  failed: 'Failed',
  incomplete: 'Incomplete',
  browsed: 'Browsed',
  'not attempted': 'Not Attempted',
};

const TIME_LIMIT_CODES: Record<string, string> = {
  'exit,message': 'E,M',
  'exit,no message': 'E,N',
  'continue,message': 'C,M',
  'continue,no message': 'C,N',
};

/**
 * Splits HACP data into its `[Section]` blocks. Lines before the first
 * section are ignored. Lines are kept as sent, so suspend data keeps its
 * spacing and any line that starts with `;`.
 *
 * @param text - The `aicc_data` of a request, or the data of a reply
 */
export function parseAiccData(text: string): HacpSection[] {
  const sections: HacpSection[] = [];
  let current: HacpSection | undefined;
  for (const line of text.split(/\r\n|\r|\n/)) {
    const heading = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (heading) {
      current = { name: (heading[1] ?? '').trim().toLowerCase(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

/** `key=value` lines of a section, keyed by lower-cased name. */
function keyValues(section: HacpSection): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of section.lines) {
    const equals = line.indexOf('=');
    if (equals > 0) {
      values.set(
        line.slice(0, equals).trim().toLowerCase(),
        line.slice(equals + 1).trim(),
      );
    }
  }
  return values;
}

/**
 * Reads the data of a `PutParam` as SCORM 1.2 CMI writes. Only what a unit may
 * set is read: `[Core]` location, status with its exit flag, score, and
 * session time, and `[Core_Lesson]` as suspend data. Other sections and keys,
 * including the ones only the LMS may set, are ignored. Vocabulary that has no
 * CMI meaning (a status or exit flag AICC does not define) is reported as a
 * problem; the values themselves are checked later by the CMI store.
 *
 * @param text - The `aicc_data` of a `PutParam`
 */
export function aiccDataToCmi(text: string): CmiWrites {
  const writes: CmiWrite[] = [];
  const problems: string[] = [];
  const sections = new Map<string, HacpSection>();
  for (const section of parseAiccData(text)) {
    sections.set(section.name, section);
  }

  const core = sections.get('core');
  if (core) {
    const values = keyValues(core);
    const location = values.get('lesson_location');
    if (location !== undefined) {
      writes.push({
        element: 'cmi.core.lesson_location',
        value: location,
        source: 'Lesson_Location',
      });
    }
    const status = values.get('lesson_status');
    if (status !== undefined && status !== '') {
      readStatus(status, writes, problems);
    }
    const score = values.get('score');
    if (score !== undefined && score !== '') {
      readScore(score, writes);
    }
    const time = values.get('time');
    if (time !== undefined && time !== '') {
      writes.push({
        element: 'cmi.core.session_time',
        value: time,
        source: 'Time',
      });
    }
  }

  const lesson = sections.get('core_lesson');
  if (lesson) {
    writes.push({
      element: 'cmi.suspend_data',
      value: lesson.lines.join('\n').trim(),
      source: '[Core_Lesson]',
    });
  }
  return { writes, problems };
}

/**
 * Reads `Lesson_Status`: the AICC status word, and the exit flag after a comma.
 * Each becomes a CMI write, or a problem when AICC does not define it.
 */
function readStatus(
  value: string,
  writes: CmiWrite[],
  problems: string[],
): void {
  const [statusPart = '', exitPart] = value.split(',');
  const status = STATUS_WORDS[statusPart.trim().toLowerCase()];
  if (status === undefined) {
    problems.push(
      `Lesson_Status "${value}" does not start with an AICC status (Passed, Completed, Failed, Incomplete, Browsed, or Not Attempted).`,
    );
    return;
  }
  writes.push({
    element: 'cmi.core.lesson_status',
    value: status,
    source: 'Lesson_Status',
  });
  if (exitPart === undefined || exitPart.trim() === '') {
    return;
  }
  const exit = EXIT_WORDS[exitPart.trim().toLowerCase()];
  if (exit === undefined) {
    problems.push(
      `Lesson_Status "${value}" ends with "${exitPart.trim()}", which is not an AICC exit flag (Time-out, Suspend, or Logout).`,
    );
    return;
  }
  writes.push({
    element: 'cmi.core.exit',
    value: exit,
    source: 'Lesson_Status exit flag',
  });
}

/** `Score=raw[,max[,min]]`: a blank part leaves that value alone. */
function readScore(value: string, writes: CmiWrite[]): void {
  const [raw, max, min] = value.split(',').map((part) => part.trim());
  const parts: Array<[string | undefined, string, string]> = [
    [raw, 'cmi.core.score.raw', 'Score (raw)'],
    [max, 'cmi.core.score.max', 'Score (max)'],
    [min, 'cmi.core.score.min', 'Score (min)'],
  ];
  for (const [part, element, source] of parts) {
    if (part !== undefined && part !== '') {
      writes.push({ element, value: part, source });
    }
  }
}

/**
 * Builds the data of a successful `GetParam` from the CMI values the LMS
 * holds: `[Core]`, `[Core_Lesson]`, `[Core_Vendor]` and `[Student_Data]`.
 *
 * @param values - Hydrated CMI snapshot for the attempt
 */
export function cmiToAiccData(values: CmiValues): string {
  const get = (element: string): string => values[element] ?? '';
  const status = get('cmi.core.lesson_status') || 'not attempted';
  const lines: string[] = [
    '[Core]',
    `Student_ID=${oneLine(get('cmi.core.student_id'))}`,
    `Student_Name=${oneLine(get('cmi.core.student_name'))}`,
    `Lesson_Location=${oneLine(get('cmi.core.lesson_location'))}`,
    `Credit=${get('cmi.core.credit') === 'no-credit' ? 'N' : 'C'}`,
    `Lesson_Status=${STATUS_NAMES[status] ?? status}`,
    `Score=${scoreOf(values)}`,
    `Time=${aiccTime(get('cmi.core.total_time'))}`,
    `Lesson_Mode=${modeName(get('cmi.core.lesson_mode'))}`,
    '[Core_Lesson]',
    get('cmi.suspend_data'),
  ];
  const launchData = get('cmi.launch_data');
  if (launchData !== '') {
    lines.push('[Core_Vendor]', launchData);
  }
  const student = studentData(values);
  if (student.length > 0) {
    lines.push('[Student_Data]', ...student);
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** The `Score` of a `GetParam`: raw, then max and min when there are any. */
function scoreOf(values: CmiValues): string {
  const raw = values['cmi.core.score.raw'] ?? '';
  if (raw === '') {
    return '';
  }
  const parts = [
    raw,
    values['cmi.core.score.max'] ?? '',
    values['cmi.core.score.min'] ?? '',
  ];
  while (parts.length > 1 && parts[parts.length - 1] === '') {
    parts.pop();
  }
  return parts.join(',');
}

/** The `[Student_Data]` lines: mastery score, time limit, and its action. */
function studentData(values: CmiValues): string[] {
  const lines: string[] = [];
  const mastery = values['cmi.student_data.mastery_score'] ?? '';
  if (mastery !== '') {
    lines.push(`Mastery_Score=${mastery}`);
  }
  const maxTime = values['cmi.student_data.max_time_allowed'] ?? '';
  if (maxTime !== '') {
    lines.push(`Max_Time_Allowed=${aiccTime(maxTime)}`);
  }
  const action = values['cmi.student_data.time_limit_action'] ?? '';
  const code = TIME_LIMIT_CODES[action];
  if (code !== undefined) {
    lines.push(`Time_Limit_Action=${code}`);
  }
  return lines;
}

/**
 * A SCORM 1.2 timespan (`HHHH:MM:SS.SS`) as AICC `HH:MM:SS`, keeping the
 * fraction only when it is not zero.
 *
 * @param timespan - CMI timespan
 */
export function aiccTime(timespan: string): string {
  const match = /^(\d+):(\d\d):(\d\d)(?:\.(\d+))?$/.exec(timespan);
  if (!match) {
    return '00:00:00';
  }
  const hours = String(Number(match[1])).padStart(2, '0');
  const fraction = /[1-9]/.test(match[4] ?? '') ? `.${match[4]}` : '';
  return `${hours}:${match[2]}:${match[3]}${fraction}`;
}

/** The AICC name for a SCORM 1.2 lesson mode. */
function modeName(mode: string): string {
  if (mode === 'browse') {
    return 'Browse';
  }
  return mode === 'review' ? 'Review' : 'Normal';
}

/** A value on one line: a line break in it would start another key. */
function oneLine(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, ' ');
}

/**
 * The HACP version to answer with: the one the content sent when it looks like
 * a version number, otherwise {@link DEFAULT_HACP_VERSION}.
 *
 * @param requested - The `version` field of the request
 */
export function hacpVersionFor(requested: string | undefined): string {
  return requested !== undefined && /^\d+(?:\.\d+){0,2}$/.test(requested.trim())
    ? requested.trim()
    : DEFAULT_HACP_VERSION;
}

/**
 * Formats a reply as HACP plain text. Line breaks in the error text are
 * flattened so they cannot add keys to the reply.
 *
 * @param response - The reply to send
 */
export function formatHacpResponse(response: HacpResponseDto): string {
  const text = response.errorText.replace(/[\r\n]+/g, ' ').trim();
  return `error=${response.errorCode}\r\nerror_text=${text}\r\nversion=${response.version}\r\naicc_data=${response.aiccData}`;
}
