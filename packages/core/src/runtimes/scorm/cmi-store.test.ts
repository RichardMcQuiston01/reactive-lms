import { describe, expect, test } from 'bun:test';
import { CmiStore, mapCmiToProgress } from './cmi-store';

describe('CmiStore', () => {
  test('LMSInitialize accepts an empty string and enables get/set', () => {
    const store = new CmiStore({
      studentId: 'u1',
      studentName: 'Ada Lovelace',
    });
    expect(store.LMSInitialize('')).toBe('true');
    expect(store.LMSGetLastError()).toBe('0');
    expect(store.LMSGetValue('cmi.core.student_id')).toBe('u1');
    expect(store.LMSGetValue('cmi.core.student_name')).toBe('Ada Lovelace');
    expect(store.LMSGetValue('cmi.core.lesson_status')).toBe('not attempted');
    expect(store.LMSGetValue('cmi.core.entry')).toBe('ab-initio');
    expect(store.LMSGetValue('cmi.core.lesson_mode')).toBe('normal');
  });

  test('cannot initialize twice', () => {
    const store = new CmiStore();
    expect(store.LMSInitialize('')).toBe('true');
    expect(store.LMSInitialize('')).toBe('false');
    expect(store.LMSGetLastError()).toBe('101');
  });

  test('rejects a non-empty LMSInitialize argument with 201', () => {
    const store = new CmiStore();
    expect(store.LMSInitialize('nope')).toBe('false');
    expect(store.LMSGetLastError()).toBe('201');
    expect(store.LMSGetErrorString('201')).toMatch(/argument/i);
  });

  test('get and set before initialize return 301', () => {
    const store = new CmiStore();
    expect(store.LMSGetValue('cmi.core.lesson_location')).toBe('');
    expect(store.LMSGetLastError()).toBe('301');
    expect(store.LMSSetValue('cmi.core.lesson_location', 'p1')).toBe('false');
    expect(store.LMSGetLastError()).toBe('301');
    expect(store.LMSCommit('')).toBe('false');
    expect(store.LMSGetLastError()).toBe('301');
    expect(store.LMSFinish('')).toBe('false');
    expect(store.LMSGetLastError()).toBe('301');
  });

  test('cannot get or set after LMSFinish', () => {
    const store = new CmiStore();
    expect(store.LMSInitialize('')).toBe('true');
    expect(store.LMSFinish('')).toBe('true');
    expect(store.LMSGetLastError()).toBe('0');
    expect(store.LMSGetValue('cmi.core.lesson_status')).toBe('');
    expect(store.LMSGetLastError()).toBe('301');
    expect(store.LMSSetValue('cmi.core.lesson_status', 'completed')).toBe(
      'false',
    );
    expect(store.LMSGetLastError()).toBe('301');
    expect(store.LMSCommit('')).toBe('false');
    expect(store.LMSGetLastError()).toBe('301');
    expect(store.LMSInitialize('')).toBe('false');
    expect(store.LMSGetLastError()).toBe('101');
    expect(store.LMSFinish('')).toBe('false');
    expect(store.LMSGetLastError()).toBe('101');
  });

  test('sets and gets bookmark, status, score, and suspend_data', () => {
    const store = new CmiStore();
    store.LMSInitialize('');
    expect(store.LMSSetValue('cmi.core.lesson_location', 'page-2')).toBe(
      'true',
    );
    expect(store.LMSSetValue('cmi.core.lesson_status', 'incomplete')).toBe(
      'true',
    );
    expect(store.LMSSetValue('cmi.core.score.raw', '80')).toBe('true');
    expect(store.LMSSetValue('cmi.core.score.min', '0')).toBe('true');
    expect(store.LMSSetValue('cmi.core.score.max', '100')).toBe('true');
    expect(store.LMSSetValue('cmi.suspend_data', 'resume=1')).toBe('true');
    expect(store.LMSCommit('')).toBe('true');

    expect(store.LMSGetValue('cmi.core.lesson_location')).toBe('page-2');
    expect(store.LMSGetValue('cmi.core.lesson_status')).toBe('incomplete');
    expect(store.LMSGetValue('cmi.core.score.raw')).toBe('80');
    expect(store.LMSGetValue('cmi.suspend_data')).toBe('resume=1');
    expect(store.LMSGetLastError()).toBe('0');
  });

  test('read-only elements return 403 on set', () => {
    const store = new CmiStore({ studentId: 'u1' });
    store.LMSInitialize('');
    expect(store.LMSSetValue('cmi.core.student_id', 'hacked')).toBe('false');
    expect(store.LMSGetLastError()).toBe('403');
    expect(store.LMSGetValue('cmi.core.student_id')).toBe('u1');
  });

  test('write-only elements return 404 on get', () => {
    const store = new CmiStore();
    store.LMSInitialize('');
    expect(store.LMSSetValue('cmi.core.session_time', '0000:00:10.00')).toBe(
      'true',
    );
    expect(store.LMSGetValue('cmi.core.session_time')).toBe('');
    expect(store.LMSGetLastError()).toBe('404');
    expect(store.LMSSetValue('cmi.core.exit', 'suspend')).toBe('true');
    expect(store.LMSGetValue('cmi.core.exit')).toBe('');
    expect(store.LMSGetLastError()).toBe('404');
  });

  test('setting a keyword returns 402', () => {
    const store = new CmiStore();
    store.LMSInitialize('');
    expect(store.LMSSetValue('cmi.core', 'x')).toBe('false');
    expect(store.LMSGetLastError()).toBe('402');
    expect(store.LMSSetValue('cmi.core._children', 'x')).toBe('false');
    expect(store.LMSGetLastError()).toBe('402');
    expect(store.LMSSetValue('cmi.core.score', 'x')).toBe('false');
    expect(store.LMSGetLastError()).toBe('402');
  });

  test('unknown elements return 401', () => {
    const store = new CmiStore();
    store.LMSInitialize('');
    expect(store.LMSGetValue('cmi.core.not_a_field')).toBe('');
    expect(store.LMSGetLastError()).toBe('401');
    expect(store.LMSSetValue('cmi.core.not_a_field', 'x')).toBe('false');
    expect(store.LMSGetLastError()).toBe('401');
    expect(store.LMSGetErrorString('401')).toMatch(/implement/i);
  });

  test('invalid set values return 351', () => {
    const store = new CmiStore();
    store.LMSInitialize('');
    expect(store.LMSSetValue('cmi.core.lesson_status', 'won')).toBe('false');
    expect(store.LMSGetLastError()).toBe('351');
    expect(store.LMSSetValue('cmi.core.score.raw', 'not-a-number')).toBe(
      'false',
    );
    expect(store.LMSGetLastError()).toBe('351');
    expect(store.LMSSetValue('cmi.core.session_time', '10 minutes')).toBe(
      'false',
    );
    expect(store.LMSGetLastError()).toBe('351');
  });

  test('get of an uninitialized optional value returns 391', () => {
    const store = new CmiStore();
    store.LMSInitialize('');
    expect(store.LMSGetValue('cmi.core.score.raw')).toBe('');
    expect(store.LMSGetLastError()).toBe('391');
    expect(store.LMSGetValue('cmi.comments')).toBe('');
    expect(store.LMSGetLastError()).toBe('391');
  });

  test('hydrates previously persisted values after initialize', () => {
    const store = new CmiStore({
      values: {
        'cmi.core.lesson_location': 'bookmark',
        'cmi.core.lesson_status': 'incomplete',
        'cmi.suspend_data': 'saved',
        'cmi.core.entry': 'resume',
      },
    });
    store.LMSInitialize('');
    expect(store.LMSGetValue('cmi.core.lesson_location')).toBe('bookmark');
    expect(store.LMSGetValue('cmi.core.entry')).toBe('resume');
    expect(store.LMSGetValue('cmi.suspend_data')).toBe('saved');
  });

  test('snapshot omits write-only session fields used only this session', () => {
    const store = new CmiStore({ studentId: 'u1', studentName: 'Ada' });
    store.LMSInitialize('');
    store.LMSSetValue('cmi.core.lesson_status', 'completed');
    store.LMSSetValue('cmi.core.session_time', '0000:01:00.00');
    store.LMSSetValue('cmi.core.exit', 'suspend');
    const snap = store.snapshot();
    expect(snap['cmi.core.lesson_status']).toBe('completed');
    expect(snap['cmi.core.student_id']).toBe('u1');
    expect(snap['cmi.core.exit']).toBe('suspend');
    expect(snap['cmi.core.session_time']).toBe('0000:01:00.00');
  });

  test('stores objectives in extras-friendly keys', () => {
    const store = new CmiStore();
    store.LMSInitialize('');
    expect(store.LMSSetValue('cmi.objectives.0.id', 'obj-1')).toBe('true');
    expect(store.LMSSetValue('cmi.objectives.0.status', 'passed')).toBe(
      'true',
    );
    expect(store.LMSSetValue('cmi.objectives.0.score.raw', '1')).toBe('true');
    expect(store.LMSGetValue('cmi.objectives.0.id')).toBe('obj-1');
    expect(store.LMSGetValue('cmi.objectives._count')).toBe('1');
    expect(store.snapshot()['cmi.objectives.0.id']).toBe('obj-1');
  });

  test('LMSGetDiagnostic returns a non-empty string for known codes', () => {
    const store = new CmiStore();
    expect(store.LMSGetDiagnostic('0')).toBeTruthy();
    expect(store.LMSGetDiagnostic('101')).toBeTruthy();
    expect(store.LMSGetDiagnostic('301')).toBeTruthy();
  });
});

describe('mapCmiToProgress', () => {
  const ids = {
    registrationId: 'reg-1',
    courseModuleId: 'mod-1',
    activityNodeId: 'node-1',
  };

  test('maps lesson_status=completed and score.raw onto NormalizedProgress', () => {
    const progress = mapCmiToProgress(
      {
        'cmi.core.lesson_status': 'completed',
        'cmi.core.score.raw': '85',
        'cmi.core.score.min': '0',
        'cmi.core.score.max': '100',
        'cmi.core.lesson_location': 'end',
        'cmi.suspend_data': 'done',
        'cmi.core.total_time': '0000:05:00.00',
      },
      ids,
    );
    expect(progress).toMatchObject({
      registrationId: 'reg-1',
      courseModuleId: 'mod-1',
      activityNodeId: 'node-1',
      completionStatus: 'completed',
      successStatus: 'unknown',
      scoreRaw: 85,
      scoreMin: 0,
      scoreMax: 100,
      scoreScaled: 0.85,
      location: 'end',
      suspendData: 'done',
      totalTime: 'PT5M',
    });
    expect(progress.extras?.['cmi']).toMatchObject({
      'cmi.core.lesson_status': 'completed',
    });
  });

  test('maps passed and failed onto completion plus success', () => {
    expect(
      mapCmiToProgress({ 'cmi.core.lesson_status': 'passed' }, ids),
    ).toMatchObject({
      completionStatus: 'completed',
      successStatus: 'passed',
    });
    expect(
      mapCmiToProgress({ 'cmi.core.lesson_status': 'failed' }, ids),
    ).toMatchObject({
      completionStatus: 'completed',
      successStatus: 'failed',
    });
    expect(
      mapCmiToProgress({ 'cmi.core.lesson_status': 'incomplete' }, ids),
    ).toMatchObject({
      completionStatus: 'incomplete',
      successStatus: 'unknown',
    });
    expect(
      mapCmiToProgress({ 'cmi.core.lesson_status': 'not attempted' }, ids),
    ).toMatchObject({
      completionStatus: 'not_attempted',
      successStatus: 'unknown',
    });
  });
});
