import { describe, expect, test } from 'bun:test';
import { CmiStore } from './cmi-store';

/**
 * SCORM 1.2 Run-Time Environment conformance, written from the RTE book
 * (section 3, the API adapter and the data model). It checks the `window.API`
 * object a SCO talks to: the eight methods, the error codes they set, and
 * each data model element's access, vocabulary, and range.
 *
 * This is NOT the ADL Test Suite and does not replace it. It is the part of
 * that suite that can be run automatically in CI, so a regression is caught
 * before anyone runs the official tool.
 */

const STUDENT = { studentId: 'learner-1', studentName: 'Lovelace, Ada' };

/** A fresh API with a running session. */
function running(seed: ConstructorParameters<typeof CmiStore>[0] = STUDENT) {
  const api = new CmiStore(seed);
  expect(api.LMSInitialize('')).toBe('true');
  return api;
}

/** The result of a call and the error it left, as a SCO would see them. */
function outcome(api: CmiStore, result: string): [string, string] {
  return [result, api.LMSGetLastError()];
}

describe('SCORM 1.2 RTE: API adapter methods (RTE 3.3)', () => {
  test('LMSInitialize("") starts the session and returns the string "true"', () => {
    const api = new CmiStore(STUDENT);

    expect(outcome(api, api.LMSInitialize(''))).toEqual(['true', '0']);
  });

  test('LMSInitialize with a parameter fails with 201', () => {
    const api = new CmiStore(STUDENT);

    expect(outcome(api, api.LMSInitialize('anything'))).toEqual([
      'false',
      '201',
    ]);
  });

  test('LMSInitialize twice fails with 101', () => {
    const api = running();

    expect(outcome(api, api.LMSInitialize(''))).toEqual(['false', '101']);
  });

  test.each([
    ['LMSGetValue', (api: CmiStore) => api.LMSGetValue('cmi.core.student_id')],
    [
      'LMSSetValue',
      (api: CmiStore) => api.LMSSetValue('cmi.core.lesson_location', 'x'),
    ],
    ['LMSCommit', (api: CmiStore) => api.LMSCommit('')],
    ['LMSFinish', (api: CmiStore) => api.LMSFinish('')],
  ])('%s before LMSInitialize fails with 301', (_name, call) => {
    const api = new CmiStore(STUDENT);

    const result = call(api);

    expect(result === '' || result === 'false').toBe(true);
    expect(api.LMSGetLastError()).toBe('301');
  });

  test.each([
    ['LMSGetValue', (api: CmiStore) => api.LMSGetValue('cmi.core.student_id')],
    [
      'LMSSetValue',
      (api: CmiStore) => api.LMSSetValue('cmi.core.lesson_location', 'x'),
    ],
    ['LMSCommit', (api: CmiStore) => api.LMSCommit('')],
    ['LMSFinish', (api: CmiStore) => api.LMSFinish('')],
  ])('%s after LMSFinish fails with 301', (_name, call) => {
    const api = running();
    expect(api.LMSFinish('')).toBe('true');

    const result = call(api);

    expect(result === '' || result === 'false').toBe(true);
    expect(api.LMSGetLastError()).toBe('301');
  });

  test('LMSFinish("") and LMSCommit("") succeed in a running session', () => {
    const api = running();

    expect(outcome(api, api.LMSCommit(''))).toEqual(['true', '0']);
    expect(outcome(api, api.LMSFinish(''))).toEqual(['true', '0']);
  });

  test('LMSFinish and LMSCommit with a parameter fail with 201', () => {
    const api = running();

    expect(outcome(api, api.LMSCommit('x'))).toEqual(['false', '201']);
    expect(outcome(api, api.LMSFinish('x'))).toEqual(['false', '201']);
  });

  test('LMSGetLastError starts at "0", reports the last failure, and does not clear it', () => {
    const api = new CmiStore(STUDENT);
    expect(api.LMSGetLastError()).toBe('0');

    api.LMSGetValue('cmi.core.student_id');

    expect(api.LMSGetLastError()).toBe('301');
    expect(api.LMSGetLastError()).toBe('301');
  });

  test('every call replaces the last error, so a success resets it to "0"', () => {
    const api = running();
    api.LMSGetValue('cmi.nonsense');
    expect(api.LMSGetLastError()).toBe('401');

    api.LMSGetValue('cmi.core.student_id');

    expect(api.LMSGetLastError()).toBe('0');
  });

  test('LMSGetErrorString and LMSGetDiagnostic work before initialize and do not change the last error', () => {
    const api = new CmiStore(STUDENT);
    api.LMSGetValue('cmi.core.student_id');

    api.LMSGetErrorString('301');
    api.LMSGetDiagnostic('301');

    expect(api.LMSGetLastError()).toBe('301');
  });

  test.each([
    ['0', 'No error'],
    ['101', 'General exception'],
    ['201', 'Invalid argument error'],
    ['202', 'Element cannot have children'],
    ['203', 'Element not an array - cannot have count'],
    ['301', 'Not initialized'],
    ['401', 'Not implemented error'],
    ['402', 'Invalid set value, element is a keyword'],
    ['403', 'Element is read only'],
    ['404', 'Element is write only'],
    ['405', 'Incorrect data type'],
  ])('LMSGetErrorString(%s) is "%s"', (code, text) => {
    const api = new CmiStore(STUDENT);

    expect(api.LMSGetErrorString(code).toLowerCase()).toBe(text.toLowerCase());
  });

  test('LMSGetErrorString of a code that is not defined is an empty string', () => {
    const api = new CmiStore(STUDENT);

    expect(api.LMSGetErrorString('999')).toBe('');
    expect(api.LMSGetErrorString('abc')).toBe('');
  });

  test('LMSGetDiagnostic returns a string for any argument', () => {
    const api = new CmiStore(STUDENT);

    for (const argument of ['', '0', '301', '999', 'cmi.core.score.raw']) {
      expect(typeof api.LMSGetDiagnostic(argument)).toBe('string');
    }
  });
});

describe('SCORM 1.2 RTE: data model access and keywords (RTE 3.4)', () => {
  test('LMSGetValue("") fails with 201', () => {
    const api = running();

    expect(api.LMSGetValue('')).toBe('');
    expect(api.LMSGetLastError()).toBe('201');
  });

  test('an element that is not in the data model is 401 to read and to write', () => {
    const api = running();

    expect(api.LMSGetValue('cmi.nonsense')).toBe('');
    expect(api.LMSGetLastError()).toBe('401');
    expect(api.LMSSetValue('cmi.nonsense', 'x')).toBe('false');
    expect(api.LMSGetLastError()).toBe('401');
  });

  test.each([
    [
      'cmi.core._children',
      'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
    ],
    ['cmi.core.score._children', 'raw,min,max'],
    ['cmi.objectives._children', 'id,score,status'],
    [
      'cmi.student_data._children',
      'mastery_score,max_time_allowed,time_limit_action',
    ],
  ])('%s lists exactly "%s"', (element, children) => {
    const api = running();

    expect(api.LMSGetValue(element)).toBe(children);
    expect(api.LMSGetLastError()).toBe('0');
  });

  test.each([
    'cmi.core._children',
    'cmi.core.score._children',
    'cmi.objectives._children',
    'cmi.objectives._count',
  ])('writing the keyword %s fails with 402', (element) => {
    const api = running();

    expect(api.LMSSetValue(element, 'x')).toBe('false');
    expect(api.LMSGetLastError()).toBe('402');
  });

  test('_children on an element that has none fails with 202', () => {
    const api = running();

    expect(api.LMSGetValue('cmi.core.student_id._children')).toBe('');
    expect(api.LMSGetLastError()).toBe('202');
    expect(api.LMSGetValue('cmi.core.lesson_status._children')).toBe('');
    expect(api.LMSGetLastError()).toBe('202');
  });

  test('_count on an element that is not an array fails with 203', () => {
    const api = running();

    expect(api.LMSGetValue('cmi.core.student_id._count')).toBe('');
    expect(api.LMSGetLastError()).toBe('203');
    expect(api.LMSGetValue('cmi.suspend_data._count')).toBe('');
    expect(api.LMSGetLastError()).toBe('203');
  });

  test('cmi.objectives._count starts at 0 and grows as objectives are added', () => {
    const api = running();
    expect(api.LMSGetValue('cmi.objectives._count')).toBe('0');

    api.LMSSetValue('cmi.objectives.0.id', 'obj-a');
    api.LMSSetValue('cmi.objectives.1.id', 'obj-b');

    expect(api.LMSGetValue('cmi.objectives._count')).toBe('2');
  });
});

describe('SCORM 1.2 RTE: cmi.core elements (RTE 3.4.2)', () => {
  test.each([
    ['cmi.core.student_id', 'learner-1'],
    ['cmi.core.student_name', 'Lovelace, Ada'],
    ['cmi.core.credit', 'credit'],
    ['cmi.core.entry', 'ab-initio'],
    ['cmi.core.total_time', '0000:00:00.00'],
    ['cmi.core.lesson_mode', 'normal'],
    ['cmi.launch_data', ''],
  ])('%s is read only and starts as %p', (element, initial) => {
    const api = running();

    expect(api.LMSGetValue(element)).toBe(initial);
    expect(api.LMSGetLastError()).toBe('0');
    expect(api.LMSSetValue(element, 'changed')).toBe('false');
    expect(api.LMSGetLastError()).toBe('403');
    expect(api.LMSGetValue(element)).toBe(initial);
  });

  test.each(['cmi.core.exit', 'cmi.core.session_time'])(
    '%s is write only: reading it fails with 404',
    (element) => {
      const api = running();

      expect(api.LMSGetValue(element)).toBe('');
      expect(api.LMSGetLastError()).toBe('404');
    },
  );

  test('lesson_location holds up to 255 characters; 256 is a data type error', () => {
    const api = running();

    expect(api.LMSSetValue('cmi.core.lesson_location', 'a'.repeat(255))).toBe(
      'true',
    );
    expect(api.LMSGetValue('cmi.core.lesson_location')).toBe('a'.repeat(255));
    expect(api.LMSSetValue('cmi.core.lesson_location', 'a'.repeat(256))).toBe(
      'false',
    );
    expect(api.LMSGetLastError()).toBe('405');
  });

  test('lesson_status starts "not attempted" and accepts exactly the six vocabulary values', () => {
    const api = running();
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('not attempted');

    for (const status of [
      'passed',
      'completed',
      'failed',
      'incomplete',
      'browsed',
      'not attempted',
    ]) {
      expect(api.LMSSetValue('cmi.core.lesson_status', status)).toBe('true');
      expect(api.LMSGetValue('cmi.core.lesson_status')).toBe(status);
    }
  });

  test.each(['complete', 'Passed', 'PASSED', '', 'done', ' passed'])(
    'lesson_status %p is a data type error',
    (status) => {
      const api = running();

      expect(api.LMSSetValue('cmi.core.lesson_status', status)).toBe('false');
      expect(api.LMSGetLastError()).toBe('405');
    },
  );

  test.each(['cmi.core.score.raw', 'cmi.core.score.min', 'cmi.core.score.max'])(
    '%s is blank until set, not an error, and takes 0 to 100',
    (element) => {
      const api = running();
      expect(api.LMSGetValue(element)).toBe('');
      expect(api.LMSGetLastError()).toBe('0');

      for (const good of ['0', '100', '85', '85.5', '0.25']) {
        expect(api.LMSSetValue(element, good)).toBe('true');
        expect(api.LMSGetValue(element)).toBe(good);
      }
      expect(api.LMSSetValue(element, '')).toBe('true');
    },
  );

  test.each(['-1', '100.01', '101', 'abc', '1e2', '5%', ' 5', '5 '])(
    'a score of %p is a data type error',
    (bad) => {
      for (const element of [
        'cmi.core.score.raw',
        'cmi.core.score.min',
        'cmi.core.score.max',
      ]) {
        const api = running();

        expect(api.LMSSetValue(element, bad)).toBe('false');
        expect(api.LMSGetLastError()).toBe('405');
      }
    },
  );

  test('exit accepts time-out, suspend, logout, and empty; anything else is a data type error', () => {
    const api = running();

    for (const good of ['time-out', 'suspend', 'logout', '']) {
      expect(api.LMSSetValue('cmi.core.exit', good)).toBe('true');
    }
    expect(api.LMSSetValue('cmi.core.exit', 'quit')).toBe('false');
    expect(api.LMSGetLastError()).toBe('405');
  });

  test.each([
    '00:00:00',
    '01:30:00',
    '0001:30:00.50',
    '9999:59:59.99',
    '10:05:09.5',
  ])('session_time %p is a valid timespan', (value) => {
    const api = running();

    expect(api.LMSSetValue('cmi.core.session_time', value)).toBe('true');
  });

  test.each([
    '1:30',
    '99:99:99',
    '00:61:00',
    '00:00:61',
    'abc',
    '',
    '12:00:00.123',
    '-01:00:00',
  ])('session_time %p is a data type error', (value) => {
    const api = running();

    expect(api.LMSSetValue('cmi.core.session_time', value)).toBe('false');
    expect(api.LMSGetLastError()).toBe('405');
  });

  test('a value that is neither a string nor a number is an invalid argument', () => {
    const api = running();

    for (const bad of [null, undefined, {}, [], true, Number.NaN]) {
      expect(
        api.LMSSetValue('cmi.core.lesson_location', bad as unknown as string),
      ).toBe('false');
      expect(api.LMSGetLastError()).toBe('201');
    }
  });

  test('numbers passed to LMSSetValue are accepted as their string form', () => {
    const api = running();

    expect(api.LMSSetValue('cmi.core.score.raw', 85 as unknown as string)).toBe(
      'true',
    );
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('85');
  });
});

describe('SCORM 1.2 RTE: suspend_data (RTE 3.4.2)', () => {
  test('holds up to 4096 characters; 4097 is a data type error', () => {
    const api = running();

    expect(api.LMSGetValue('cmi.suspend_data')).toBe('');
    expect(api.LMSSetValue('cmi.suspend_data', 'x'.repeat(4096))).toBe('true');
    expect(api.LMSGetValue('cmi.suspend_data')).toBe('x'.repeat(4096));
    expect(api.LMSSetValue('cmi.suspend_data', 'x'.repeat(4097))).toBe('false');
    expect(api.LMSGetLastError()).toBe('405');
  });

  test('keeps characters a SCO commonly stores', () => {
    const api = running();
    const value = '{"page":3,"answers":[1,0,1],"note":"café – ünï"}';

    api.LMSSetValue('cmi.suspend_data', value);

    expect(api.LMSGetValue('cmi.suspend_data')).toBe(value);
  });
});

describe('SCORM 1.2 RTE: cmi.objectives (RTE 3.4.2)', () => {
  test('id, score, and status are read and written per objective', () => {
    const api = running();

    expect(api.LMSSetValue('cmi.objectives.0.id', 'obj-a')).toBe('true');
    expect(api.LMSSetValue('cmi.objectives.0.score.raw', '70')).toBe('true');
    expect(api.LMSSetValue('cmi.objectives.0.score.min', '0')).toBe('true');
    expect(api.LMSSetValue('cmi.objectives.0.score.max', '100')).toBe('true');
    expect(api.LMSSetValue('cmi.objectives.0.status', 'passed')).toBe('true');

    expect(api.LMSGetValue('cmi.objectives.0.id')).toBe('obj-a');
    expect(api.LMSGetValue('cmi.objectives.0.score.raw')).toBe('70');
    expect(api.LMSGetValue('cmi.objectives.0.status')).toBe('passed');
    expect(api.LMSGetValue('cmi.objectives.0.score._children')).toBe(
      'raw,min,max',
    );
  });

  test('an objective score outside 0 to 100 or a status outside the vocabulary is a data type error', () => {
    const api = running();

    expect(api.LMSSetValue('cmi.objectives.0.score.raw', '101')).toBe('false');
    expect(api.LMSGetLastError()).toBe('405');
    expect(api.LMSSetValue('cmi.objectives.0.status', 'complete')).toBe(
      'false',
    );
    expect(api.LMSGetLastError()).toBe('405');
  });

  test('an objective score that was never set reads as blank, not an error', () => {
    const api = running();
    api.LMSSetValue('cmi.objectives.0.id', 'obj-a');

    expect(api.LMSGetValue('cmi.objectives.0.score.raw')).toBe('');
    expect(api.LMSGetLastError()).toBe('0');
  });
});

describe('SCORM 1.2 RTE: cmi.student_data (RTE 3.4.2)', () => {
  test('the manifest values are read only', () => {
    const api = running({
      ...STUDENT,
      masteryScore: '80',
      maxTimeAllowed: '00:30:00',
      timeLimitAction: 'exit,message',
    });

    expect(api.LMSGetValue('cmi.student_data.mastery_score')).toBe('80');
    expect(api.LMSGetValue('cmi.student_data.max_time_allowed')).toBe(
      '00:30:00',
    );
    expect(api.LMSGetValue('cmi.student_data.time_limit_action')).toBe(
      'exit,message',
    );
    expect(api.LMSSetValue('cmi.student_data.mastery_score', '1')).toBe(
      'false',
    );
    expect(api.LMSGetLastError()).toBe('403');
  });
});

describe('SCORM 1.2 RTE: optional elements this LMS does not implement', () => {
  // The RTE makes these optional. An LMS that does not support one must answer
  // 401 (not implemented), which lets a SCO fall back instead of assuming the
  // data was stored.
  test.each([
    'cmi.interactions._count',
    'cmi.interactions.0.id',
    'cmi.student_preference.audio',
    'cmi.comments_from_lms',
  ])('%s answers 401', (element) => {
    const api = running();

    expect(api.LMSGetValue(element)).toBe('');
    expect(api.LMSGetLastError()).toBe('401');
    expect(api.LMSSetValue(element, '1')).toBe('false');
    expect(api.LMSGetLastError()).toBe('401');
  });
});

describe('SCORM 1.2 RTE: a session across launches', () => {
  test('values saved by a session are what the next one reads', () => {
    const first = running();
    first.LMSSetValue('cmi.core.lesson_location', 'page-3');
    first.LMSSetValue('cmi.suspend_data', 'state');
    first.LMSSetValue('cmi.core.lesson_status', 'incomplete');
    first.LMSSetValue('cmi.core.score.raw', '40');
    first.LMSFinish('');

    const second = new CmiStore({ ...STUDENT, values: first.snapshot() });
    second.LMSInitialize('');

    expect(second.LMSGetValue('cmi.core.lesson_location')).toBe('page-3');
    expect(second.LMSGetValue('cmi.suspend_data')).toBe('state');
    expect(second.LMSGetValue('cmi.core.lesson_status')).toBe('incomplete');
    expect(second.LMSGetValue('cmi.core.score.raw')).toBe('40');
  });

  test('session_time from the finished session is added to total_time', () => {
    const first = running();
    first.LMSSetValue('cmi.core.session_time', '00:30:00');
    first.LMSFinish('');

    const second = new CmiStore({ ...STUDENT, values: first.snapshot() });
    second.LMSInitialize('');

    expect(second.LMSGetValue('cmi.core.total_time')).toBe('0000:30:00.00');
  });

  test('values the LMS owns cannot be changed by what a SCO saved', () => {
    const second = new CmiStore({
      ...STUDENT,
      values: {
        'cmi.core.student_id': 'someone-else',
        'cmi.core.student_name': 'Someone Else',
      },
    });
    second.LMSInitialize('');

    expect(second.LMSGetValue('cmi.core.student_id')).toBe('learner-1');
    expect(second.LMSGetValue('cmi.core.student_name')).toBe('Lovelace, Ada');
  });
});
