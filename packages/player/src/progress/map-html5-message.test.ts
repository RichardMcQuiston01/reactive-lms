import { describe, expect, test } from 'bun:test';
import { mapHtml5Message } from './map-html5-message';

const CONTEXT = {
  registrationId: 'reg-1',
  courseModuleId: 'mod-1',
  activityNodeId: 'node-1',
};

describe('mapHtml5Message', () => {
  test('maps a progress postMessage onto a progress payload', () => {
    const body = mapHtml5Message(
      {
        source: 'reactive-lms',
        type: 'progress',
        payload: {
          completionStatus: 'incomplete',
          progressMeasure: 0.4,
          location: 'p2',
        },
      },
      CONTEXT,
    );

    expect(body).toEqual({
      registrationId: 'reg-1',
      courseModuleId: 'mod-1',
      activityNodeId: 'node-1',
      completionStatus: 'incomplete',
      progressMeasure: 0.4,
      location: 'p2',
    });
  });

  test('maps complete to a completed payload', () => {
    const body = mapHtml5Message(
      { source: 'reactive-lms', type: 'complete' },
      CONTEXT,
    );

    expect(body).toEqual({
      registrationId: 'reg-1',
      courseModuleId: 'mod-1',
      activityNodeId: 'node-1',
      completionStatus: 'completed',
      successStatus: 'unknown',
    });
  });

  test('prefers payload activityNodeId on progress messages', () => {
    const body = mapHtml5Message(
      {
        source: 'reactive-lms',
        type: 'progress',
        payload: { activityNodeId: 'node-other', successStatus: 'passed' },
      },
      CONTEXT,
    );

    expect(body).toMatchObject({
      registrationId: 'reg-1',
      courseModuleId: 'mod-1',
      activityNodeId: 'node-other',
      successStatus: 'passed',
    });
  });

  test('returns null for unrelated messages', () => {
    expect(mapHtml5Message({ source: 'other', type: 'progress' }, CONTEXT))
      .toBeNull();
    expect(mapHtml5Message('not-an-object', CONTEXT)).toBeNull();
    expect(mapHtml5Message(null, CONTEXT)).toBeNull();
  });
});
