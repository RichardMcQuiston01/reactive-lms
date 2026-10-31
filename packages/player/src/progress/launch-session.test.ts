import { describe, expect, test } from 'bun:test';
import { LaunchSession, type LaunchContext } from './launch-session';

const COMPLETE = { source: 'reactive-lms', type: 'complete' };

function context(overrides: Partial<LaunchContext> = {}): LaunchContext {
  return {
    registrationId: 'reg-A',
    courseModuleId: 'mod-A',
    activityNodeId: 'node-A',
    contentUrl: '/content/a/index.html',
    ...overrides,
  };
}

describe('LaunchSession', () => {
  test('ignores messages until a launch is ready', () => {
    const session = new LaunchSession();
    session.begin();

    expect(session.progressFor(COMPLETE)).toBeNull();
    expect(session.contentUrl).toBeNull();
  });

  test("reports with the launch's own registration, module, and node", () => {
    const session = new LaunchSession();
    session.ready(session.begin(), context());

    expect(session.progressFor(COMPLETE)).toMatchObject({
      registrationId: 'reg-A',
      courseModuleId: 'mod-A',
      activityNodeId: 'node-A',
      completionStatus: 'completed',
    });
    expect(session.contentUrl).toBe('/content/a/index.html');
  });

  test('the old frame is ignored from the moment the next launch begins', () => {
    const session = new LaunchSession();
    session.ready(session.begin(), context());

    // The host changes the module; B is still loading and A's frame is on screen.
    session.begin();

    expect(session.progressFor(COMPLETE)).toBeNull();
    expect(session.contentUrl).toBeNull();
  });

  test("once the next launch is ready, messages carry its ids, never the old launch's", () => {
    const session = new LaunchSession();
    session.ready(session.begin(), context());
    const next = session.begin();
    session.ready(
      next,
      context({
        registrationId: 'reg-B',
        courseModuleId: 'mod-B',
        activityNodeId: 'node-B',
        contentUrl: '/content/b/index.html',
      }),
    );

    expect(session.progressFor(COMPLETE)).toMatchObject({
      registrationId: 'reg-B',
      courseModuleId: 'mod-B',
      activityNodeId: 'node-B',
    });
  });

  test('a launch that finishes after a newer one began is dropped', () => {
    const session = new LaunchSession();
    const slow = session.begin();
    const newer = session.begin();

    expect(session.ready(slow, context())).toBe(false);
    expect(session.progressFor(COMPLETE)).toBeNull();
    expect(session.ready(newer, context({ courseModuleId: 'mod-B' }))).toBe(
      true,
    );
    expect(session.progressFor(COMPLETE)).toMatchObject({
      courseModuleId: 'mod-B',
    });
  });

  test('ignores messages that are not ReactiveLMS events', () => {
    const session = new LaunchSession();
    session.ready(session.begin(), context());

    expect(session.progressFor({ type: 'complete' })).toBeNull();
    expect(session.progressFor('hello')).toBeNull();
  });
});
