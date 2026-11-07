import { describe, expect, test } from 'bun:test';
import { extractInteractions } from './interaction-records';

describe('extractInteractions', () => {
  test('returns nothing when no interactions were reported', () => {
    expect(
      extractInteractions({ 'cmi.core.lesson_status': 'incomplete' }),
    ).toEqual([]);
  });

  test('groups elements by interaction and orders them by index', () => {
    const records = extractInteractions({
      'cmi.interactions.10.id': 'q11',
      'cmi.interactions.2.id': 'q3',
      'cmi.interactions.2.type': 'choice',
      'cmi.interactions.2.time': '10:11:12',
      'cmi.interactions.2.weighting': '2',
      'cmi.interactions.2.student_response': 'a',
      'cmi.interactions.2.result': 'wrong',
      'cmi.interactions.2.latency': '0000:00:07',
    });

    expect(records.map((record) => record.interactionIndex)).toEqual([2, 10]);
    expect(records[0]).toEqual({
      interactionIndex: 2,
      interactionId: 'q3',
      interactionType: 'choice',
      objectiveIds: [],
      correctPatterns: [],
      timeOfDay: '10:11:12',
      studentResponse: 'a',
      result: 'wrong',
      weighting: '2',
      latency: '0000:00:07',
    });
    expect(records[1]?.interactionType).toBeNull();
  });

  test('collects objectives and correct patterns in their own order', () => {
    const [record] = extractInteractions({
      'cmi.interactions.0.id': 'q1',
      'cmi.interactions.0.objectives.1.id': 'obj-b',
      'cmi.interactions.0.objectives.0.id': 'obj-a',
      'cmi.interactions.0.correct_responses.1.pattern': 'y',
      'cmi.interactions.0.correct_responses.0.pattern': 'x',
    });

    expect(record?.objectiveIds).toEqual(['obj-a', 'obj-b']);
    expect(record?.correctPatterns).toEqual(['x', 'y']);
  });

  test('ignores elements outside the interaction model', () => {
    const [record] = extractInteractions({
      'cmi.interactions.0.id': 'q1',
      'cmi.interactions.0.bogus': 'x',
      'cmi.interactions.0.objectives.0.pattern': 'x',
    });

    expect(record?.objectiveIds).toEqual([]);
    expect(record?.correctPatterns).toEqual([]);
  });
});
