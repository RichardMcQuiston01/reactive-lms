import { describe, expect, test } from 'bun:test';
import type { ScormCmiDto } from '@reactive-lms/shared';
import { bindScormFrame } from './scorm-frame-bind';

describe('bindScormFrame', () => {
  test('installs API and returns the SCO url after hydrate', async () => {
    const host: { API?: unknown } = {};
    const result = await bindScormFrame({
      attemptId: 'att-1',
      contentUrl: '/lms/content/sco.html',
      host,
      getCmi: async () => ({
        values: { 'cmi.core.lesson_location': 'p1' },
      }),
      putCmi: async () => undefined,
    });

    expect(result.error).toBeNull();
    expect(result.iframeSrc).toBe('/lms/content/sco.html');
    expect(host.API).toBeDefined();
    expect(result.bridge).toBeDefined();
  });

  test('surfaces a hydrate failure and does not set iframe src', async () => {
    const host: { API?: unknown } = {};
    const result = await bindScormFrame({
      attemptId: 'att-1',
      contentUrl: '/lms/content/sco.html',
      host,
      getCmi: async () => {
        throw new Error('Attempt not found.');
      },
      putCmi: async () => undefined,
    });

    expect(result.iframeSrc).toBeNull();
    expect(result.error).toBe('Attempt not found.');
    expect(host.API).toBeUndefined();
    expect(result.bridge).toBeUndefined();
  });

  test('rebind uninstalls the previous bridge and flushes a pending commit', async () => {
    const host: { API?: unknown } = {};
    const puts: ScormCmiDto[] = [];
    const first = await bindScormFrame({
      attemptId: 'att-1',
      contentUrl: '/lms/content/a.html',
      host,
      getCmi: async () => ({ values: {} }),
      putCmi: async (body) => {
        puts.push(body);
      },
    });

    const api = host.API;
    expect(api).toBeDefined();
    api?.LMSInitialize('');
    api?.LMSSetValue('cmi.core.lesson_location', 'keep-me');
    api?.LMSCommit('');

    const second = await bindScormFrame({
      attemptId: 'att-2',
      contentUrl: '/lms/content/b.html',
      host,
      previous: first.bridge,
      getCmi: async () => ({ values: {} }),
      putCmi: async (body) => {
        puts.push(body);
      },
    });

    expect(second.iframeSrc).toBe('/lms/content/b.html');
    expect(second.error).toBeNull();
    expect(
      puts.some((body) => body.values['cmi.core.lesson_location'] === 'keep-me'),
    ).toBe(true);
  });
});
