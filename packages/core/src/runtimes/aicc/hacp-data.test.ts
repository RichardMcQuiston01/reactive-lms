import { describe, expect, test } from 'bun:test';
import {
  aiccDataToCmi,
  aiccTime,
  cmiToAiccData,
  formatHacpResponse,
  hacpVersionFor,
  parseAiccData,
} from './hacp-data';

const put = (...lines: string[]): string => `${lines.join('\r\n')}\r\n`;

describe('parseAiccData', () => {
  test('splits sections and keeps lines as sent', () => {
    const sections = parseAiccData(
      put('before', '[Core]', 'A=1', '[Core_Lesson]', '  spaced', ';semi'),
    );
    expect(sections.map((section) => section.name)).toEqual([
      'core',
      'core_lesson',
    ]);
    expect(sections[1]?.lines).toEqual(['  spaced', ';semi', '']);
  });
});

describe('aiccDataToCmi', () => {
  const writes = (text: string) => aiccDataToCmi(text).writes;
  const byElement = (text: string) =>
    Object.fromEntries(writes(text).map((w) => [w.element, w.value]));

  test('reads location, status, score, time, and suspend data', () => {
    expect(
      byElement(
        put(
          '[Core]',
          'Lesson_Location=page 4',
          'Lesson_Status=Incomplete',
          'Score=50,100,0',
          'Time=00:05:10',
          '[Core_Lesson]',
          'abc=1',
          'def=2',
        ),
      ),
    ).toEqual({
      'cmi.core.lesson_location': 'page 4',
      'cmi.core.lesson_status': 'incomplete',
      'cmi.core.score.raw': '50',
      'cmi.core.score.max': '100',
      'cmi.core.score.min': '0',
      'cmi.core.session_time': '00:05:10',
      'cmi.suspend_data': 'abc=1\ndef=2',
    });
  });

  test.each([
    ['Passed', 'passed'],
    ['p', 'passed'],
    ['COMPLETED', 'completed'],
    ['c', 'completed'],
    ['Failed', 'failed'],
    ['Incomplete', 'incomplete'],
    ['Browsed', 'browsed'],
    ['Not Attempted', 'not attempted'],
    ['n', 'not attempted'],
  ])('status %s is %s', (word, status) => {
    expect(
      byElement(put('[Core]', `Lesson_Status=${word}`))[
        'cmi.core.lesson_status'
      ],
    ).toBe(status);
  });

  test.each([
    ['Suspend', 'suspend'],
    ['s', 'suspend'],
    ['Time-out', 'time-out'],
    ['t', 'time-out'],
    ['Logout', 'logout'],
    ['L', 'logout'],
  ])('exit flag %s is %s', (flag, exit) => {
    const result = byElement(put('[Core]', `Lesson_Status=Incomplete,${flag}`));
    expect(result['cmi.core.exit']).toBe(exit);
    expect(result['cmi.core.lesson_status']).toBe('incomplete');
  });

  test('a score with only some parts writes only those', () => {
    expect(byElement(put('[Core]', 'Score=75'))).toEqual({
      'cmi.core.score.raw': '75',
    });
    expect(byElement(put('[Core]', 'Score=75,,10'))).toEqual({
      'cmi.core.score.raw': '75',
      'cmi.core.score.min': '10',
    });
  });

  test('blank values and a missing section write nothing, except an empty location', () => {
    expect(writes(put('[Core]', 'Lesson_Status=', 'Score=', 'Time='))).toEqual(
      [],
    );
    expect(byElement(put('[Core]', 'Lesson_Location='))).toEqual({
      'cmi.core.lesson_location': '',
    });
    expect(writes(put('[Other]', 'X=1'))).toEqual([]);
  });

  test('keys only the LMS sets, and unknown keys, are ignored', () => {
    expect(
      writes(
        put(
          '[Core]',
          'Student_ID=hacker',
          'Credit=N',
          'Lesson_Mode=Browse',
          'X=1',
        ),
      ),
    ).toEqual([]);
  });

  test('suspend data keeps a line that starts with a semicolon and trims its ends', () => {
    expect(
      byElement(put('[Core_Lesson]', '', ';keep', 'x', '', '[Core]'))[
        'cmi.suspend_data'
      ],
    ).toBe(';keep\nx');
  });

  test('names are read without regard to case', () => {
    expect(
      byElement(put('[CORE]', 'lesson_STATUS=passed'))[
        'cmi.core.lesson_status'
      ],
    ).toBe('passed');
  });

  test('a status or exit flag AICC does not define is a problem, not a write', () => {
    const status = aiccDataToCmi(put('[Core]', 'Lesson_Status=Done'));
    expect(status.writes).toEqual([]);
    expect(status.problems[0]).toContain('Lesson_Status "Done"');

    const exit = aiccDataToCmi(put('[Core]', 'Lesson_Status=Passed,Quit'));
    expect(exit.problems[0]).toContain('"Quit"');
    expect(exit.writes.map((w) => w.element)).toEqual([
      'cmi.core.lesson_status',
    ]);
  });
});

describe('cmiToAiccData', () => {
  const values = {
    'cmi.core.student_id': 'u1',
    'cmi.core.student_name': 'Lovelace, Ada',
    'cmi.core.lesson_location': 'page 4',
    'cmi.core.credit': 'credit',
    'cmi.core.lesson_status': 'incomplete',
    'cmi.core.score.raw': '50',
    'cmi.core.score.max': '100',
    'cmi.core.score.min': '0',
    'cmi.core.total_time': '0000:05:10.00',
    'cmi.core.lesson_mode': 'normal',
    'cmi.suspend_data': 'abc=1',
  };

  test('writes the core fields, suspend data, and only the sections that have content', () => {
    expect(cmiToAiccData(values)).toBe(
      put(
        '[Core]',
        'Student_ID=u1',
        'Student_Name=Lovelace, Ada',
        'Lesson_Location=page 4',
        'Credit=C',
        'Lesson_Status=Incomplete',
        'Score=50,100,0',
        'Time=00:05:10',
        'Lesson_Mode=Normal',
        '[Core_Lesson]',
        'abc=1',
      ),
    );
  });

  test('adds launch data and what the manifest set for the unit', () => {
    const text = cmiToAiccData({
      ...values,
      'cmi.launch_data': 'stage=2',
      'cmi.student_data.mastery_score': '80',
      'cmi.student_data.max_time_allowed': '0000:45:00',
      'cmi.student_data.time_limit_action': 'exit,message',
    });
    expect(text).toContain('[Core_Vendor]\r\nstage=2\r\n');
    expect(text).toContain(
      '[Student_Data]\r\nMastery_Score=80\r\nMax_Time_Allowed=00:45:00\r\nTime_Limit_Action=E,M\r\n',
    );
  });

  test('a new learner has no score and a "Not Attempted" status', () => {
    const text = cmiToAiccData({});
    expect(text).toContain('Lesson_Status=Not Attempted');
    expect(text).toContain('\r\nScore=\r\n');
    expect(text).toContain('Credit=C');
    expect(text).toContain('Time=00:00:00');
  });

  test('trims empty trailing score parts, and reports no credit and the mode', () => {
    const text = cmiToAiccData({
      ...values,
      'cmi.core.score.max': '',
      'cmi.core.score.min': '',
      'cmi.core.credit': 'no-credit',
      'cmi.core.lesson_mode': 'browse',
    });
    expect(text).toContain('Score=50\r\n');
    expect(text).toContain('Credit=N');
    expect(text).toContain('Lesson_Mode=Browse');
  });

  test('a line break in a value cannot start another key', () => {
    const text = cmiToAiccData({
      ...values,
      'cmi.core.student_name': 'Ada\r\nStudent_ID=evil',
    });
    expect(text).toContain('Student_Name=Ada Student_ID=evil\r\n');
  });
});

describe('aiccTime', () => {
  test('converts a timespan, keeping a non-zero fraction', () => {
    expect(aiccTime('0001:30:05.00')).toBe('01:30:05');
    expect(aiccTime('0001:30:05.50')).toBe('01:30:05.50');
    expect(aiccTime('0123:00:00')).toBe('123:00:00');
    expect(aiccTime('nonsense')).toBe('00:00:00');
  });
});

describe('hacpVersionFor and formatHacpResponse', () => {
  test('echoes a version number and otherwise answers 3.5', () => {
    expect(hacpVersionFor('3.4')).toBe('3.4');
    expect(hacpVersionFor(' 2.2 ')).toBe('2.2');
    expect(hacpVersionFor('x')).toBe('3.5');
    expect(hacpVersionFor(undefined)).toBe('3.5');
  });

  test('formats the reply and flattens line breaks in the error text', () => {
    expect(
      formatHacpResponse({
        errorCode: 1,
        errorText: 'Invalid Command: a\r\nerror=0',
        version: '3.5',
        aiccData: '',
      }),
    ).toBe(
      'error=1\r\nerror_text=Invalid Command: a error=0\r\nversion=3.5\r\naicc_data=',
    );
  });
});
